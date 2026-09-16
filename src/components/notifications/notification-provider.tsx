"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

const NotificationContext = createContext<{
  unreadCount: number;
  markRead: (count?: number) => void;
}>({
  unreadCount: 0,
  markRead: () => {},
});

export const useUnreadCount = () => useContext(NotificationContext).unreadCount;

/**
 * Drop the badge by `count` right now, without waiting for a server render.
 *
 * For reads that happen *while navigating away*: /inbox and a radar page share
 * the app layout, and the App Router does not re-render a shared layout on
 * navigation between them — so the badge would otherwise keep the count it had
 * until something forced a refresh. A later server render still wins, so this
 * being slightly early or slightly wrong is self-correcting.
 */
export const useMarkRead = () => useContext(NotificationContext).markRead;

/**
 * Radar chat rides the same stream.
 *
 * A second context rather than widening the first, so the notification badge's
 * consumers keep the API they have. The provider owns the one EventSource in
 * the app, so anything live has to be routed from here — a chat panel opening
 * its own stream would be a second long-lived serverless invocation per tab.
 */
export type ChatFrame =
  | {
      type: "chat";
      radarId: string;
      radarNumber: number;
      message: {
        id: string;
        body: string;
        createdAt: string;
        author: {
          id: string;
          name: string;
          handle: string;
          image: string | null;
        };
      };
    }
  | {
      type: "chat-removed";
      radarId: string;
      radarNumber: number;
      messageId: string;
    };

type ChatListener = (frame: ChatFrame) => void;

const ChatStreamContext = createContext<{
  /** Returns its own unsubscribe, so an effect can `return subscribe(...)`. */
  subscribe: (radarId: string, listener: ChatListener) => () => void;
  /** True once the stream has given up: no chat frames are arriving. */
  degraded: boolean;
}>({ subscribe: () => () => {}, degraded: false });

export const useChatStream = () => useContext(ChatStreamContext);

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
  const [serverCount, setServerCount] = useState(initialUnreadCount);
  const lastSeenId = useRef<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  // The stream only ever pushes new notifications, so reads have to come from
  // the server render. `router.refresh()` — what marking read calls — re-runs
  // the layout but deliberately preserves client state, so without this the
  // badge keeps the count it mounted with until a full page load.
  //
  // Adopt the prop only when it actually changes: a refresh triggered by
  // something unrelated re-sends the same count, and that must not stomp on a
  // fresher number the stream has since pushed.
  if (serverCount !== initialUnreadCount) {
    setServerCount(initialUnreadCount);
    setUnreadCount(initialUnreadCount);
  }

  const markRead = useCallback((count = 1) => {
    setUnreadCount((current) => Math.max(0, current - count));
  }, []);

  // --- Chat routing ------------------------------------------------------
  const chatListeners = useRef(new Map<string, Set<ChatListener>>());

  const subscribeChat = useCallback(
    (radarId: string, listener: ChatListener) => {
      const listeners = chatListeners.current.get(radarId) ?? new Set();
      listeners.add(listener);
      chatListeners.current.set(radarId, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) chatListeners.current.delete(radarId);
      };
    },
    [],
  );

  const deliverChat = useCallback(
    (frame: ChatFrame) => {
      const listeners = chatListeners.current.get(frame.radarId);
      if (listeners?.size) {
        for (const listener of listeners) listener(frame);
        return;
      }

      // Nobody has that radar's chat open. A panel that *is* mounted shows its
      // own badge, so toasting as well would be saying it twice.
      if (frame.type !== "chat") return;
      toast(`Chat · ${frame.radarNumber}`, {
        description: `${frame.message.author.name}: ${frame.message.body}`,
        action: {
          label: "Open",
          onClick: () => router.push(`/radars/${frame.radarNumber}?chat=1`),
        },
      });
    },
    [router],
  );

  const chatStream = useMemo(
    () => ({ subscribe: subscribeChat, degraded: useFallback }),
    [subscribeChat, useFallback],
  );

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
          } else if (
            payload.type === "chat" ||
            payload.type === "chat-removed"
          ) {
            deliverChat(payload as ChatFrame);
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
  }, [announce, deliverChat, useFallback]);

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
    <NotificationContext value={{ unreadCount, markRead }}>
      <ChatStreamContext value={chatStream}>{children}</ChatStreamContext>
    </NotificationContext>
  );
}
