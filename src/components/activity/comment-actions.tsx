"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCommentAction, editCommentAction } from "@/server/comments/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CommentActions({
  commentId,
  number,
  body,
}: {
  commentId: string;
  number: number;
  body: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(body);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await editCommentAction({ commentId, number, body: draft });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteCommentAction({ commentId, number });
      // The comment and this button both disappear, so the toast is the only
      // confirmation a screen-reader user gets that anything happened.
      if (result.ok) {
        router.refresh();
        toast.success("Comment deleted");
      } else toast.error(result.error);
    });
  }

  return (
    <>
      <span className="text-muted-foreground ml-auto flex gap-1 text-xs">
        <button className="hover:text-foreground" onClick={() => setEditing(true)}>
          Edit
        </button>
        <button className="hover:text-destructive" onClick={remove}>
          Delete
        </button>
      </span>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit comment</DialogTitle>
          </DialogHeader>
          <Textarea
            aria-label="Comment body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={8}
            className="text-sm"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
