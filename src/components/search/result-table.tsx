"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "cn";
import type { RadarRow } from "@/server/radars/queries";
import { FIELDS, type OptionSources } from "@/lib/search/fields";
import { radarsHref, withSort } from "@/lib/search/url";
import type { FieldId, RadarQuery } from "@/lib/search/types";
import { compactDate } from "@/lib/radar/format";
import {
  CLASSIFICATION_LABEL,
  SUBSTATE_LABEL,
  PRIORITY_LABEL,
  STATE_LABEL,
} from "@/lib/radar/taxonomy";
import {
  PriorityBadge,
  StateBadge,
  ToneBadge,
  UserChip,
} from "@/components/radar/badges";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkEditBar } from "@/components/search/bulk-edit-bar";

function cell(row: RadarRow, id: FieldId) {
  switch (id) {
    case "number":
      return (
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {row.number}
        </span>
      );
    case "title":
      return <span className="truncate font-medium">{row.title}</span>;
    case "state":
      return <StateBadge state={row.state} />;
    case "substate":
      return (
        <span className="text-muted-foreground">
          {SUBSTATE_LABEL[row.substate]}
        </span>
      );
    case "priority":
      return <PriorityBadge priority={row.priority} />;
    case "classification":
      return (
        <span className="text-muted-foreground truncate">
          {CLASSIFICATION_LABEL[row.classification]}
        </span>
      );
    case "assignee":
      return <UserChip person={row.assignee} />;
    case "originator":
      return <UserChip person={row.originator} />;
    case "component":
      return (
        <span className="text-muted-foreground truncate">{row.component.path}</span>
      );
    case "componentVersion":
      return (
        <span className="text-muted-foreground">
          {row.componentVersion?.name ?? "—"}
        </span>
      );
    case "milestone":
      return (
        <span className="text-muted-foreground">{row.milestone?.name ?? "—"}</span>
      );
    case "keyword":
      return (
        <span className="flex flex-wrap gap-1">
          {row.keywords.map((k) => (
            <ToneBadge key={k.keyword.name} tone="slate">
              {k.keyword.label}
            </ToneBadge>
          ))}
        </span>
      );
    case "isRegression":
      return (
        <span className="text-muted-foreground">
          {row.isRegression ? "Yes" : "—"}
        </span>
      );
    case "reproducibility":
      return <span className="text-muted-foreground">{row.reproducibility}</span>;
    case "createdAt":
    case "updatedAt":
    case "lastActivityAt":
    case "stateChangedAt":
    case "resolvedAt":
    case "dueDate":
      return (
        <span className="text-muted-foreground tabular-nums">
          {compactDate(row[id])}
        </span>
      );
    default:
      return null;
  }
}

function groupLabel(row: RadarRow, group: FieldId): string {
  switch (group) {
    case "state":
      return STATE_LABEL[row.state];
    case "substate":
      return SUBSTATE_LABEL[row.substate];
    case "priority":
      return PRIORITY_LABEL[row.priority];
    case "assignee":
      return row.assignee?.name ?? "Unassigned";
    case "component":
      return row.component.path;
    case "milestone":
      return row.milestone?.name ?? "No milestone";
    case "classification":
      return CLASSIFICATION_LABEL[row.classification];
    default:
      return "";
  }
}

export function ResultTable({
  rows,
  query,
  total,
  sources,
}: {
  rows: RadarRow[];
  query: RadarQuery;
  total: number;
  sources: OptionSources;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const columns = query.columns.filter((id) => FIELDS[id]?.column);

  const groups = useMemo(() => {
    if (!query.group) return [{ label: null as string | null, rows }];
    const map = new Map<string, RadarRow[]>();
    for (const row of rows) {
      const label = groupLabel(row, query.group);
      const bucket = map.get(label);
      if (bucket) bucket.push(row);
      else map.set(label, [row]);
    }
    return [...map].map(([label, groupRows]) => ({ label, rows: groupRows }));
  }, [rows, query.group]);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-12 text-center text-sm">
        No radars match this search.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground border-b text-xs">
            <tr>
              <th className="w-9 px-2 py-2">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              {columns.map((id) => {
                const field = FIELDS[id];
                const sort = query.sort.find((s) => s.field === id);
                return (
                  <th
                    key={id}
                    className={cn(
                      "px-2 py-2 text-left font-medium",
                      field.column?.className,
                    )}
                  >
                    {field.orderBy ? (
                      <button
                        onClick={() => router.push(radarsHref(withSort(query, id)))}
                        className="hover:text-foreground inline-flex items-center gap-1"
                      >
                        {field.column?.header}
                        {sort &&
                          (sort.dir === "asc" ? (
                            <ArrowUp className="size-3" />
                          ) : (
                            <ArrowDown className="size-3" />
                          ))}
                      </button>
                    ) : (
                      field.column?.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {groups.map((group) => (
              <Fragment key={group.label ?? "all"}>
                {group.label !== null && (
                  <tr className="bg-muted/20">
                    <td
                      colSpan={columns.length + 1}
                      className="text-muted-foreground px-3 py-1.5 text-xs font-medium"
                    >
                      {group.label}
                      <span className="ml-2 opacity-60">{group.rows.length}</span>
                    </td>
                  </tr>
                )}
                {group.rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "hover:bg-muted/40 border-b last:border-0",
                      selected.has(row.id) && "bg-muted/60",
                    )}
                  >
                    <td className="px-2 py-1.5 align-middle">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggleOne(row.id)}
                        aria-label={`Select radar ${row.number}`}
                      />
                    </td>
                    {columns.map((id) => (
                      <td
                        key={id}
                        className={cn(
                          "max-w-0 px-2 py-1.5 align-middle",
                          FIELDS[id].column?.className,
                        )}
                      >
                        <Link
                          href={`/radars/${row.number}`}
                          className="block truncate"
                        >
                          {cell(row, id)}
                        </Link>
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination query={query} total={total} shown={rows.length} />

      {selected.size > 0 && (
        <BulkEditBar
          ids={[...selected]}
          sources={sources}
          onDone={() => setSelected(new Set())}
        />
      )}
    </>
  );
}

function Pagination({
  query,
  total,
  shown,
}: {
  query: RadarQuery;
  total: number;
  shown: number;
}) {
  const first = (query.page - 1) * query.perPage + 1;
  const last = first + shown - 1;
  const hasPrev = query.page > 1;
  const hasNext = last < total;

  return (
    <div className="text-muted-foreground flex items-center justify-between px-1 text-xs">
      <span>
        {first}–{last} of {total}
      </span>
      <span className="flex gap-2">
        {hasPrev && (
          <Link
            href={radarsHref({ ...query, page: query.page - 1 })}
            className="hover:text-foreground"
          >
            Previous
          </Link>
        )}
        {hasNext && (
          <Link
            href={radarsHref({ ...query, page: query.page + 1 })}
            className="hover:text-foreground"
          >
            Next
          </Link>
        )}
      </span>
    </div>
  );
}
