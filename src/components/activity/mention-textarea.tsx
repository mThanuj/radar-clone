"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { mentionQueryAt } from "@/lib/markdown";
import { Avatar } from "@/components/radar/badges";
import { Textarea } from "@/components/ui/textarea";

export type MentionPerson = {
  id: string;
  name: string;
  handle: string;
  image?: string | null;
};

/** Enough to pick from without turning the composer into a scrolling list. */
const MAX_SUGGESTIONS = 6;

/**
 * Rank handle matches above name matches, and prefixes above substrings, so
 * typing "@sa" puts @sam first rather than whoever happens to sort first.
 */
function rank(person: MentionPerson, query: string): number {
  const handle = person.handle.toLowerCase();
  const name = person.name.toLowerCase();
  if (handle.startsWith(query)) return 0;
  if (name.startsWith(query)) return 1;
  if (handle.includes(query)) return 2;
  return 3;
}

function suggest(people: MentionPerson[], query: string): MentionPerson[] {
  const q = query.toLowerCase();
  return people
    .filter(
      (p) =>
        p.handle.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    )
    .sort((a, b) => rank(a, q) - rank(b, q) || a.name.localeCompare(b.name))
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * A Textarea that offers people when you type "@".
 *
 * Anchored under the field rather than at the caret: measuring a caret inside
 * a textarea means maintaining a mirror element that has to track every font
 * and wrap change, and the payoff is cosmetic.
 *
 * Keyboard first, because the whole point is not having to reach for the
 * mouse mid-sentence. Enter picks; ⌘↵ is left alone so it still submits.
 */
export function MentionTextarea({
  people,
  value,
  onValueChange,
  onKeyDown,
  className,
  ...props
}: Omit<React.ComponentProps<"textarea">, "value" | "onChange"> & {
  people: MentionPerson[];
  value: string;
  onValueChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(
    null,
  );
  const [active, setActive] = useState(0);

  // Set after an insertion, applied once React has rendered the new value —
  // writing to selectionStart before that would be clobbered by the re-render.
  const pendingCaret = useRef<number | null>(null);
  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !ref.current) return;
    pendingCaret.current = null;
    ref.current.focus();
    ref.current.setSelectionRange(caret, caret);
  }, [value]);

  const matches = trigger ? suggest(people, trigger.query) : [];
  const open = matches.length > 0;

  /** Recompute from wherever the caret now is — typing, arrowing or clicking. */
  function sync(element: HTMLTextAreaElement) {
    if (people.length === 0) return setTrigger(null);
    // A selection, rather than a caret, is never a mention in progress.
    if (element.selectionStart !== element.selectionEnd) return setTrigger(null);
    const next = mentionQueryAt(element.value, element.selectionStart);
    setTrigger(next);
    setActive(0);
  }

  function choose(person: MentionPerson) {
    if (!trigger || !ref.current) return;
    const caret = ref.current.selectionStart;
    const inserted = `@${person.handle} `;
    onValueChange(value.slice(0, trigger.start) + inserted + value.slice(caret));
    pendingCaret.current = trigger.start + inserted.length;
    setTrigger(null);
  }

  function keyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        return setActive((i) => (i + 1) % matches.length);
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        return setActive((i) => (i - 1 + matches.length) % matches.length);
      }
      // ⌘↵ belongs to the form, even with the menu open. Shift+Tab is
      // "get me out of this field", not "accept the suggestion".
      if (
        (event.key === "Enter" && !event.metaKey && !event.ctrlKey) ||
        (event.key === "Tab" && !event.shiftKey)
      ) {
        event.preventDefault();
        return choose(matches[active]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        // Otherwise this closes the dialog the composer might be sitting in.
        event.stopPropagation();
        return setTrigger(null);
      }
    }
    onKeyDown?.(event);
  }

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={ref}
        value={value}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={open ? "mention-suggestions" : undefined}
        aria-activedescendant={open ? `mention-option-${active}` : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
          sync(event.currentTarget);
        }}
        onSelect={(event) => sync(event.currentTarget)}
        onBlur={() => setTrigger(null)}
        onKeyDown={keyDown}
      />

      {open && (
        <ul
          id="mention-suggestions"
          role="listbox"
          className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg p-1 shadow-md ring-1 ring-foreground/10"
        >
          {matches.map((person, index) => (
            <li key={person.id}>
              <button
                type="button"
                id={`mention-option-${index}`}
                role="option"
                // The textarea keeps focus and drives this list via
                // aria-activedescendant, so the options must not be tab stops.
                tabIndex={-1}
                aria-selected={index === active}
                // Keeps focus in the textarea, so the caret we insert at is
                // still the caret the person was typing at.
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(person)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm",
                  index === active && "bg-muted",
                )}
              >
                <Avatar person={person} size={20} />
                <span className="truncate font-medium">{person.name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  @{person.handle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
