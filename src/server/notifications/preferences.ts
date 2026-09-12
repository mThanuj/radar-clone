import "server-only";
import { cache } from "react";
import type { NotificationCategory } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { CATEGORY_ORDER, REASONS, ALL_REASONS } from "@/lib/notifications/catalog";

export type CategorySetting = {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  /** True when the user has never touched this — the row shows catalog defaults. */
  isDefault: boolean;
};

/**
 * Category defaults are derived from the reasons inside them: a category is on
 * for a channel if any of its reasons ships on by default. That keeps the
 * settings page honest about what will actually arrive.
 */
function categoryDefault(category: NotificationCategory) {
  const reasons = ALL_REASONS.filter((r) => REASONS[r].category === category);
  return {
    inApp: reasons.some((r) => REASONS[r].defaultInApp),
    email: reasons.some((r) => REASONS[r].defaultEmail),
  };
}

export const getNotificationSettings = cache(
  async (
    userId: string,
  ): Promise<{ emailEnabled: boolean; categories: CategorySetting[] }> => {
    const [user, saved] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { emailEnabled: true },
      }),
      db.notificationPreference.findMany({
        where: { userId },
        select: { category: true, inApp: true, email: true },
      }),
    ]);

    const byCategory = new Map(saved.map((row) => [row.category, row]));

    return {
      emailEnabled: user.emailEnabled,
      categories: CATEGORY_ORDER.map((category) => {
        const row = byCategory.get(category);
        const fallback = categoryDefault(category);
        return {
          category,
          inApp: row?.inApp ?? fallback.inApp,
          email: row?.email ?? fallback.email,
          isDefault: !row,
        };
      }),
    };
  },
);
