"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import {
  createComponentAction,
  updateComponentAction,
} from "@/server/components/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Component = {
  id: string;
  name: string;
  path: string;
  depth: number;
  parentId: string | null;
  defaultAssigneeId: string | null;
  _count: { radars: number };
};

const selectClass =
  "border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm";

export function ComponentsAdmin({
  components,
  people,
}: {
  components: Component[];
  people: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(message);
        setEditing(null);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Add a component</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const parentId = String(form.get("parentId") ?? "");
            run(
              () =>
                createComponentAction({
                  name: String(form.get("name")),
                  parentId: parentId || null,
                }),
              "Component added",
            );
            event.currentTarget.reset();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-name" className="text-xs">
              Name
            </Label>
            <Input
              id="new-name"
              name="name"
              required
              placeholder="Search"
              className="h-8 w-48 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-parent" className="text-xs">
              Parent
            </Label>
            <select id="new-parent" name="parentId" className={`${selectClass} w-56`}>
              <option value="">(top level)</option>
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
        <p className="text-muted-foreground text-xs">
          Renaming a component rewrites the paths of everything beneath it, so
          subtree filters keep working.
        </p>
      </section>

      <ul className="divide-y rounded-lg border">
        {components.map((component) => (
          <li key={component.id} className="px-4 py-3">
            {editing === component.id ? (
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const assignee = String(form.get("defaultAssigneeId") ?? "");
                  run(
                    () =>
                      updateComponentAction({
                        id: component.id,
                        name: String(form.get("name")),
                        defaultAssigneeId: assignee || null,
                      }),
                    "Component updated",
                  );
                }}
              >
                <Input
                  name="name"
                  defaultValue={component.name}
                  required
                  className="h-8 w-48 text-sm"
                />
                <select
                  name="defaultAssigneeId"
                  defaultValue={component.defaultAssigneeId ?? ""}
                  className={`${selectClass} w-56`}
                >
                  <option value="">No default assignee</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
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
              <div
                className="flex items-center gap-3 text-sm"
                style={{ paddingLeft: component.depth * 18 }}
              >
                <span className="font-medium">{component.name}</span>
                <span className="text-muted-foreground text-xs">
                  {component.path}
                </span>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {component._count.radars}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setEditing(component.id)}
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
