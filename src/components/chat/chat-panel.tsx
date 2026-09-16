"use client";

import { useEffect, useRef } from "react";
import { fullDate, relativeTime } from "@/lib/radar/format";
import { Avatar } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";
import { ChatAudience, type ChatMember } from "@/components/chat/chat-audience";
import { ChatComposer } from "@/components/chat/chat-composer";
import type { ChatMessageView } from "@/components/chat/use-radar-chat";

/** How close to the bottom still counts as "following along". */
const FOLLOW_SLACK_PX = 48;

export type ChatPanelProps = {
  viewerId: string;
  viewerIsAdmin: boolean;
  viewerIsMember: boolean;
  memberIds: string[];
  members: ChatMember[];
  messages: ChatMessageView[];
  olderCursor: string | null;
  locked: boolean;
  busy: boolean;
  announcement: string;
  onSend: (body: string) => Promise<boolean>;
  onDelete: (messageId: string) => void;
  onLoadOlder: () => void;
};

export function ChatPanel({
  viewerId,
  viewerIsAdmin,
  viewerIsMember,
  memberIds,
  members,
  messages,
  olderCursor,
  locked,
  busy,
  announcement,
  onSend,
  onDelete,
  onLoadOlder,
}: ChatPanelProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const count = messages.length;

  // Follow the conversation only if the reader was already at the bottom.
  // Yanking someone away from what they were reading is the classic chat bug.
  useEffect(() => {
    const element = scroller.current;
    if (element && following.current) element.scrollTop = element.scrollHeight;
  }, [count]);

  if (locked) {
    return (
      <p className="text-muted-foreground px-4 py-8 text-center text-sm">
        You&apos;re no longer on this radar&apos;s chat.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <ChatAudience members={members} viewerIsMember={viewerIsMember} />

      {/* tabIndex, because a scrollable div holding no focusable children is
          unreachable by keyboard in Safari and Firefox. */}
      <div
        ref={scroller}
        tabIndex={0}
        aria-label="Chat messages"
        onScroll={(event) => {
          const el = event.currentTarget;
          following.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX;
        }}
        className="focus-visible:ring-ring max-h-[26rem] min-h-[12rem] overflow-y-auto overscroll-contain px-4 py-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        {olderCursor && (
          <div className="flex justify-center py-1">
            <Button variant="ghost" size="xs" disabled={busy} onClick={onLoadOlder}>
              Earlier messages
            </Button>
          </div>
        )}

        {messages.length === 0 ? (
          <p className="text-muted-foreground px-4 py-8 text-center text-sm">
            No chat yet. This is a private side conversation for the people
            working this radar — it is not part of the public record and it is
            not searchable.
          </p>
        ) : (
          <ol className="flex flex-col">
            {messages.map((message) => {
              // An admin who is not on the radar is a visitor. The room should
              // know, the same way the audience line tells them admins can read.
              const outsider = !memberIds.includes(message.author.id);
              const deletable =
                message.author.id === viewerId || viewerIsAdmin;

              return (
                <li key={message.id} className="group flex gap-2.5 py-1.5">
                  <Avatar person={message.author} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {message.author.name}
                      </span>
                      {outsider && (
                        <span className="bg-muted text-muted-foreground rounded px-1 text-[0.65rem] font-medium">
                          Admin
                        </span>
                      )}
                      <time
                        dateTime={message.createdAt}
                        title={fullDate(message.createdAt)}
                        className="text-muted-foreground text-xs"
                      >
                        {relativeTime(message.createdAt)}
                      </time>
                      {deletable && (
                        <button
                          type="button"
                          onClick={() => onDelete(message.id)}
                          className="text-muted-foreground hover:text-destructive ml-auto text-xs opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="bg-muted/40 mt-1 rounded-lg px-3 py-2 text-sm break-words whitespace-pre-wrap">
                      {message.body}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Only the newest arrival, not the list — an aria-live list re-announces
          every row on every render. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ChatComposer disabled={busy} onSend={onSend} />
    </div>
  );
}
