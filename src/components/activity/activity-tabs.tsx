"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatMember } from "@/components/chat/chat-audience";
import {
  useRadarChat,
  type ChatMessageView,
} from "@/components/chat/use-radar-chat";

export type ChatTabData = {
  viewerId: string;
  viewerIsAdmin: boolean;
  viewerIsMember: boolean;
  memberIds: string[];
  members: ChatMember[];
  initialMessages: ChatMessageView[];
  initialOlderCursor: string | null;
  initialUnread: number;
};

/**
 * Activity and chat, in one panel.
 *
 * `activity` and `composer` arrive already rendered on the server — this
 * component only places them, so the feed keeps its Suspense streaming and the
 * async server-only <Markdown> never crosses into client-land.
 *
 * The chat's state and its stream subscription live *here* rather than in
 * ChatPanel because Base UI unmounts a hidden tab panel: state held one level
 * down would be discarded on every tab switch, and the unread badge could never
 * move while you were reading the activity feed.
 */
export function ActivityTabs({
  radarId,
  chat,
  defaultTab,
  activity,
  composer,
}: {
  radarId: string;
  chat: ChatTabData;
  /** The server decides this, from ?chat=1 — what the chat toast links to. */
  defaultTab: "activity" | "chat";
  activity: React.ReactNode;
  composer: React.ReactNode;
}) {
  const [tab, setTab] = useState(defaultTab);

  const conversation = useRadarChat({
    radarId,
    viewerId: chat.viewerId,
    active: tab === "chat",
    initialMessages: chat.initialMessages,
    initialOlderCursor: chat.initialOlderCursor,
    initialUnread: chat.initialUnread,
  });

  // Nothing is unread while you are looking at it, and messages arriving on an
  // open tab never increment the count — so the badge is simply not shown.
  const unread = tab === "chat" ? 0 : conversation.unread;

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        const next = value as "activity" | "chat";
        setTab(next);
        if (next === "chat" && conversation.unread > 0) conversation.markRead();
      }}
      className="gap-0"
    >
      <header className="flex items-center justify-between gap-2 border-b px-4 py-1.5">
        {/* Every other panel on this page has a heading; dropping this one
            would break the outline a screen-reader user navigates by. */}
        <h2 className="sr-only">Activity and chat</h2>
        <TabsList variant="line" className="h-7 p-0" aria-label="Activity and chat">
          <TabsTrigger value="activity" className="px-2">
            Activity
          </TabsTrigger>
          <TabsTrigger value="chat" className="px-2">
            Chat
            {unread > 0 && (
              <span className="bg-primary text-primary-foreground ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.65rem] font-semibold tabular-nums">
                <span aria-hidden>{unread > 9 ? "9+" : unread}</span>
                <span className="sr-only">{unread} unread messages</span>
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </header>

      {/* keepMounted on both: the feed is server-rendered and throwing it away
          on a tab switch would mean re-fetching it, and the chat would lose its
          scroll position and everything it has loaded. */}
      <TabsContent value="activity" keepMounted>
        <div className="px-4">{activity}</div>
        <div className="border-t p-4">{composer}</div>
      </TabsContent>

      <TabsContent value="chat" keepMounted>
        <ChatPanel
          viewerId={chat.viewerId}
          viewerIsAdmin={chat.viewerIsAdmin}
          viewerIsMember={chat.viewerIsMember}
          memberIds={chat.memberIds}
          members={chat.members}
          messages={conversation.messages}
          olderCursor={conversation.olderCursor}
          locked={conversation.locked}
          busy={conversation.busy}
          announcement={conversation.announcement}
          onSend={conversation.send}
          onDelete={conversation.remove}
          onLoadOlder={conversation.loadOlder}
        />
      </TabsContent>
    </Tabs>
  );
}
