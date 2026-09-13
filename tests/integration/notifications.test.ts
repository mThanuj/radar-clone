import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { withAudit } from "@/server/context";
import { recordActivity } from "@/server/activity/record";
import { dispatchPending } from "@/server/email/outbox";
import {
  closeAsDuplicate,
  createRadar,
  updateRadar,
} from "@/server/radars/mutations";
import type { Tx } from "@/server/tx";
import { createFixtures, destroyFixtures } from "./fixtures";

let fx: Awaited<ReturnType<typeof createFixtures>>;

beforeAll(async () => {
  await destroyFixtures();
  fx = await createFixtures("notify");
});

afterAll(async () => {
  await destroyFixtures();
});

beforeEach(async () => {
  // Each test asserts on counts, so start from a clean slate.
  await db.emailMessage.deleteMany({
    where: { recipientId: { in: [fx.user.id, fx.other.id] } },
  });
  await db.notification.deleteMany({
    where: { recipientId: { in: [fx.user.id, fx.other.id] } },
  });
  await db.notificationPreference.deleteMany({
    where: { userId: { in: [fx.user.id, fx.other.id] } },
  });
  await db.user.updateMany({
    where: { id: { in: [fx.user.id, fx.other.id] } },
    data: { emailEnabled: true },
  });
});

const newRadar = (title: string) =>
  createRadar({
    actorId: fx.user.id,
    input: {
      title,
      summary: "Filed by the notification suite.",
      classification: "TASK",
      componentId: fx.component.id,
    },
  });

const notificationsFor = (userId: string) =>
  db.notification.findMany({
    where: { recipientId: userId },
    select: { reason: true, radarId: true },
  });

const emailsFor = (userId: string) =>
  db.emailMessage.findMany({
    where: { recipientId: userId },
    select: { status: true, subject: true, notificationId: true },
  });

describe("fan-out", () => {
  it("notifies the new assignee and never the person doing the assigning", async () => {
    const radar = await newRadar("Assignment subject");

    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    const theirs = await notificationsFor(fx.other.id);
    expect(theirs).toHaveLength(1);
    expect(theirs[0].reason).toBe("ASSIGNED");

    // The actor is the originator and a watcher, so this is the real test:
    // being subscribed must not override "don't tell me what I just did".
    expect(await notificationsFor(fx.user.id)).toHaveLength(0);
    expect(await emailsFor(fx.user.id)).toHaveLength(0);

    const mail = await emailsFor(fx.other.id);
    expect(mail).toHaveLength(1);
    expect(mail[0].status).toBe("PENDING");
    expect(mail[0].subject).toContain("Assigned to you");
  });

  it("tells the previous assignee when the work moves off them", async () => {
    const radar = await newRadar("Handover subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });
    await db.notification.deleteMany({ where: { recipientId: fx.other.id } });

    const third = await db.user.create({
      data: {
        name: "Taker",
        email: `zz-test-taker-${Date.now()}@radar.local`,
        handle: `zz-test-taker-${Date.now()}`,
      },
      select: { id: true },
    });

    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: third.id },
    });

    // Only reachable through the "previousAssignee" audience, which fanOut
    // reads out of the diff — the one place a wrong field key goes unnoticed,
    // because being a watcher would still produce the vaguer SUBSCRIBED.
    const theirs = await notificationsFor(fx.other.id);
    expect(theirs).toHaveLength(1);
    expect(theirs[0].reason).toBe("UNASSIGNED");
  });

  it("gives each person the sharpest reason when one save does several things", async () => {
    const radar = await newRadar("Combined subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });
    await db.notification.deleteMany({ where: { recipientId: fx.other.id } });

    // Closing *and* raising priority at once: the assignee should hear the
    // closure, not the generic "radar you follow changed".
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { state: "CLOSED", substate: "SOFTWARE_CHANGED", priority: 1 },
    });

    const theirs = await notificationsFor(fx.other.id);
    expect(theirs).toHaveLength(1);
    expect(theirs[0].reason).toBe("RESOLVED");
  });

  it("says nothing to someone who muted the radar", async () => {
    const radar = await newRadar("Muted subject");
    await db.radarSubscriber.create({
      data: { radarId: radar.id, userId: fx.other.id, role: "CC", muted: true },
    });

    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { priority: 1 },
    });

    expect(await notificationsFor(fx.other.id)).toHaveLength(0);
    expect(await emailsFor(fx.other.id)).toHaveLength(0);
  });

  it("tells the canonical radar's followers about a duplicate", async () => {
    const canonical = await newRadar("Canonical subject");
    const dupe = await newRadar("Duplicate subject");

    await db.radarSubscriber.create({
      data: { radarId: canonical.id, userId: fx.other.id, role: "CC" },
    });

    await closeAsDuplicate({
      radarId: dupe.id,
      actorId: fx.user.id,
      duplicateOfNumber: canonical.number,
    });

    const theirs = await notificationsFor(fx.other.id);
    expect(theirs.map((n) => n.reason)).toContain("DUPLICATED");
    expect(theirs.some((n) => n.radarId === canonical.id)).toBe(true);
  });

  it("routes mentions to the person named and comments to everyone else", async () => {
    const radar = await newRadar("Mention subject");
    await db.radarSubscriber.create({
      data: { radarId: radar.id, userId: fx.other.id, role: "WATCHER" },
    });
    const third = await db.user.create({
      data: {
        name: "Third",
        email: `zz-test-third-${Date.now()}@radar.local`,
        handle: `zz-test-third-${Date.now()}`,
      },
      select: { id: true },
    });
    await db.radarSubscriber.create({
      data: { radarId: radar.id, userId: third.id, role: "WATCHER" },
    });

    await withAudit(fx.user.id, () =>
      db.$transaction((tx) =>
        recordActivity(tx as Tx, {
          radarId: radar.id,
          actorId: fx.user.id,
          kind: "COMMENT_ADDED",
          commentExcerpt: "hey @someone take a look",
          direct: [{ userId: fx.other.id, reason: "MENTIONED" }],
        }),
      ),
    );

    expect((await notificationsFor(fx.other.id))[0].reason).toBe("MENTIONED");
    expect((await notificationsFor(third.id))[0].reason).toBe("COMMENTED");
  });
});

describe("preferences", () => {
  it("keeps the inbox entry but drops the email when email is switched off", async () => {
    await db.user.update({
      where: { id: fx.other.id },
      data: { emailEnabled: false },
    });

    const radar = await newRadar("Email off subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    expect(await notificationsFor(fx.other.id)).toHaveLength(1);
    expect(await emailsFor(fx.other.id)).toHaveLength(0);
  });

  it("still emails a mention when everything else is switched off", async () => {
    await db.user.update({
      where: { id: fx.other.id },
      data: { emailEnabled: false },
    });
    await db.notificationPreference.create({
      data: {
        userId: fx.other.id,
        category: "DISCUSSION",
        inApp: false,
        email: false,
      },
    });

    const radar = await newRadar("Forced mention subject");
    await withAudit(fx.user.id, () =>
      db.$transaction((tx) =>
        recordActivity(tx as Tx, {
          radarId: radar.id,
          actorId: fx.user.id,
          kind: "COMMENT_ADDED",
          direct: [{ userId: fx.other.id, reason: "MENTIONED" }],
        }),
      ),
    );

    // Someone typed their handle: neither the category toggle nor the master
    // switch should be able to swallow that.
    expect(await notificationsFor(fx.other.id)).toHaveLength(1);
    expect(await emailsFor(fx.other.id)).toHaveLength(1);
  });

  it("honours a category opted out of email", async () => {
    await db.notificationPreference.create({
      data: {
        userId: fx.other.id,
        category: "ASSIGNMENT",
        inApp: true,
        email: false,
      },
    });

    const radar = await newRadar("Category opt-out subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    expect(await notificationsFor(fx.other.id)).toHaveLength(1);
    expect(await emailsFor(fx.other.id)).toHaveLength(0);
  });
});

describe("outbox", () => {
  it("sends queued mail and marks it sent", async () => {
    const radar = await newRadar("Dispatch subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    const result = await dispatchPending();
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const mail = await emailsFor(fx.other.id);
    expect(mail[0].status).toBe("SENT");
  });

  it("never sends the same message twice, even dispatching concurrently", async () => {
    const radar = await newRadar("Idempotency subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    // Two dispatchers racing is the real-world case: the post-response hook
    // and the cron sweep can fire at the same moment.
    const [a, b] = await Promise.all([dispatchPending(), dispatchPending()]);
    expect(a.sent + b.sent).toBe(1);

    const mail = await db.emailMessage.findMany({
      where: { recipientId: fx.other.id },
      select: { attempts: true, status: true },
    });
    expect(mail).toHaveLength(1);
    expect(mail[0].status).toBe("SENT");
    expect(mail[0].attempts).toBe(1);
  });

  it("takes back a claim whose sender died instead of losing the mail", async () => {
    // Queued directly rather than through a mutation: this is about the claim,
    // and an interactive transaction per test is the slow part of this suite.
    const queued = await db.emailMessage.create({
      data: {
        recipientId: fx.other.id,
        to: "stranded@radar.local",
        subject: "Stranded subject",
        template: "ASSIGNED",
        payload: {
          reason: "ASSIGNED",
          radar: { number: 100000001, title: "Stranded subject" },
          actorName: "Test",
          changes: [],
          radarUrl: "https://radar.invalid/radars/100000001",
          settingsUrl: "https://radar.invalid/settings/notifications",
          unsubscribeUrl: "https://radar.invalid/api/unsubscribe?token=x",
        },
      },
      select: { id: true },
    });

    const statusNow = async () =>
      (
        await db.emailMessage.findUniqueOrThrow({
          where: { id: queued.id },
          select: { status: true },
        })
      ).status;

    const age = (interval: string) =>
      db.$executeRawUnsafe(
        `UPDATE "EmailMessage"
            SET status = 'SENDING', attempts = 1,
                "updatedAt" = now() - interval '${interval}'
          WHERE id = $1`,
        queued.id,
      );

    // Claimed a moment ago: a concurrent sweep must not steal a send that is
    // merely slow.
    await age("0 seconds");
    await dispatchPending();
    expect(await statusNow()).toBe("SENDING");

    // Still SENDING an hour later means the process that claimed it is gone.
    // Nothing but this reclaim will ever pick the row up again.
    await age("1 hour");
    await dispatchPending();
    expect(await statusNow()).toBe("SENT");
  });

  it("ties each email to its notification so a retry cannot duplicate it", async () => {
    const radar = await newRadar("Linkage subject");
    await updateRadar({
      radarId: radar.id,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    const [mail] = await emailsFor(fx.other.id);
    expect(mail.notificationId).not.toBeNull();

    // The unique constraint is what makes redelivery safe; prove it exists.
    const [notification] = await db.notification.findMany({
      where: { recipientId: fx.other.id },
      select: { id: true },
    });
    await expect(
      db.emailMessage.create({
        data: {
          recipientId: fx.other.id,
          notificationId: notification.id,
          to: "duplicate@radar.local",
          subject: "should not be possible",
          template: "ASSIGNED",
          payload: {},
        },
      }),
    ).rejects.toThrow();
  });
});
