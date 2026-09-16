"use client";

import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const MAX_LENGTH = 4_000;
const COUNTER_FROM = 3_600;

/**
 * Not CommentComposer, which is welded to addCommentAction, MentionTextarea and
 * the @all warning — none of which apply, and an @handle here would be a lie,
 * since chat notifies nobody.
 *
 * ⌘↵ to send, the same chord the comment composer uses. Plain Enter would be
 * the chat-app convention, but two composers in one panel behaving differently
 * is the worse papercut.
 */
export function ChatComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    setSending(true);
    // Clear first: the round trip is one insert, and a message that lingers in
    // the box reads as "did that send?".
    setBody("");
    const sent = await onSend(trimmed);
    setSending(false);
    // Put the draft back rather than losing what someone typed.
    if (!sent) setBody(trimmed);
    field.current?.focus();
  }

  const over = body.length > MAX_LENGTH;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t p-3">
      <Textarea
        ref={field}
        value={body}
        rows={2}
        disabled={disabled}
        aria-label="Message"
        placeholder="Message the people on this radar…"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit(event);
        }}
        className="text-sm"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">⌘↵ to send</span>
        <span className="flex items-center gap-2">
          {body.length >= COUNTER_FROM && (
            <span
              className={
                over
                  ? "text-destructive text-xs tabular-nums"
                  : "text-muted-foreground text-xs tabular-nums"
              }
            >
              {body.length}/{MAX_LENGTH}
            </span>
          )}
          <Button
            type="submit"
            size="sm"
            disabled={disabled || sending || over || !body.trim()}
          >
            Send
          </Button>
        </span>
      </div>
    </form>
  );
}
