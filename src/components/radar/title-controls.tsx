"use client";

import { useState } from "react";
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

  async function save() {
    const next = value.trim();
    if (!next || next === title) {
      setEditing(false);
      setValue(title);
      return;
    }
    const ok = await patch({ title: next });
    if (ok) setEditing(false);
    else setValue(title);
  }

  if (editing) {
    return (
      <Input
        autoFocus
        value={value}
        disabled={pending}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
          if (event.key === "Escape") {
            setValue(title);
            setEditing(false);
          }
        }}
        className="h-8 text-lg font-semibold"
      />
    );
  }

  return (
    <h1
      className="group flex items-center gap-2 text-lg leading-tight font-semibold"
      onDoubleClick={() => setEditing(true)}
    >
      {title}
      <button
        onClick={() => setEditing(true)}
        aria-label="Edit title"
        className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Pencil className="size-3.5" />
      </button>
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
