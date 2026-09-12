"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { ALL_STATES } from "@/lib/radar/state-machine";
import { PRIORITY_LABEL, STATE_LABEL } from "@/lib/radar/taxonomy";
import type { OptionSources } from "@/lib/search/fields";
import { bulkUpdateAction } from "@/server/radars/actions";
import type { RadarPatch } from "@/server/radars/mutations";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Bulk edit runs every radar through the same updateRadar path inside one
 * transaction — so 30 reassignments produce 30 correctly audited events, and
 * either all of them land or none do.
 */
export function BulkEditBar({
  ids,
  sources,
  onDone,
}: {
  ids: string[];
  sources: OptionSources;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(patch: RadarPatch, description: string) {
    startTransition(async () => {
      const result = await bulkUpdateAction({ radarIds: ids, patch });
      if (result.ok) {
        toast.success(`${description} for ${result.data.count} radars`);
        onDone();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="bg-popover fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-xl border p-1.5 pl-3 shadow-lg">
      <span className="text-sm font-medium">
        {ids.length} selected
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs" disabled={pending}>
              State
            </Button>
          }
        />
        <DropdownMenuContent align="center">
          {ALL_STATES.map((state) => (
            <DropdownMenuItem
              key={state}
              onClick={() => apply({ state }, `Moved to ${STATE_LABEL[state]}`)}
            >
              {STATE_LABEL[state]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs" disabled={pending}>
              Priority
            </Button>
          }
        />
        <DropdownMenuContent align="center">
          {[1, 2, 3, 4, 5].map((priority) => (
            <DropdownMenuItem
              key={priority}
              onClick={() =>
                apply({ priority }, `Set ${PRIORITY_LABEL[priority]}`)
              }
            >
              {PRIORITY_LABEL[priority]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs" disabled={pending}>
              Assignee
            </Button>
          }
        />
        <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem
            onClick={() => apply({ assigneeId: null }, "Unassigned")}
          >
            Unassign
          </DropdownMenuItem>
          {(sources.user ?? []).map((person) => (
            <DropdownMenuItem
              key={person.value}
              onClick={() =>
                apply({ assigneeId: person.value }, `Assigned to ${person.label}`)
              }
            >
              {person.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs" disabled={pending}>
              Milestone
            </Button>
          }
        />
        <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
          <DropdownMenuItem
            onClick={() => apply({ milestoneId: null }, "Milestone cleared")}
          >
            None
          </DropdownMenuItem>
          {(sources.milestone ?? []).map((milestone) => (
            <DropdownMenuItem
              key={milestone.value}
              onClick={() =>
                apply(
                  { milestoneId: milestone.value },
                  `Moved to ${milestone.label}`,
                )
              }
            >
              {milestone.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon-xs"
        onClick={onDone}
        aria-label="Clear selection"
      >
        <X />
      </Button>
    </div>
  );
}
