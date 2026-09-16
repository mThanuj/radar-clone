"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  deleteChatMessageAction,
  loadChatSinceAction,
  loadOlderChatAction,
  markChatReadAction,
  sendChatMessageAction,
  type ChatMessageWire,
} from "@/server/chat/actions";
import { useChatStream } from "@/components/notifications/notification-provider";

/** Poll cadence once the stream has given up. Chat sets an expectation of
 *  immediacy that comments do not, so it degrades to seconds late rather than
 *  to silence — but a panel nobody is looking at can wait a minute. */
const POLL_ACTIVE_MS = 15_000;
const POLL_IDLE_MS = 60_000;

export type ChatMessageView = ChatMessageWire;

/**
 * All of a radar chat's client state.
 *
 * Lives in a hook because it has to be held by the *tab shell*, not the chat
 * panel: Base UI unmounts a hidden tab panel, so state kept inside the panel
 * would be thrown away — and the unread badge could never move while you were
 * reading the activity feed.
 */
export function useRadarChat(args: {
  radarId: string;
  viewerId: string;
  active: boolean;
  initialMessages: ChatMessageView[];
  initialOlderCursor: string | null;
  initialUnread: number;
}) {
  const { radarId, viewerId, active } = args;
  const stream = useChatStream();

  const [messages, setMessages] = useState(args.initialMessages);
  const [olderCursor, setOlderCursor] = useState(args.initialOlderCursor);
  const [unread, setUnread] = useState(args.initialUnread);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  // Read through refs inside callbacks that must not re-subscribe the stream
  // every time the tab changes.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const latestRef = useRef<string | null>(
    args.initialMessages.at(-1)?.createdAt ?? null,
  );

  const absorb = useCallback((incoming: ChatMessageView[]) => {
    if (incoming.length === 0) return 0;
    let added = 0;
    setMessages((current) => {
      const seen = new Set(current.map((message) => message.id));
      // De-duplication is load-bearing, not defensive: a sender is on the push
      // list too, so their own message arrives back over the stream.
      const fresh = incoming.filter((message) => !seen.has(message.id));
      added = fresh.length;
      if (fresh.length === 0) return current;
      const next = [...current, ...fresh].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      );
      latestRef.current = next.at(-1)?.createdAt ?? latestRef.current;
      return next;
    });
    return added;
  }, []);

  const markRead = useCallback(() => {
    setUnread(0);
    void markChatReadAction({ radarId });
  }, [radarId]);

  // Landing straight on the chat tab (from the toast's link) is reading it too.
  // Only the server call belongs in an effect — the badge is hidden whenever
  // the tab is selected, so there is no state to push here.
  useEffect(() => {
    if (active) void markChatReadAction({ radarId });
  }, [active, radarId]);

  // --- Live frames -------------------------------------------------------
  useEffect(
    () =>
      stream.subscribe(radarId, (frame) => {
        if (frame.type === "chat-removed") {
          setMessages((current) =>
            current.filter((message) => message.id !== frame.messageId),
          );
          return;
        }

        const message = frame.message;
        if (absorb([message]) === 0) return;
        if (message.author.id === viewerId) return;

        if (activeRef.current && document.visibilityState === "visible") {
          setAnnouncement(`${message.author.name}: ${message.body}`);
          void markChatReadAction({ radarId });
        } else {
          setUnread((current) => current + 1);
        }
      }),
    [absorb, radarId, stream, viewerId],
  );

  // An announcement has to change to be re-read, so clear it — otherwise the
  // same sentence twice is announced once.
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(""), 5_000);
    return () => clearTimeout(timer);
  }, [announcement]);

  // --- Degraded-mode poll ------------------------------------------------
  useEffect(() => {
    if (!stream.degraded) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (document.visibilityState === "visible" && latestRef.current) {
        const result = await loadChatSinceAction({
          radarId,
          since: latestRef.current,
        });
        if (result.ok) {
          const mine = result.data.messages.filter(
            (message) => message.author.id !== viewerId,
          );
          const added = absorb(result.data.messages);
          if (added > 0 && !activeRef.current) setUnread((n) => n + mine.length);
        }
      }
      timer = setTimeout(tick, activeRef.current ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    };

    timer = setTimeout(tick, POLL_ACTIVE_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [absorb, radarId, stream.degraded, viewerId]);

  const send = useCallback(
    async (body: string) => {
      setBusy(true);
      const result = await sendChatMessageAction({ radarId, body });
      setBusy(false);
      if (!result.ok) {
        // Losing the role mid-conversation is the expected way this fails, and
        // leaving a stale transcript on screen would be a lie.
        if (result.error.includes("not on this radar")) setLocked(true);
        toast.error(result.error);
        return false;
      }
      absorb([result.data.message]);
      return true;
    },
    [absorb, radarId],
  );

  const remove = useCallback(async (messageId: string) => {
    const result = await deleteChatMessageAction({ messageId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMessages((current) =>
      current.filter((message) => message.id !== messageId),
    );
    toast.success("Message deleted");
  }, []);

  const loadOlder = useCallback(async () => {
    if (!olderCursor) return;
    setBusy(true);
    const result = await loadOlderChatAction({ radarId, cursor: olderCursor });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMessages((current) => [...result.data.messages, ...current]);
    setOlderCursor(result.data.olderCursor);
  }, [olderCursor, radarId]);

  return {
    messages,
    unread,
    olderCursor,
    locked,
    busy,
    announcement,
    markRead,
    send,
    remove,
    loadOlder,
  };
}
