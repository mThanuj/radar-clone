import { describe, expect, it } from "vitest";
import { renderEmail, renderVerificationEmail } from "@/server/email/templates";
import {
  mintUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/server/email/unsubscribe";
import { resolveChannels } from "@/lib/notifications/resolve";
import { ALL_REASONS } from "@/lib/notifications/catalog";
import type { NotificationReason } from "@/generated/prisma/enums";

const payload = (reason: NotificationReason = "ASSIGNED") => ({
  reason,
  radar: { number: 100000042, title: "Sheet dismisses early" },
  actorName: "Jane Doe",
  changes: [
    { field: "assignee", fromLabel: "Nobody", toLabel: "Sam Ruiz" },
    { field: "summary", fromLabel: null, toLabel: null },
  ],
  commentExcerpt: null,
  radarUrl: "https://radar.example.com/radars/100000042",
  settingsUrl: "https://radar.example.com/settings/notifications",
  unsubscribeUrl: "https://radar.example.com/api/unsubscribe?token=abc",
});

describe("email templates", () => {
  it("renders every reason without throwing, with a subject and both bodies", () => {
    for (const reason of ALL_REASONS) {
      const mail = renderEmail(payload(reason));
      expect(mail.subject).toContain("100000042");
      expect(mail.html).toContain("<html>");
      // A text alternative isn't optional: plenty of clients prefer it, and
      // HTML-only mail scores badly with spam filters.
      expect(mail.text.length).toBeGreaterThan(20);
      expect(mail.text).not.toContain("<");
    }
  });

  it("names the actor and what changed", () => {
    const mail = renderEmail(payload("ASSIGNED"));
    expect(mail.text).toContain("Jane Doe assigned this radar to you.");
    expect(mail.text).toContain("Assignee: Nobody → Sam Ruiz");
    // Prose fields report that they changed, not their contents.
    expect(mail.text).toContain("Summary edited");
  });

  it("always carries a link back and a way out", () => {
    const mail = renderEmail(payload("COMMENTED"));
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("https://radar.example.com/radars/100000042");
      expect(body).toContain("token=abc");
      expect(body).toContain("/settings/notifications");
    }
  });

  it("escapes user-supplied content in the HTML body", () => {
    const mail = renderEmail({
      ...payload(),
      radar: { number: 1, title: `<script>alert("x")</script>` },
      commentExcerpt: `<img src=x onerror="steal()">`,
    });
    // The payload survives as inert text — what must not happen is a tag or
    // attribute forming, which is decided by whether < and " are escaped.
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).not.toContain("<img");
    expect(mail.html).not.toContain(`onerror="steal()"`);
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;steal()&quot;&gt;");
  });

  it("quotes a comment when there is one", () => {
    const mail = renderEmail({ ...payload("COMMENTED"), commentExcerpt: "Looks fixed to me" });
    expect(mail.text).toContain("Looks fixed to me");
    expect(mail.html).toContain("Looks fixed to me");
  });

  it("renders the verification email with the link intact", () => {
    const mail = renderVerificationEmail({
      name: "Jane",
      url: "https://radar.example.com/verify?token=xyz",
    });
    expect(mail.subject).toMatch(/verify/i);
    expect(mail.text).toContain("https://radar.example.com/verify?token=xyz");
    expect(mail.html).toContain("https://radar.example.com/verify?token=xyz");
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips a user and category", () => {
    const token = mintUnsubscribeToken("user-123", "DISCUSSION");
    expect(verifyUnsubscribeToken(token)).toEqual({
      userId: "user-123",
      category: "DISCUSSION",
    });
  });

  it("rejects a tampered payload", () => {
    const token = mintUnsubscribeToken("user-123", "DISCUSSION");
    const [encoded, signature] = token.split(".");
    const forged = Buffer.from("someone-else:DISCUSSION").toString("base64url");
    // Swapping the payload while keeping the signature must not work — that is
    // the whole security property of a link that needs no session.
    expect(verifyUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${encoded}.deadbeef`)).toBeNull();
    expect(verifyUnsubscribeToken("nonsense")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });
});

describe("channel resolution", () => {
  const base = { preferences: {}, emailEnabled: true, muted: false };

  it("mutes both channels regardless of anything else", () => {
    expect(
      resolveChannels({ ...base, reason: "MENTIONED", muted: true }),
    ).toEqual({ inApp: false, email: false });
  });

  it("lets the global switch turn email off but leaves the inbox alone", () => {
    expect(
      resolveChannels({ ...base, reason: "ASSIGNED", emailEnabled: false }),
    ).toEqual({ inApp: true, email: false });
  });

  it("lets a category preference override the catalog default", () => {
    // STATE_CHANGED ships with email off; opting in must work.
    expect(
      resolveChannels({
        ...base,
        reason: "STATE_CHANGED",
        preferences: { WORKFLOW: { inApp: true, email: true } },
      }).email,
    ).toBe(true);

    expect(
      resolveChannels({
        ...base,
        reason: "ASSIGNED",
        preferences: { ASSIGNMENT: { inApp: false, email: false } },
      }),
    ).toEqual({ inApp: false, email: false });
  });

  it("delivers a mention through both channels whatever the settings say", () => {
    expect(
      resolveChannels({
        reason: "MENTIONED",
        muted: false,
        emailEnabled: false,
        preferences: { DISCUSSION: { inApp: false, email: false } },
      }),
    ).toEqual({ inApp: true, email: true });
  });
});
