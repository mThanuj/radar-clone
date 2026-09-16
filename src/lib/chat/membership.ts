/**
 * Who may use a radar's private chat.
 *
 * Pure, and kept out of `src/server` on purpose: this is the whole
 * authorization decision for the only gated surface in the app, and a rule that
 * cannot be exercised without a database is a rule nobody tests. Everything
 * that needs a query lives in src/server/chat/access.ts.
 *
 * Deliberately *not* radarAudience() from src/server/notifications/fanout.ts,
 * which looks similar and is wrong here: that includes CC and WATCHER and drops
 * muted people, because it answers "who should be told", not "who may read".
 */

export type ChatRoster = {
  originatorId: string;
  assigneeId: string | null;
  /** Subscribers with role HELPER. */
  helperIds: string[];
};

export type ChatViewer = { id: string; isAdmin: boolean };

export type ChatRole = "assignee" | "helper" | "originator" | "admin";

/**
 * Everyone working the radar, de-duplicated.
 *
 * Admins are deliberately absent: this list is also the realtime push list, and
 * no admin's channel should carry every chat in the system.
 */
export function chatMemberIds(roster: ChatRoster): string[] {
  return [
    ...new Set(
      [roster.assigneeId, roster.originatorId, ...roster.helperIds].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
}

/** The authorization decision. Admins are an explicit oversight exception. */
export function canUseChat(roster: ChatRoster, viewer: ChatViewer): boolean {
  return viewer.isAdmin || chatMemberIds(roster).includes(viewer.id);
}

/**
 * Why this person is in, for the audience line and the "Admin" chip.
 * Most specific wins, so someone who is both assignee and originator reads as
 * the assignee.
 */
export function chatRoleOf(
  roster: ChatRoster,
  viewer: ChatViewer,
): ChatRole | null {
  if (roster.assigneeId === viewer.id) return "assignee";
  if (roster.helperIds.includes(viewer.id)) return "helper";
  if (roster.originatorId === viewer.id) return "originator";
  return viewer.isAdmin ? "admin" : null;
}
