import { Suspense } from "react";
import type { ChatRole } from "@/lib/chat/membership";
import { accessFromRoster, rosterFromDetail } from "@/server/chat/access";
import { chatRoleOf } from "@/lib/chat/membership";
import { getChatPage, getChatUnreadCount } from "@/server/chat/queries";
import type { FeedEvent } from "@/server/activity/queries";
import type { CurrentUser } from "@/server/guards";
import type { RadarDetail } from "@/server/radars/queries";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { ActivityTabs, type ChatTabData } from "@/components/activity/activity-tabs";
import { CommentComposer } from "@/components/activity/comment-composer";
import type { MentionPerson } from "@/components/activity/mention-textarea";

/**
 * The activity panel, with a chat tab for the people on the radar.
 *
 * The membership branch is here, in a *server* component, on purpose: when the
 * reader is not on the radar nothing about the chat reaches the client — no
 * tab, no unread count, no member names, not even whether any messages exist.
 * The absence is the whole mechanism, so it cannot be a CSS or a client check.
 *
 * Chat is also the only gated thing on this page: any signed-in user can read,
 * comment on, reassign or close any radar. That asymmetry is deliberate.
 */
export async function ActivitySection({
  radar,
  user,
  people,
  events,
  openChat = false,
}: {
  radar: RadarDetail;
  user: CurrentUser;
  people: MentionPerson[];
  events: Promise<FeedEvent[]>;
  /** ?chat=1 — what the chat toast links to. */
  openChat?: boolean;
}) {
  const feed = (
    <Suspense fallback={<ActivitySkeleton />}>
      <Activity
        events={events}
        radarNumber={radar.number}
        currentUserId={user.id}
      />
    </Suspense>
  );
  const composer = (
    <CommentComposer radarId={radar.id} number={radar.number} people={people} />
  );

  // Free: the page already awaited the radar, and DETAIL_INCLUDE carries the
  // originator, the assignee and the subscriber roles.
  const access = accessFromRoster(
    {
      radarId: radar.id,
      radarNumber: radar.number,
      roster: rosterFromDetail(radar),
    },
    user,
  );

  if (!access) {
    return (
      <section className="rounded-lg border">
        <header className="border-b px-4 py-2">
          <h2 className="text-sm font-medium">Activity</h2>
        </header>
        <div className="px-4">{feed}</div>
        <div className="border-t p-4">{composer}</div>
      </section>
    );
  }

  const [page, unread] = await Promise.all([
    getChatPage(access),
    getChatUnreadCount(access, user.id),
  ]);

  const byId = new Map(
    [radar.originator, radar.assignee, ...radar.subscribers.map((s) => s.user)]
      .filter((person) => person !== null)
      .map((person) => [person.id, person]),
  );

  const chat: ChatTabData = {
    viewerId: user.id,
    viewerIsAdmin: user.isAdmin,
    viewerIsMember: access.memberIds.includes(user.id),
    memberIds: access.memberIds,
    members: access.memberIds.map((id) => ({
      id,
      name: byId.get(id)?.name ?? "Someone",
      role: chatRoleOf(access.roster, { id, isAdmin: false }) as ChatRole,
    })),
    initialMessages: page.messages.map((message) => ({
      id: message.id,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      author: message.author,
    })),
    initialOlderCursor: page.olderCursor,
    initialUnread: unread,
  };

  return (
    <section className="rounded-lg border">
      <ActivityTabs
        radarId={radar.id}
        chat={chat}
        defaultTab={openChat ? "chat" : "activity"}
        activity={feed}
        composer={composer}
      />
    </section>
  );
}

async function Activity({
  events,
  radarNumber,
  currentUserId,
}: {
  events: Promise<FeedEvent[]>;
  radarNumber: number;
  currentUserId: string;
}) {
  return (
    <ActivityFeed
      events={await events}
      radarNumber={radarNumber}
      currentUserId={currentUserId}
    />
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-3 py-3" aria-hidden>
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-3">
          <div className="bg-muted size-6 shrink-0 animate-pulse rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="bg-muted h-3 w-40 animate-pulse rounded" />
            <div className="bg-muted h-10 animate-pulse rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
