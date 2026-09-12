"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { cn } from "cn";
import type { RadarState } from "@/generated/prisma/enums";
import { TRANSITIONS } from "@/lib/radar/state-machine";
import { STATE_LABEL, SUBSTATE_LABEL } from "@/lib/radar/taxonomy";
import { updateRadarAction } from "@/server/radars/actions";
import type { RadarRow } from "@/server/radars/queries";
import { PriorityBadge, UserChip } from "@/components/radar/badges";

type Column = { state: RadarState; rows: RadarRow[]; total: number };

function Card({ row, dragging }: { row: RadarRow; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-1.5 rounded-lg border p-2.5 text-sm shadow-xs",
        dragging && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {row.number}
        </span>
        <PriorityBadge priority={row.priority} />
        <span className="text-muted-foreground ml-auto text-[0.7rem]">
          {SUBSTATE_LABEL[row.substate]}
        </span>
      </div>
      <Link
        href={`/radars/${row.number}`}
        className="line-clamp-2 font-medium hover:underline"
      >
        {row.title}
      </Link>
      <div className="flex items-center justify-between">
        <UserChip person={row.assignee} className="text-xs" />
        {row.milestone && (
          <span className="text-muted-foreground truncate text-[0.7rem]">
            {row.milestone.name}
          </span>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ row }: { row: RadarRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.id,
    data: { row },
  });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes}>
      <Card row={row} dragging={isDragging} />
    </div>
  );
}

function DroppableColumn({
  column,
  allowed,
  children,
}: {
  column: Column;
  allowed: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.state });

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-sm font-medium">{STATE_LABEL[column.state]}</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {column.total}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-40 flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors",
          isOver && allowed && "border-primary bg-primary/5",
          isOver && !allowed && "border-destructive bg-destructive/5",
          !isOver && "border-transparent",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function BoardView({ columns }: { columns: Column[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [active, setActive] = useState<RadarRow | null>(null);
  // Optimistic move so the card doesn't snap back while the server works.
  const [moved, setMoved] = useState<Record<string, RadarState>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function onDragStart(event: DragStartEvent) {
    setActive((event.active.data.current?.row as RadarRow) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    const row = event.active.data.current?.row as RadarRow | undefined;
    setActive(null);
    if (!row || !event.over) return;

    const target = event.over.id as RadarState;
    if (target === row.state) return;

    // Same table the server enforces — an illegal drop never leaves the client.
    if (!TRANSITIONS[row.state].includes(target)) {
      toast.error(
        `${STATE_LABEL[row.state]} cannot move straight to ${STATE_LABEL[target]}.`,
      );
      return;
    }

    setMoved((current) => ({ ...current, [row.id]: target }));

    startTransition(async () => {
      const result = await updateRadarAction({
        radarId: row.id,
        number: row.number,
        patch: { state: target },
      });
      if (result.ok) {
        router.refresh();
      } else {
        setMoved((current) => {
          const next = { ...current };
          delete next[row.id];
          return next;
        });
        toast.error(result.error);
      }
    });
  }

  const display = columns.map((column) => ({
    ...column,
    rows: columns
      .flatMap((c) => c.rows)
      .filter((row) => (moved[row.id] ?? row.state) === column.state),
  }));

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div className="flex gap-3 overflow-x-auto pb-4">
        {display.map((column) => (
          <DroppableColumn
            key={column.state}
            column={column}
            allowed={!active || TRANSITIONS[active.state].includes(column.state)}
          >
            {column.rows.map((row) => (
              <DraggableCard key={row.id} row={row} />
            ))}
            {column.rows.length === 0 && (
              <p className="text-muted-foreground p-2 text-xs">Nothing here.</p>
            )}
          </DroppableColumn>
        ))}
      </div>

      <DragOverlay>{active ? <Card row={active} /> : null}</DragOverlay>
    </DndContext>
  );
}
