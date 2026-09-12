"use client";

import { Inbox } from "lucide-react";
import { NavLink } from "@/components/layout/nav-link";
import { useUnreadCount } from "@/components/notifications/notification-provider";

/**
 * The inbox link with a live badge. The count comes from context rather than
 * the server render, so it moves the moment a notification arrives instead of
 * waiting for the next navigation.
 */
export function InboxNavLink() {
  return <NavLink href="/inbox" icon={<Inbox />} label="Inbox" badge={useUnreadCount()} />;
}
