"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Command } from "cmdk";
import { FileText, ListFilter, Plus, Search } from "lucide-react";
import { paletteSearchAction, type PaletteResults } from "@/server/palette/actions";
import { PRIORITY_SHORT, STATE_LABEL } from "@/lib/radar/taxonomy";
import type { RadarState } from "@/generated/prisma/enums";

/**
 * Cmd+K. Jumps to a radar by number or title, runs a saved query, or files a
 * new radar. Also the target of the `/` shortcut.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PaletteResults>({
    radars: [],
    queries: [],
  });
  const [, startTransition] = useTransition();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }
      // cmdk's input swallows Escape, so close from the document instead.
      if (event.key === "Escape") setOpen(false);
    };
    const onOpenRequest = () => setOpen(true);

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("radar:open-palette", onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("radar:open-palette", onOpenRequest);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const next = await paletteSearchAction(term);
        if (!cancelled) setResults(next);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term, open]);

  function go(href: string) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <Command
        label="Command palette"
        className="bg-popover text-popover-foreground w-full max-w-xl overflow-hidden rounded-xl border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        shouldFilter={false}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="text-muted-foreground size-4" />
          <Command.Input
            autoFocus
            value={term}
            onValueChange={setTerm}
            placeholder="Jump to a radar, run a query…"
            className="placeholder:text-muted-foreground h-11 w-full bg-transparent text-sm outline-none"
          />
          <kbd className="text-muted-foreground border-border rounded border px-1.5 py-0.5 text-[0.65rem]">
            esc
          </kbd>
        </div>

        <Command.List className="max-h-80 overflow-y-auto p-1.5">
          <Command.Empty className="text-muted-foreground p-4 text-center text-sm">
            Nothing matches “{term}”.
          </Command.Empty>

          {results.radars.length > 0 && (
            <Command.Group
              heading="Radars"
              className="text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs"
            >
              {results.radars.map((radar) => (
                <Command.Item
                  key={radar.number}
                  value={`radar-${radar.number}`}
                  onSelect={() => go(`/radars/${radar.number}`)}
                  className="data-[selected=true]:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <FileText className="size-4 shrink-0 opacity-60" />
                  <span className="text-muted-foreground font-mono text-xs tabular-nums">
                    {radar.number}
                  </span>
                  <span className="text-foreground flex-1 truncate">
                    {radar.title}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {PRIORITY_SHORT[radar.priority]} ·{" "}
                    {STATE_LABEL[radar.state as RadarState]}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {results.queries.length > 0 && (
            <Command.Group
              heading="Saved queries"
              className="text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs"
            >
              {results.queries.map((query) => (
                <Command.Item
                  key={query.id}
                  value={`query-${query.id}`}
                  onSelect={() => go(`/radars?${query.params}`)}
                  className="data-[selected=true]:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
                >
                  <ListFilter className="size-4 shrink-0 opacity-60" />
                  <span className="flex-1 truncate">{query.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group
            heading="Actions"
            className="text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs"
          >
            <Command.Item
              value="new-radar"
              onSelect={() => go("/radars/new")}
              className="data-[selected=true]:bg-muted flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              <Plus className="size-4 shrink-0 opacity-60" />
              File a new radar
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
