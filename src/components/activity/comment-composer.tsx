"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { mentionsEveryone } from "@/lib/markdown";
import { addCommentAction } from "@/server/comments/actions";
import { Button } from "@/components/ui/button";
import {
  MentionTextarea,
  type MentionPerson,
} from "@/components/activity/mention-textarea";

export function CommentComposer({
  radarId,
  number,
  people,
  autoFocus = false,
  onDone,
}: {
  radarId: string;
  number: number;
  people: MentionPerson[];
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const broadcasting = mentionsEveryone(body);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addCommentAction({
        radarId,
        number,
        body,
      });
      if (result.ok) {
        setBody("");
        onDone?.();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <MentionTextarea
        people={people}
        everyone
        value={body}
        autoFocus={autoFocus}
        onValueChange={setBody}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
        }}
        rows={3}
        placeholder="Add a comment. Markdown works, @handle notifies someone, @all notifies everyone, rdar://100000001 links."
        className="text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        {/* Said before sending rather than in a confirmation dialog after:
            the number is the thing worth knowing, and a modal on every @all
            would train people to dismiss it. */}
        {broadcasting ? (
          <span className="text-foreground flex items-center gap-1.5 text-xs font-medium">
            <Users className="size-3.5 shrink-0" />
            Notifies everyone with an account — {people.length} people
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">⌘↵ to send</span>
        )}
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          Comment
        </Button>
      </div>
    </form>
  );
}
