import type { NotificationReason } from "@/generated/prisma/enums";
import { REASONS } from "@/lib/notifications/catalog";
import { auditFieldLabel, isProseField } from "@/lib/radar/audit-labels";

/**
 * Email rendering.
 *
 * One generic template driven by the catalog rather than eighteen bespoke
 * files: every notification has the same anatomy (what happened, to which
 * radar, by whom, what changed, a link), and duplicating that per reason is
 * how wording drifts apart. The lead sentence is the only per-reason part.
 *
 * Wording comes from auditFieldLabel(), the same function the activity feed
 * uses, so an email and the radar it describes never disagree.
 */
export type EmailPayload = {
  reason: NotificationReason;
  radar: { number: number; title: string };
  actorName: string | null;
  changes: { field: string; fromLabel?: string | null; toLabel?: string | null }[];
  commentExcerpt?: string | null;
  radarUrl: string;
  unsubscribeUrl: string;
  settingsUrl: string;
};

export type RenderedEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** The one sentence that differs per reason. */
function leadSentence(payload: EmailPayload): string {
  const who = payload.actorName ?? "Someone";
  const { reason } = payload;

  switch (reason) {
    case "ASSIGNED":
      return `${who} assigned this radar to you.`;
    case "UNASSIGNED":
      return `${who} unassigned this radar from you.`;
    case "CC_ADDED":
      return `${who} added you to the CC list.`;
    case "HELPER_ADDED":
      return `${who} added you as a helper on this radar.`;
    case "WATCHING_ADDED":
      return `${who} added you as a watcher.`;
    case "MENTIONED":
      return `${who} mentioned you in a comment.`;
    case "MENTIONED_ALL":
      return `${who} sent this to everyone with a Radar account.`;
    case "COMMENTED":
      return `${who} commented.`;
    case "COMMENT_EDITED":
      return `${who} edited a comment.`;
    case "RESOLVED":
      return `${who} closed this radar.`;
    case "REOPENED":
      return `${who} reopened this radar.`;
    case "DUPLICATED":
      return `${who} marked a radar as a duplicate.`;
    case "BLOCKED":
      return `${who} added a blocker to this radar.`;
    case "RELATED":
      return `${who} linked this radar to another one.`;
    case "PRIORITY_RAISED":
      return `${who} raised the priority.`;
    case "MILESTONE_CHANGED":
      return `${who} changed the milestone.`;
    case "COMPONENT_FILED":
      return `${who} filed a radar in a component you own.`;
    case "DUE_SOON":
      return "This radar is due within 24 hours.";
    default:
      return `${who} made changes.`;
  }
}

function changeLines(payload: EmailPayload): string[] {
  return payload.changes
    .filter((change) => !change.field.startsWith("relation."))
    .map((change) => {
      const label = auditFieldLabel(change.field);
      if (isProseField(change.field)) return `${label} edited`;
      if (!change.fromLabel) return `${label}: ${change.toLabel ?? "cleared"}`;
      return `${label}: ${change.fromLabel} → ${change.toLabel ?? "cleared"}`;
    });
}

/**
 * The subject line on its own.
 *
 * Exported because the outbox stores it alongside the payload, and one @all
 * queues a row per account — rendering the whole HTML body just to read the
 * first line off it is work per recipient that buys nothing.
 */
export function emailSubject(payload: EmailPayload): string {
  return `${REASONS[payload.reason].label}: ${payload.radar.number} — ${payload.radar.title}`;
}

export function renderEmail(payload: EmailPayload): RenderedEmail {
  const meta = REASONS[payload.reason];
  const subject = emailSubject(payload);
  const lead = leadSentence(payload);
  const lines = changeLines(payload);

  const text = [
    lead,
    "",
    `${payload.radar.number} — ${payload.radar.title}`,
    ...(lines.length ? ["", ...lines.map((line) => `  • ${line}`)] : []),
    ...(payload.commentExcerpt ? ["", `"${payload.commentExcerpt}"`] : []),
    "",
    payload.radarUrl,
    "",
    "—",
    `You received this because: ${meta.label.toLowerCase()}.`,
    `Manage notifications: ${payload.settingsUrl}`,
    `Turn off this kind of email: ${payload.unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f6f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">${escapeHtml(lead)}</p>

    <a href="${escapeHtml(payload.radarUrl)}" style="display:block;text-decoration:none;color:inherit;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:16px;">
      <span style="display:block;font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;color:#737373;">${payload.radar.number}</span>
      <span style="display:block;font-size:15px;font-weight:600;margin-top:2px;">${escapeHtml(payload.radar.title)}</span>
    </a>

    ${
      lines.length
        ? `<ul style="margin:0 0 16px;padding-left:18px;font-size:13px;line-height:1.7;color:#404040;">${lines
            .map((line) => `<li>${escapeHtml(line)}</li>`)
            .join("")}</ul>`
        : ""
    }

    ${
      payload.commentExcerpt
        ? `<blockquote style="margin:0 0 16px;padding:10px 14px;background:#f6f6f5;border-left:3px solid #d4d4d4;border-radius:4px;font-size:13px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(
            payload.commentExcerpt,
          )}</blockquote>`
        : ""
    }

    <a href="${escapeHtml(payload.radarUrl)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:13px;font-weight:500;padding:8px 14px;border-radius:8px;">Open radar</a>

    <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px;">
    <p style="margin:0;font-size:11px;line-height:1.6;color:#737373;">
      You received this because: ${escapeHtml(meta.label.toLowerCase())}.<br>
      <a href="${escapeHtml(payload.settingsUrl)}" style="color:#737373;">Manage notifications</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(payload.unsubscribeUrl)}" style="color:#737373;">Turn off this kind of email</a>
    </p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/** Sign-up verification. Not a radar notification, so it stands alone. */
export function renderVerificationEmail(args: {
  name: string;
  url: string;
}): RenderedEmail {
  const subject = "Verify your email for Radar";
  const text = [
    `Hi ${args.name},`,
    "",
    "Confirm this address to finish setting up your Radar account:",
    args.url,
    "",
    "You can keep using Radar in the meantime — this just confirms we can reach you.",
    "If you didn't sign up, ignore this message.",
  ].join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f6f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171717;">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:24px;">
    <h1 style="margin:0 0 12px;font-size:16px;">Verify your email</h1>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#404040;">
      Hi ${escapeHtml(args.name)}, confirm this address to finish setting up your
      Radar account. You can keep using Radar in the meantime — this just
      confirms we can reach you.
    </p>
    <a href="${escapeHtml(args.url)}" style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;font-size:13px;font-weight:500;padding:9px 16px;border-radius:8px;">Verify email</a>
    <p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#737373;">
      If you didn't sign up, ignore this message.
    </p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

