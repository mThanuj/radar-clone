"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyX } from "lucide-react";
import { toast } from "sonner";
import { closeAsDuplicateAction } from "@/server/radars/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Closing as a duplicate is its own workflow rather than a substate pick:
 * it has to write the canonical FK and the DUPLICATE_OF edge together.
 */
export function CloseDuplicateDialog({
  radarId,
  number,
  version,
}: {
  radarId: string;
  number: number;
  version: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await closeAsDuplicateAction({
        radarId,
        number,
        expectedVersion: version,
        duplicateOfNumber: Number(form.get("duplicateOf")),
        note: String(form.get("note") ?? "") || undefined,
      });
      if (result.ok) {
        setOpen(false);
        toast.success("Closed as duplicate");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <CopyX /> Mark duplicate
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Close as duplicate</DialogTitle>
            <DialogDescription>
              This radar moves to Closed / Duplicate and links to the canonical
              one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duplicateOf">Duplicate of radar number</Label>
              <Input
                id="duplicateOf"
                name="duplicateOf"
                inputMode="numeric"
                required
                autoFocus
                placeholder="100000042"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Textarea id="note" name="note" rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Close as duplicate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
