"use client";

import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { queryToString } from "@/lib/search/url";
import type { RadarQuery } from "@/lib/search/types";
import { saveQueryAction } from "@/server/saved-queries/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SaveQueryDialog({ query }: { query: RadarQuery }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveQueryAction({
        name: String(form.get("name")),
        params: queryToString(query),
        isPinned: form.get("pin") === "on",
      });
      if (result.ok) {
        toast.success("Query saved");
        setOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="xs">
            <Bookmark /> Save
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>
              Saved queries store the URL, so relative dates like “-7d” keep
              rolling rather than freezing on today.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" required autoFocus maxLength={80} />
            </div>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox name="pin" defaultChecked />
              Pin to the sidebar
            </Label>
            <p className="text-muted-foreground font-mono text-xs break-all">
              ?{queryToString(query) || "(no filters)"}
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
