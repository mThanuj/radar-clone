"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
};

/**
 * Focus inside an open dialog, menu, listbox or popover belongs to that layer.
 * Without this, arrowing through the assignee picker and pressing `c` navigates
 * away to /radars/new — the form-control check above doesn't catch a <button>
 * inside a menu.
 */
const inOverlay = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return !!el?.closest?.(
    '[role="dialog"],[role="menu"],[role="listbox"],[data-slot="popover-content"]',
  );
};

/**
 * Global single-key shortcuts, Linear style. `g` starts a chord (g+r, g+b…),
 * everything else fires immediately. Never fires while you're typing.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const chord = useRef<string | null>(null);
  const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || inOverlay(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
        return;

      const key = event.key.toLowerCase();

      if (chord.current === "g") {
        chord.current = null;
        if (chordTimer.current) clearTimeout(chordTimer.current);
        const destination = {
          i: "/inbox",
          r: "/radars",
          b: "/board",
          t: "/timeline",
          m: "/milestones",
          c: "/components",
        }[key];
        if (destination) {
          event.preventDefault();
          router.push(destination);
        }
        return;
      }

      if (key === "g") {
        chord.current = "g";
        chordTimer.current = setTimeout(() => (chord.current = null), 1200);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        router.push("/radars/new");
        return;
      }

      if (key === "/") {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("radar:open-palette"));
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return null;
}
