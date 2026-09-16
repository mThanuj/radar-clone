import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { chatAccessFor, requireChatAccess } from "@/server/chat/access";
import {
  deleteChatMessage,
  markChatRead,
  sendChatMessage,
} from "@/server/chat/mutations";
import { getChatPage, getChatUnreadCount } from "@/server/chat/queries";
import { createRadar, updateRadar } from "@/server/radars/mutations";
import { createFixtures, destroyFixtures } from "./fixtures";

/**
 * Chat is the only gated surface in the app, so these tests are about who is
 * refused as much as who is let in. They drive the mutations rather than the
 * actions because requireUser() reads headers(), which vitest cannot provide —
 * the actions are four lines of glue over exactly this.
 */
let fx: Awaited<ReturnType<typeof createFixtures>>;

beforeAll(async () => {
  await destroyFixtures();
  fx = await createFixtures("chat");
});

afterAll(async () => {
  await destroyFixtures();
});

const viewer = (id: string) => ({ id, isAdmin: false });
const adminViewer = (id: string) => ({ id, isAdmin: true });

let radarId: string;

beforeEach(async () => {
  // A fresh radar per test: membership is the subject, so no test may inherit
  // another's roster.
  const radar = await createRadar({
    actorId: fx.user.id,
    input: {
      title: "Chat subject",
      summary: "Filed by the chat suite.",
      classification: "TASK",
      componentId: fx.component.id,
    },
  });
  radarId = radar.id;
});

describe("access", () => {
  it("lets the originator in", async () => {
    const access = await chatAccessFor(radarId, viewer(fx.user.id));
    expect(access?.viewerRole).toBe("originator");
    expect(access?.memberIds).toEqual([fx.user.id]);
  });

  it("follows the assignment, and revokes on reassignment", async () => {
    await updateRadar({
      radarId,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });
    expect(await chatAccessFor(radarId, viewer(fx.other.id))).not.toBeNull();

    await updateRadar({
      radarId,
      actorId: fx.user.id,
      patch: { assigneeId: fx.third.id },
    });

    // Membership is evaluated live, so handing the radar on takes the chat with
    // it — the whole point of not snapshotting a member list.
    expect(await chatAccessFor(radarId, viewer(fx.other.id))).toBeNull();
    expect(await chatAccessFor(radarId, viewer(fx.third.id))).not.toBeNull();
  });

  it("admits a helper but not a CC or a watcher", async () => {
    await db.radarSubscriber.create({
      data: { radarId, userId: fx.other.id, role: "HELPER" },
    });
    await db.radarSubscriber.create({
      data: { radarId, userId: fx.third.id, role: "CC" },
    });
    await db.radarSubscriber.create({
      data: { radarId, userId: fx.admin.id, role: "WATCHER" },
    });

    expect(await chatAccessFor(radarId, viewer(fx.other.id))).not.toBeNull();
    // radarAudience() counts both of these as an audience. This chat does not.
    expect(await chatAccessFor(radarId, viewer(fx.third.id))).toBeNull();
    expect(await chatAccessFor(radarId, viewer(fx.admin.id))).toBeNull();
  });

  it("lets an admin read a radar they have no role on, without joining it", async () => {
    const access = await chatAccessFor(radarId, adminViewer(fx.admin.id));
    expect(access?.viewerRole).toBe("admin");
    // memberIds is also the realtime push list, so an oversight reader must not
    // be on it — otherwise every chat in the system lands on their channel.
    expect(access?.memberIds).not.toContain(fx.admin.id);
  });

  it("says the same thing to a stranger as to a missing radar", async () => {
    const stranger = await requireChatAccess(radarId, viewer(fx.third.id));
    const missing = await requireChatAccess("nope", viewer(fx.user.id));
    expect(stranger.ok).toBe(false);
    expect(missing.ok).toBe(false);
    expect(stranger.ok === false && stranger.error).toBe(
      missing.ok === false && missing.error,
    );
  });
});

describe("messages", () => {
  it("refuses a send from someone not on the radar", async () => {
    const result = await sendChatMessage({
      radarId,
      actor: viewer(fx.third.id),
      body: "let me in",
    });
    expect(result.ok).toBe(false);

    const access = await chatAccessFor(radarId, viewer(fx.user.id));
    expect((await getChatPage(access!)).messages).toHaveLength(0);
  });

  it("keeps a departed helper's messages for everyone still on the radar", async () => {
    const subscription = await db.radarSubscriber.create({
      data: { radarId, userId: fx.other.id, role: "HELPER" },
      select: { id: true },
    });
    await sendChatMessage({
      radarId,
      actor: viewer(fx.other.id),
      body: "I had a look at this",
    });

    await db.radarSubscriber.delete({ where: { id: subscription.id } });

    expect(await chatAccessFor(radarId, viewer(fx.other.id))).toBeNull();
    const access = await chatAccessFor(radarId, viewer(fx.user.id));
    const { messages } = await getChatPage(access!);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("I had a look at this");
  });

  it("pages backwards without repeating or losing a message", async () => {
    await db.chatMessage.createMany({
      data: Array.from({ length: 120 }, (_, index) => ({
        radarId,
        authorId: fx.user.id,
        body: `message ${index}`,
        createdAt: new Date(Date.now() - (120 - index) * 1000),
      })),
    });

    const access = (await chatAccessFor(radarId, viewer(fx.user.id)))!;
    const first = await getChatPage(access);
    expect(first.messages).toHaveLength(50);
    expect(first.messages[0].body).toBe("message 70");
    expect(first.messages.at(-1)?.body).toBe("message 119");
    expect(first.olderCursor).not.toBeNull();

    const second = await getChatPage(access, { cursor: first.olderCursor! });
    expect(second.messages).toHaveLength(50);
    expect(second.messages.at(-1)?.body).toBe("message 69");

    const ids = new Set([...first.messages, ...second.messages].map((m) => m.id));
    expect(ids.size).toBe(100);
  });

  it("lets the author or an admin delete, and nobody else", async () => {
    await db.radarSubscriber.create({
      data: { radarId, userId: fx.other.id, role: "HELPER" },
    });
    const send = async (actor: { id: string; isAdmin: boolean }) => {
      const result = await sendChatMessage({ radarId, actor, body: "oops" });
      if (!result.ok) throw new Error(result.error);
      return result.message.id;
    };

    const theirs = await send(viewer(fx.other.id));
    expect((await deleteChatMessage({ messageId: theirs, actor: viewer(fx.user.id) })).ok).toBe(false);
    expect((await deleteChatMessage({ messageId: theirs, actor: viewer(fx.other.id) })).ok).toBe(true);

    const mine = await send(viewer(fx.user.id));
    expect((await deleteChatMessage({ messageId: mine, actor: viewer(fx.third.id) })).ok).toBe(false);
    expect((await deleteChatMessage({ messageId: mine, actor: adminViewer(fx.admin.id) })).ok).toBe(true);
  });
});

describe("unread", () => {
  it("counts other people's messages, never your own, per person", async () => {
    await db.radarSubscriber.create({
      data: { radarId, userId: fx.other.id, role: "HELPER" },
    });
    await updateRadar({
      radarId,
      actorId: fx.user.id,
      patch: { assigneeId: fx.third.id },
    });

    const mine = (await chatAccessFor(radarId, viewer(fx.user.id)))!;
    const theirs = (await chatAccessFor(radarId, viewer(fx.other.id)))!;
    const thirds = (await chatAccessFor(radarId, viewer(fx.third.id)))!;

    await sendChatMessage({ radarId, actor: viewer(fx.user.id), body: "one" });
    await sendChatMessage({ radarId, actor: viewer(fx.user.id), body: "two" });

    // Sending advanced the author's own marker inside the same transaction.
    expect(await getChatUnreadCount(mine, fx.user.id)).toBe(0);
    expect(await getChatUnreadCount(theirs, fx.other.id)).toBe(2);
    expect(await getChatUnreadCount(thirds, fx.third.id)).toBe(2);

    await markChatRead({ radarId, actor: viewer(fx.other.id) });
    expect(await getChatUnreadCount(theirs, fx.other.id)).toBe(0);
    // One person reading must not clear anyone else's badge.
    expect(await getChatUnreadCount(thirds, fx.third.id)).toBe(2);

    await sendChatMessage({ radarId, actor: viewer(fx.user.id), body: "three" });
    expect(await getChatUnreadCount(theirs, fx.other.id)).toBe(1);
  });
});

describe("side effects", () => {
  it("writes nothing but the message — no activity, no notification, no mail", async () => {
    await updateRadar({
      radarId,
      actorId: fx.user.id,
      patch: { assigneeId: fx.other.id },
    });

    const before = {
      events: await db.activityEvent.count({ where: { radarId } }),
      notifications: await db.notification.count({ where: { radarId } }),
      mail: await db.emailMessage.count(),
      radar: await db.radar.findUniqueOrThrow({
        where: { id: radarId },
        select: { lastActivityAt: true, version: true },
      }),
    };

    await sendChatMessage({
      radarId,
      actor: viewer(fx.user.id),
      body: "this must not appear anywhere public",
    });

    expect(await db.activityEvent.count({ where: { radarId } })).toBe(before.events);
    expect(await db.notification.count({ where: { radarId } })).toBe(before.notifications);
    expect(await db.emailMessage.count()).toBe(before.mail);
    // A private side chat must not reorder the public queue.
    expect(
      await db.radar.findUniqueOrThrow({
        where: { id: radarId },
        select: { lastActivityAt: true, version: true },
      }),
    ).toEqual(before.radar);
  });
});
