"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Check, ListFilter, Plus, Search, X } from "lucide-react";
import { cn } from "cn";
import {
  FIELDS,
  FILTERABLE_FIELDS,
  optionsFor,
  type FieldDef,
  type OptionSources,
} from "@/lib/search/fields";
import { radarsHref, withCondition, withoutField } from "@/lib/search/url";
import {
  NULLARY_OPERATORS,
  type Condition,
  type FieldId,
  type FilterError,
  type FilterOperator,
  type RadarQuery,
} from "@/lib/search/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SaveQueryDialog } from "@/components/search/save-query-dialog";

const OPERATOR_LABEL: Record<FilterOperator, string> = {
  is: "is",
  isNot: "is not",
  in: "is",
  notIn: "is not",
  contains: "contains",
  notContains: "does not contain",
  lt: "before",
  lte: "on or before",
  gt: "after",
  gte: "on or after",
  isSet: "is set",
  isNotSet: "is empty",
  under: "under",
};

function labelForValue(field: FieldDef, value: string, sources: OptionSources) {
  if (value === "me") return "me";
  if (value === "none") return "none";
  const option = optionsFor(field, sources).find((o) => o.value === value);
  return option?.label ?? value;
}

function FilterChip({
  condition,
  query,
  sources,
}: {
  condition: Condition;
  query: RadarQuery;
  sources: OptionSources;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const field = FIELDS[condition.field];
  const options = optionsFor(field, sources);
  const nullary = NULLARY_OPERATORS.includes(condition.op);

  const summary = nullary
    ? ""
    : condition.values
        .map((v) => labelForValue(field, v, sources))
        .join(", ");

  function apply(next: Partial<Condition>) {
    router.push(
      radarsHref(withCondition(query, { ...condition, ...next } as Condition)),
    );
  }

  function toggleValue(value: string) {
    const values = condition.values.includes(value)
      ? condition.values.filter((v) => v !== value)
      : [...condition.values, value];
    if (values.length === 0) {
      router.push(radarsHref(withoutField(query, condition.field)));
      return;
    }
    apply({ values });
  }

  return (
    <span className="border-border bg-background inline-flex h-7 items-center rounded-md border text-xs">
      <span className="text-muted-foreground px-2">{field.label}</span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button className="hover:bg-muted h-full border-x px-2 font-medium">
              {OPERATOR_LABEL[condition.op]}
              {summary && <span className="ml-1.5">{summary}</span>}
            </button>
          }
        />
        <PopoverContent align="start" className="w-64 p-0">
          <div className="flex flex-col gap-1 border-b p-1">
            {field.ops.map((op) => (
              <button
                key={op}
                onClick={() => {
                  apply({
                    op,
                    values: NULLARY_OPERATORS.includes(op)
                      ? []
                      : condition.values,
                  });
                  if (NULLARY_OPERATORS.includes(op)) setOpen(false);
                }}
                className={cn(
                  "hover:bg-muted flex items-center justify-between rounded px-2 py-1 text-left text-xs",
                  op === condition.op && "font-medium",
                )}
              >
                {OPERATOR_LABEL[op]}
                {op === condition.op && <Check className="size-3" />}
              </button>
            ))}
          </div>

          {!nullary && (
            <ValuePicker
              field={field}
              options={options}
              selected={condition.values}
              onToggle={toggleValue}
              onSetFree={(value) => apply({ values: [value] })}
            />
          )}
        </PopoverContent>
      </Popover>

      <button
        aria-label={`Remove ${field.label} filter`}
        onClick={() => router.push(radarsHref(withoutField(query, condition.field)))}
        className="hover:bg-muted text-muted-foreground hover:text-foreground h-full rounded-r-md px-1.5"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

function ValuePicker({
  field,
  options,
  selected,
  onToggle,
  onSetFree,
}: {
  field: FieldDef;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onSetFree: (value: string) => void;
}) {
  const [term, setTerm] = useState("");

  const withMagic = useMemo(() => {
    const extras =
      field.kind === "user"
        ? [
            { value: "me", label: "me" },
            { value: "none", label: "none" },
          ]
        : [];
    return [...extras, ...options];
  }, [field.kind, options]);

  if (field.kind === "text" || field.kind === "date" || (field.kind === "number" && !options.length)) {
    return (
      <form
        className="p-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = String(new FormData(event.currentTarget).get("value") ?? "");
          if (value.trim()) onSetFree(value.trim());
        }}
      >
        <Input
          name="value"
          autoFocus
          defaultValue={selected[0] ?? ""}
          placeholder={field.kind === "date" ? "-7d, today, 2026-01-15" : "Value"}
          className="h-8 text-xs"
        />
      </form>
    );
  }

  const filtered = withMagic.filter((o) =>
    o.label.toLowerCase().includes(term.toLowerCase()),
  );

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 border-b px-2">
        <Search className="text-muted-foreground size-3" />
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Filter…"
          className="h-8 w-full bg-transparent text-xs outline-none"
        />
      </div>
      <div className="max-h-56 overflow-y-auto p-1">
        {filtered.length === 0 && (
          <p className="text-muted-foreground p-2 text-xs">No matches.</p>
        )}
        {filtered.map((option) => (
          <button
            key={option.value}
            onClick={() => onToggle(option.value)}
            className="hover:bg-muted flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs"
          >
            <span className="truncate">{option.label}</span>
            {selected.includes(option.value) && <Check className="size-3" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function AddFilter({
  query,
  sources,
}: {
  query: RadarQuery;
  sources: OptionSources;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");

  const used = new Set(query.conditions.map((c) => c.field));
  const available = FILTERABLE_FIELDS.filter(
    (f) => !used.has(f.id) && f.label.toLowerCase().includes(term.toLowerCase()),
  );

  function add(field: FieldDef) {
    const op = field.defaultOp;
    const firstOption = optionsFor(field, sources)[0];
    const values = NULLARY_OPERATORS.includes(op)
      ? []
      : field.kind === "user"
        ? ["me"]
        : firstOption
          ? [firstOption.value]
          : [];
    // A field with no obvious starting value would create an invalid URL, so
    // only commit once there is something to filter on.
    if (!NULLARY_OPERATORS.includes(op) && values.length === 0) {
      setOpen(false);
      return;
    }
    setOpen(false);
    setTerm("");
    router.push(radarsHref(withCondition(query, { field: field.id, op, values })));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="xs" className="gap-1">
            <Plus /> Filter
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex items-center gap-1.5 border-b px-2">
          <ListFilter className="text-muted-foreground size-3" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Filter by…"
            className="h-8 w-full bg-transparent text-xs outline-none"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {available.map((field) => (
            <button
              key={field.id}
              onClick={() => add(field)}
              className="hover:bg-muted w-full rounded px-2 py-1 text-left text-xs"
            >
              {field.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  query,
  errors,
  sources,
}: {
  query: RadarQuery;
  errors: FilterError[];
  sources: OptionSources;
}) {
  const router = useRouter();
  const [text, setText] = useState(query.text ?? "");

  function submitText(event: React.FormEvent) {
    event.preventDefault();
    router.push(radarsHref({ ...query, text: text.trim() || undefined, page: 1 }));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form onSubmit={submitText} className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search radars…"
          className="h-7 w-56 pl-7 text-xs"
        />
      </form>

      {query.conditions.map((condition) => (
        <FilterChip
          key={condition.field}
          condition={condition}
          query={query}
          sources={sources}
        />
      ))}

      <AddFilter query={query} sources={sources} />

      {query.conditions.length > 0 && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() =>
            router.push(radarsHref({ ...query, conditions: [], text: undefined }))
          }
        >
          Clear
        </Button>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        <SaveQueryDialog query={query} />
      </div>

      {errors.map((error) => (
        <span
          key={error.param}
          className="text-destructive bg-destructive/10 inline-flex h-7 items-center rounded-md px-2 text-xs"
          role="alert"
        >
          {error.message}
        </span>
      ))}
    </div>
  );
}

export type { FieldId };
