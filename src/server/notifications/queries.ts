import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export const getUnreadCount = cache(async (userId: string) =>
  db.notification.count({ where: { recipientId: userId, readAt: null } }),
);

export async function getInbox(args: {
  userId: string;
  unreadOnly?: boolean;
  take?: number;
}) {
  return db.notification.findMany({
    where: {
      recipientId: args.userId,
      ...(args.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: args.take ?? 100,
    select: {
      id: true,
      reason: true,
      readAt: true,
      createdAt: true,
      radar: {
        select: {
          number: true,
          title: true,
          state: true,
          substate: true,
          priority: true,
        },
      },
    },
  });
}
