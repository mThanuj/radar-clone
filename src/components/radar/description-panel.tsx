"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  DESCRIPTION_SECTIONS,
  type DescriptionSectionKey,
} from "@/lib/radar/description";
import { updateRadarAction } from "@/server/radars/actions";
import type { RadarRef } from "@/components/radar/field-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The rendered markdown is produced on the server and handed in as
 * `children`; this component only owns the edit toggle and the form. That
 * keeps Shiki highlighting server-side while the editor stays interactive.
 */
export function DescriptionPanel({
  radar,
  values,
  children,
}: {
  radar: RadarRef;
  values: Record<DescriptionSectionKey, string | null>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const patch = Object.fromEntries(
      DESCRIPTION_SECTIONS.map((section) => {
        const raw = String(form.get(section.key) ?? "").trim();
        return [section.key, section.required ? raw : raw || null];
      }),
    );

    startTransition(async () => {
      const result = await updateRadarAction({
        radarId: radar.id,
        number: radar.number,
        expectedVersion: radar.version,
        patch,
      });
      if (result.ok) {
        setEditing(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!editing) {
    return (
      <section className="rounded-lg border">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <h2 className="text-sm font-medium">Description</h2>
          <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
        </header>
        <div className="p-4">{children}</div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">Editing description</h2>
        <Button variant="ghost" size="xs" onClick={() => setEditing(false)}>
          <X /> Cancel
        </Button>
      </header>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 p-4">
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
              defaultValue={values[section.key] ?? ""}
              className="font-mono text-xs"
            />
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            Save description
          </Button>
        </div>
      </form>
    </section>
  );
}
