"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_ORDER,
  PRIORITY_LABEL,
  REPRODUCIBILITY_LABEL,
  REPRODUCIBILITY_ORDER,
} from "@/lib/radar/taxonomy";
import { DESCRIPTION_SECTIONS } from "@/lib/radar/description";
import { createRadarAction } from "@/server/radars/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Component = {
  id: string;
  path: string;
  defaultAssigneeId: string | null;
};

const selectClass =
  "border-input h-8 w-full rounded-md border bg-transparent px-2 text-sm";

export function CreateRadarForm({
  components,
  people,
  milestones,
}: {
  components: Component[];
  people: { id: string; name: string; handle: string }[];
  milestones: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [componentId, setComponentId] = useState(components[0]?.id ?? "");

  const component = components.find((c) => c.id === componentId);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = String(form.get(key) ?? "").trim();
      return value || null;
    };

    startTransition(async () => {
      const result = await createRadarAction({
        title: String(form.get("title")),
        summary: String(form.get("summary")),
        stepsToReproduce: text("stepsToReproduce"),
        expectedResults: text("expectedResults"),
        actualResults: text("actualResults"),
        versionBuild: text("versionBuild"),
        configuration: text("configuration"),
        notes: text("notes"),
        classification: form.get("classification") as never,
        reproducibility: form.get("reproducibility") as never,
        priority: Number(form.get("priority")),
        componentId,
        milestoneId: text("milestoneId"),
        assigneeId: text("assigneeId"),
        isRegression: form.get("isRegression") === "on",
      });

      if (result.ok) {
        toast.success(`Filed radar ${result.data.number}`);
        router.push(`/radars/${result.data.number}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          autoFocus
          minLength={3}
          maxLength={300}
          placeholder="One line describing the problem"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="classification">Classification</Label>
          <select
            id="classification"
            name="classification"
            defaultValue="TASK"
            className={selectClass}
          >
            {CLASSIFICATION_ORDER.map((value) => (
              <option key={value} value={value}>
                {CLASSIFICATION_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Priority</Label>
          <select
            id="priority"
            name="priority"
            defaultValue="3"
            className={selectClass}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="componentId">Component</Label>
          <select
            id="componentId"
            name="componentId"
            value={componentId}
            onChange={(event) => setComponentId(event.target.value)}
            className={selectClass}
          >
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="reproducibility">Reproducibility</Label>
          <select
            id="reproducibility"
            name="reproducibility"
            defaultValue="NOT_APPLICABLE"
            className={selectClass}
          >
            {REPRODUCIBILITY_ORDER.map((value) => (
              <option key={value} value={value}>
                {REPRODUCIBILITY_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="assigneeId">Assignee</Label>
          <select
            id="assigneeId"
            name="assigneeId"
            defaultValue={component?.defaultAssigneeId ?? ""}
            className={selectClass}
          >
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="milestoneId">Milestone</Label>
          <select id="milestoneId" name="milestoneId" className={selectClass}>
            <option value="">None</option>
            {milestones.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

      </div>

      <Label className="flex w-fit items-center gap-2 text-sm font-normal">
        <input type="checkbox" name="isRegression" className="size-3.5" />
        This is a regression
      </Label>

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        {DESCRIPTION_SECTIONS.map((section) => (
          <div key={section.key} className="flex flex-col gap-1.5">
            <Label htmlFor={section.key} className="text-xs">
              {section.label}
              {section.required && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              id={section.key}
              name={section.key}
              rows={section.rows}
              required={section.required}
              placeholder={section.placeholder}
              className="font-mono text-xs"
            />
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          File radar
        </Button>
      </div>
    </form>
  );
}
