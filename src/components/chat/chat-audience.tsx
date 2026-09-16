"use client";

import type { ChatRole } from "@/lib/chat/membership";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type ChatMember = { id: string; name: string; role: ChatRole };

const ROLE_LABEL: Record<ChatRole, string> = {
  assignee: "Assignee",
  helper: "Helper",
  originator: "Originator",
  admin: "Administrator",
};

/**
 * Who can read this.
 *
 * A persistent line rather than a tooltip, and it names administrators out
 * loud: people are about to type into something called private, and an
 * oversight exception they have to hover to discover is not one they have been
 * told about.
 */
export function ChatAudience({
  members,
  viewerIsMember,
}: {
  members: ChatMember[];
  viewerIsMember: boolean;
}) {
  const count = `${members.length} ${members.length === 1 ? "person" : "people"}`;

  const roster = (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="hover:text-foreground underline underline-offset-2"
          >
            {count}
          </button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1">
        <ul className="flex flex-col">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-2 rounded px-2 py-1 text-sm"
            >
              <span className="min-w-0 truncate">{member.name}</span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {ROLE_LABEL[member.role]}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );

  return (
    <p className="text-muted-foreground border-b px-4 py-1.5 text-xs">
      {viewerIsMember ? (
        <>Private to the {roster} on this radar — and administrators.</>
      ) : (
        <>
          You can see this because you are an administrator. The {roster} on this
          radar can see your messages.
        </>
      )}
    </p>
  );
}
