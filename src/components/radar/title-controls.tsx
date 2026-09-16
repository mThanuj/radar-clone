"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { rdarUri } from "@/lib/radar/format";
import {
  useRadarPatch,
  type RadarRef,
} from "@/components/radar/field-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditableTitle({
  radar,
  title,
}: {
  radar: RadarRef;
  title: string;
}) {
  const { patch, pending } = useRadarPatch(radar);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const editButton = useRef<HTMLButtonElement>(null);
  // Leaving edit mode unmounts the focused input, which drops focus to <body>.
  // Hand it back to the control that opened the editor. A ref, not state: this
  // only needs to survive to the next commit, not cause one.
  const returnFocus = useRef(false);
  useEffect(() => {
    if (returnFocus.current && !editing) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  function stopEditing() {
    setEditing(false);
    returnFocus.current = true;
  }

  async function save() {
    const next = value.trim();
    if (!next || next === title) {
      stopEditing();
      setValue(title);
      return;
    }
    const ok = await patch({ title: next });
    if (ok) stopEditing();
    else setValue(title);
  }

  // The field stays inside the <h1>: swapping the heading out for a bare input
  // left the detail page with no h1 at all while editing.
  return (
    <h1
      className="group flex items-center gap-2 text-lg leading-tight font-semibold"
      onDoubleClick={editing ? undefined : () => setEditing(true)}
    >
      {editing ? (
        <Input
          autoFocus
          aria-label="Radar title"
          value={value}
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") {
              setValue(title);
              stopEditing();
            }
          }}
          className="h-8 text-lg font-semibold"
        />
      ) : (
        <>
          {title}
          <button
            ref={editButton}
            onClick={() => setEditing(true)}
            aria-label="Edit title"
            className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Pencil className="size-3.5" />
          </button>
        </>
      )}
    </h1>
  );
}

export function CopyRdarButton({ number }: { number: number }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(rdarUri(number));
    setCopied(true);
    toast.success("Copied rdar:// link");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button variant="ghost" size="xs" onClick={copy} className="gap-1.5">
      {copied ? <Check /> : <Link2 />}
      <span className="font-mono text-xs">{rdarUri(number)}</span>
    </Button>
  );
}

export function CopyTextButton({ text }: { text: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copy as text"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        toast.success("Copied radar as text");
      }}
    >
      <Copy />
    </Button>
  );
}
