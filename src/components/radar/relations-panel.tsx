"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { RelationType } from "@/generated/prisma/enums";
import { RELATION_META, RELATION_TYPES } from "@/lib/radar/relations";
import type { RadarDetail } from "@/server/radars/queries";
import { addRelationAction, removeRelationAction } from "@/server/relations/actions";
import { StateBadge } from "@/components/radar/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Row = {
  id: string;
  label: string;
  other: { number: number; title: string; state: string; substate: string };
};

export function RelationsPanel({ radar }: { radar: RadarDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<RelationType>("RELATED_TO");

  // Edges are stored once; the inverse label is what makes the other side
  // read correctly without a mirrored row.
  const rows: Row[] = [
    ...radar.outgoing.map((edge) => ({
      id: edge.id,
      label: RELATION_META[edge.type].forward,
      other: edge.target,
    })),
    ...radar.incoming.map((edge) => ({
      id: edge.id,
      label: RELATION_META[edge.type].inverse,
      other: edge.source,
    })),
  ];

  function add(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetNumber = Number(form.get("number"));
    if (!Number.isFinite(targetNumber)) return;

    startTransition(async () => {
      const result = await addRelationAction({
        radarId: radar.id,
        number: radar.number,
        targetNumber,
        type,
      });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function remove(relationId: string) {
    startTransition(async () => {
      const result = await removeRelationAction({
        relationId,
        radarId: radar.id,
        number: radar.number,
      });
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  return (
    <section className="rounded-lg border">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="text-sm font-medium">
          Relationships
          {rows.length > 0 && (
            <span className="text-muted-foreground ml-1.5 text-xs">
              {rows.length}
            </span>
          )}
        </h2>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="xs">
                <Plus /> Add
              </Button>
            }
          />
          <PopoverContent align="end" className="w-72 p-3">
            <form onSubmit={add} className="flex flex-col gap-2">
              <select
                value={type}
                onChange={(event) => setType(event.target.value as RelationType)}
                className="border-input h-8 rounded-md border bg-transparent px-2 text-sm"
              >
                {RELATION_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {RELATION_META[value].forward}
                  </option>
                ))}
              </select>
              <Input
                name="number"
                inputMode="numeric"
                placeholder="Radar number, e.g. 100000042"
                className="h-8 text-sm"
                required
              />
              <Button type="submit" size="sm" disabled={pending}>
                Add relationship
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </header>

      {rows.length === 0 ? (
        <p className="text-muted-foreground p-4 text-sm">
          Nothing linked yet.
        </p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-2 px-4 py-2">
              <span className="text-muted-foreground w-24 shrink-0 text-xs">
                {row.label}
              </span>
              <Link
                href={`/radars/${row.other.number}`}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {row.other.number}
                </span>{" "}
                {row.other.title}
              </Link>
              <StateBadge
                state={row.other.state as RadarDetail["state"]}
                substate={row.other.substate as RadarDetail["substate"]}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Remove relationship"
                onClick={() => remove(row.id)}
                disabled={pending}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
