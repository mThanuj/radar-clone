"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCommentAction } from "@/server/comments/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentComposer({
  radarId,
  number,
  parentId,
  autoFocus = false,
  onDone,
}: {
  radarId: string;
  number: number;
  parentId?: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addCommentAction({
        radarId,
        number,
        body,
        parentId: parentId ?? null,
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
      <Textarea
        value={body}
        autoFocus={autoFocus}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
        }}
        rows={3}
        placeholder="Add a comment. Markdown works, @handle notifies someone, rdar://100000001 links."
        className="text-sm"
      />
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">⌘↵ to send</span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          Comment
        </Button>
      </div>
    </form>
  );
}
