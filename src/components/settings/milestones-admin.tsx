"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { MilestoneStatus } from "@/generated/prisma/enums";
import { MILESTONE_STATUS_LABEL } from "@/lib/radar/taxonomy";
import { compactDate } from "@/lib/radar/format";
import { upsertMilestoneAction } from "@/server/milestones/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Milestone = {
  id: string;
  name: string;
  description: string | null;
  status: keyof typeof MilestoneStatus;
  targetDate: Date | null;
  component: { id: string; path: string } | null;
  _count: { radars: number };
};

const selectClass =
  "border-input h-8 rounded-md border bg-transparent px-2 text-sm";

export function MilestonesAdmin({
  milestones,
  components,
}: {
  milestones: Milestone[];
  components: { id: string; path: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  function save(form: FormData, id: string | null) {
    startTransition(async () => {
      const target = String(form.get("targetDate") ?? "");
      const componentId = String(form.get("componentId") ?? "");
      const result = await upsertMilestoneAction({
        id,
        name: String(form.get("name")),
        description: String(form.get("description") ?? "") || null,
        componentId: componentId || null,
        status: form.get("status") as keyof typeof MilestoneStatus,
        targetDate: target || null,
      });
      if (result.ok) {
        toast.success(id ? "Milestone updated" : "Milestone created");
        setEditing(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Add a milestone</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            save(new FormData(event.currentTarget), null);
            event.currentTarget.reset();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-name" className="text-xs">
              Name
            </Label>
            <Input
              id="ms-name"
              name="name"
              required
              placeholder="1.1"
              className="h-8 w-32 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-status" className="text-xs">
              Status
            </Label>
            <select id="ms-status" name="status" defaultValue="PLANNED" className={selectClass}>
              {Object.keys(MilestoneStatus).map((status) => (
                <option key={status} value={status}>
                  {MILESTONE_STATUS_LABEL[status as keyof typeof MilestoneStatus]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-target" className="text-xs">
              Target
            </Label>
            <Input
              id="ms-target"
              name="targetDate"
              type="date"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ms-component" className="text-xs">
              Component
            </Label>
            <select id="ms-component" name="componentId" className={selectClass}>
              <option value="">(none)</option>
              {components.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.path}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            <Plus /> Add
          </Button>
        </form>
      </section>

      <ul className="divide-y rounded-lg border">
        {milestones.map((milestone) => (
          <li key={milestone.id} className="px-4 py-3 text-sm">
            {editing === milestone.id ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  save(new FormData(event.currentTarget), milestone.id);
                }}
              >
                <Input
                  name="name"
                  defaultValue={milestone.name}
                  required
                  className="h-8 w-32 text-sm"
                />
                <select
                  name="status"
                  defaultValue={milestone.status}
                  className={selectClass}
                >
                  {Object.keys(MilestoneStatus).map((status) => (
                    <option key={status} value={status}>
                      {MILESTONE_STATUS_LABEL[status as keyof typeof MilestoneStatus]}
                    </option>
                  ))}
                </select>
                <Input
                  name="targetDate"
                  type="date"
                  defaultValue={
                    milestone.targetDate
                      ? new Date(milestone.targetDate).toISOString().slice(0, 10)
                      : ""
                  }
                  className="h-8 text-sm"
                />
                <select
                  name="componentId"
                  defaultValue={milestone.component?.id ?? ""}
                  className={selectClass}
                >
                  <option value="">(none)</option>
                  {components.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.path}
                    </option>
                  ))}
                </select>
                <Input
                  name="description"
                  defaultValue={milestone.description ?? ""}
                  placeholder="Description"
                  className="h-8 w-48 text-sm"
                />
                <Button type="submit" size="sm" disabled={pending}>
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <span className="font-medium">{milestone.name}</span>
                <span className="text-muted-foreground text-xs">
                  {MILESTONE_STATUS_LABEL[milestone.status]}
                  {milestone.targetDate &&
                    ` · due ${compactDate(milestone.targetDate)}`}
                  {milestone.component && ` · ${milestone.component.path}`}
                </span>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {milestone._count.radars}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setEditing(milestone.id)}
                >
                  Edit
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
