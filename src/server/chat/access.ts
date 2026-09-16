import "server-only";
import {
  canUseChat,
  chatMemberIds,
  chatRoleOf,
  type ChatRole,
  type ChatRoster,
  type ChatViewer,
} from "@/lib/chat/membership";
import { db } from "@/lib/db";
import type { RadarDetail } from "@/server/radars/queries";
import type { Tx } from "@/server/tx";

/**
 * The gate on radar chat — the only resource-scoped authorization in the app.
 *
 * Not in guards.ts: that file is redirect-based session plumbing with no
 * database access and no notion of a resource, and a gate used by server
 * actions must *return* rather than redirect. `redirect()` throws
 * NEXT_REDIRECT, which every action's `catch (error) { return
 * actionError(error) }` swallows into the literal string "NEXT_REDIRECT". Same
 * reason requireAdmin() is no use here.
 *
 * Keeping the whole decision in one file means there is exactly one thing to
 * audit. Read functions take the ChatAccess this returns, so a chat read cannot
 * be written without having passed through here first — if you find yourself
 * adding a fifth call site, it needs a test.
 */
export type ChatAccess = {
  radarId: string;
  radarNumber: number;
  roster: ChatRoster;
  /** Everyone on the radar. Also the realtime push list — so no admins. */
  memberIds: string[];
  viewerRole: ChatRole;
};

/** Says nothing about *why*, on purpose: "no such radar" and "not on it" are
 *  the same answer to someone who should not be looking. */
export const NO_ACCESS = "You're not on this radar's chat.";

/**
 * Zero-query path for the detail page: DETAIL_INCLUDE already selects
 * originatorId, assigneeId and the subscriber rows with their roles, so the
 * page pays nothing to know whether to render the tab.
 */
export function rosterFromDetail(radar: RadarDetail): ChatRoster {
  return {
    originatorId: radar.originatorId,
    assigneeId: radar.assigneeId,
    helperIds: radar.subscribers
      .filter((subscriber) => subscriber.role === "HELPER")
      .map((subscriber) => subscriber.user.id),
  };
}

export function accessFromRoster(
  args: { radarId: string; radarNumber: number; roster: ChatRoster },
  viewer: ChatViewer,
): ChatAccess | null {
  if (!canUseChat(args.roster, viewer)) return null;
  return {
    radarId: args.radarId,
    radarNumber: args.radarNumber,
    roster: args.roster,
    memberIds: chatMemberIds(args.roster),
    // canUseChat passed, so there is always a role.
    viewerRole: chatRoleOf(args.roster, viewer)!,
  };
}

/** One query, for callers holding only a radarId — which is every action. */
export async function chatAccessFor(
  radarId: string,
  viewer: ChatViewer,
  client: Tx = db,
): Promise<ChatAccess | null> {
  const radar = await client.radar.findUnique({
    where: { id: radarId },
    select: {
      id: true,
      number: true,
      originatorId: true,
      assigneeId: true,
      subscribers: { where: { role: "HELPER" }, select: { userId: true } },
    },
  });
  if (!radar) return null;

  return accessFromRoster(
    {
      radarId: radar.id,
      radarNumber: radar.number,
      roster: {
        originatorId: radar.originatorId,
        assigneeId: radar.assigneeId,
        helperIds: radar.subscribers.map((subscriber) => subscriber.userId),
      },
    },
    viewer,
  );
}

/** The line every chat write starts with. */
export async function requireChatAccess(
  radarId: string,
  viewer: ChatViewer,
  client: Tx = db,
): Promise<{ ok: true; access: ChatAccess } | { ok: false; error: string }> {
  const access = await chatAccessFor(radarId, viewer, client);
  return access ? { ok: true, access } : { ok: false, error: NO_ACCESS };
}
