"use client";

import { useRouter } from "next/navigation";
import { Columns3, Group } from "lucide-react";
import { COLUMN_FIELDS, FIELDS, GROUPABLE_FIELDS } from "@/lib/search/fields";
import { radarsHref } from "@/lib/search/url";
import { DEFAULT_COLUMNS, type FieldId, type RadarQuery } from "@/lib/search/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ViewOptions({ query }: { query: RadarQuery }) {
  const router = useRouter();

  function setGroup(group: FieldId | null) {
    router.push(radarsHref({ ...query, group }));
  }

  function toggleColumn(id: FieldId) {
    const columns = query.columns.includes(id)
      ? query.columns.filter((c) => c !== id)
      : // keep the registry's order rather than click order
        COLUMN_FIELDS.map((f) => f.id).filter(
          (f) => f === id || query.columns.includes(f),
        );
    if (columns.length === 0) return;
    router.push(radarsHref({ ...query, columns }));
  }

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs">
              <Group />
              {query.group ? FIELDS[query.group].label : "Group"}
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setGroup(null)}>None</DropdownMenuItem>
          <DropdownMenuSeparator />
          {GROUPABLE_FIELDS.map((id) => (
            <DropdownMenuItem key={id} onClick={() => setGroup(id)}>
              {FIELDS[id].label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="outline" size="xs">
              <Columns3 /> Columns
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
          {COLUMN_FIELDS.map((field) => (
            <DropdownMenuItem
              key={field.id}
              closeOnClick={false}
              onClick={() => toggleColumn(field.id)}
            >
              <Checkbox
                checked={query.columns.includes(field.id)}
                aria-hidden
                tabIndex={-1}
              />
              {field.column?.header}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              router.push(radarsHref({ ...query, columns: DEFAULT_COLUMNS }))
            }
          >
            Reset to defaults
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
