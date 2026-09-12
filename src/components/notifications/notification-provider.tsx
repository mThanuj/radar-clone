"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { REASONS } from "@/lib/notifications/catalog";
import type { NotificationReason } from "@/generated/prisma/enums";

type LatestNotification = {
  id: string;
  reason: string;
  radarNumber: number;
  radarTitle: string;
};

const NotificationContext = createContext<{ unreadCount: number }>({
  unreadCount: 0,
});

export const useUnreadCount = () => useContext(NotificationContext).unreadCount;

const POLL_MS = 20_000;
const MAX_STREAM_FAILURES = 3;

/**
 * Keeps the unread badge live and toasts arrivals.
 *
 * Tries the SSE stream first and falls back to polling after a few failed
 * reconnects — a broker outage should degrade to "a few seconds late", not to
 * silence. Polling also pauses while the tab is hidden, so a backgrounded tab
 * costs nothing.
 */
export function NotificationProvider({
  initialUnreadCount,
  children,
}: {
  initialUnreadCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const lastSeenId = useRef<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const announce = useCallback(
    (latest: LatestNotification | null, count: number) => {
      setUnreadCount(count);
      if (!latest || latest.id === lastSeenId.current) return;

      // Don't toast the backlog that already existed when the page loaded.
      const isFirstObservation = lastSeenId.current === null;
      lastSeenId.current = latest.id;
      if (isFirstObservation) return;

      const label =
        REASONS[latest.reason as NotificationReason]?.label ?? "Update";
      toast(`${label} · ${latest.radarNumber}`, {
        description: latest.radarTitle,
        action: {
          label: "Open",
          onClick: () => router.push(`/radars/${latest.radarNumber}`),
        },
      });
      router.refresh();
    },
    [router],
  );

  // --- SSE ---------------------------------------------------------------
  useEffect(() => {
    if (useFallback) return;

    let source: EventSource | null = null;
    let failures = 0;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      source = new EventSource("/api/notifications/stream");

      source.onmessage = (event) => {
        failures = 0;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "hello") {
            setUnreadCount(payload.unreadCount);
          } else if (payload.type === "notification") {
            announce(payload.notification, payload.unreadCount);
          }
        } catch {
          // Ignore frames we can't parse rather than tearing down the stream.
        }
      };

      source.onerror = () => {
        source?.close();
        failures += 1;
        if (failures >= MAX_STREAM_FAILURES) {
          setUseFallback(true);
          return;
        }
        reconnect = setTimeout(connect, 2000 * failures);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      source?.close();
    };
  }, [announce, useFallback]);

  // --- Polling fallback --------------------------------------------------
  useEffect(() => {
    if (!useFallback) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/notifications/unread", {
            cache: "no-store",
          });
          if (response.ok) {
            const data = await response.json();
            announce(data.latest, data.unreadCount);
          }
        } catch {
          // Offline or mid-deploy; try again next tick.
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };

    timer = setTimeout(tick, POLL_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [announce, useFallback]);

  return (
    <NotificationContext value={{ unreadCount }}>{children}</NotificationContext>
  );
}
