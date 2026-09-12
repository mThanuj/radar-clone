import type {
  NotificationCategory,
  NotificationReason,
} from "@/generated/prisma/enums";
import { REASONS, categoryOf, isForced } from "@/lib/notifications/catalog";

/**
 * Which channels a single notification is allowed to use.
 *
 * Pure, because the order these rules apply in is the difference between a
 * useful inbox and either spam or silence, and that deserves a test rather
 * than a careful reading.
 *
 * Order, first match wins:
 *   1. muted on this radar    — kills both channels
 *   2. forced reason          — overrides everything below (someone @'d you)
 *   3. category preference    — the user's explicit per-channel choice
 *   4. catalog default        — when the user has expressed no preference
 *   5. global email switch    — can only ever turn email off, never on
 *
 * The actor check is not here: fanOut removes the actor before this is
 * reached, because "don't notify me about my own typing" is not a preference.
 */
export type ChannelPreference = { inApp: boolean; email: boolean };

export type ResolveInput = {
  reason: NotificationReason;
  /** The user's saved preferences, by category. Missing means "no opinion". */
  preferences: Partial<Record<NotificationCategory, ChannelPreference>>;
  /** User-level mail kill switch. */
  emailEnabled: boolean;
  /** This user muted this specific radar. */
  muted: boolean;
};

export function resolveChannels(input: ResolveInput): ChannelPreference {
  if (input.muted) return { inApp: false, email: false };

  const meta = REASONS[input.reason];

  if (isForced(input.reason)) return { inApp: true, email: true };

  const saved = input.preferences[categoryOf(input.reason)];
  const inApp = saved?.inApp ?? meta.defaultInApp;
  const email = saved?.email ?? meta.defaultEmail;

  return { inApp, email: email && input.emailEnabled };
}
