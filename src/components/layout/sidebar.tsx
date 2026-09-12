import Link from "next/link";
import { Suspense } from "react";
import {
  Boxes,
  LayoutGrid,
  ListFilter,
  Plus,
  Target,
  Radar as RadarIcon,
  Clock,
} from "lucide-react";
import { InboxNavLink } from "@/components/layout/inbox-nav-link";
import { NavLink, QueueLink } from "@/components/layout/nav-link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { SearchButton } from "@/components/layout/search-button";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  countForSavedQuery,
  getSavedQueries,
} from "@/server/saved-queries/queries";
import type { CurrentUser } from "@/server/guards";

/**
 * The navigation itself, rendered identically in the desktop rail and the
 * mobile drawer. Kept separate from the <aside> so the two never drift.
 *
 * Queue counts stream: they were the single most expensive thing on every
 * page — one COUNT(*) over Radar per pinned queue — and because this lives in
 * the shared layout, every navigation waited on them before painting.
 */
export function SidebarContent({
  user,
  showBrand = true,
}: {
  user: CurrentUser;
  showBrand?: boolean;
}) {
  return (
    <>
      {showBrand && (
        <div className="flex items-center gap-2 px-2">
          <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <RadarIcon className="size-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight">Radar</span>
        </div>
      )}

      <div className="flex gap-1.5 px-1">
        <Button
          render={<Link href="/radars/new" />}
          nativeButton={false}
          size="sm"
          className="flex-1 justify-start"
        >
          <Plus /> New radar
        </Button>
        <SearchButton />
        <NotificationBell />
      </div>

      <nav className="flex flex-col gap-0.5 px-1">
        <InboxNavLink />
        <NavLink href="/radars" icon={<ListFilter />} label="Radars" exact />
        <NavLink href="/board" icon={<LayoutGrid />} label="Board" />
        <NavLink href="/timeline" icon={<Clock />} label="Timeline" />
        <NavLink href="/milestones" icon={<Target />} label="Milestones" />
        <NavLink href="/components" icon={<Boxes />} label="Components" />
      </nav>

      <Suspense fallback={<QueuesSkeleton />}>
        <SidebarQueues userId={user.id} />
      </Suspense>

      <div className="mt-auto px-1">
        <UserMenu user={user} />
      </div>
    </>
  );
}

/** Desktop rail. Hidden below md, where the drawer takes over. */
export function Sidebar({ user }: { user: CurrentUser }) {
  return (
    <aside className="bg-sidebar hidden w-60 shrink-0 flex-col gap-3 border-r px-2 py-3 md:flex">
      <SidebarContent user={user} />
    </aside>
  );
}

async function SidebarQueues({ userId }: { userId: string }) {
  const queries = await getSavedQueries(userId);
  const pinned = queries.filter((q) => q.isPinned);
  if (pinned.length === 0) return null;

  const counts = await Promise.all(
    pinned.map((q) => countForSavedQuery(q.params, userId)),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-1">
      <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
        Queues
      </p>
      <div className="flex flex-col gap-0.5 overflow-y-auto">
        {pinned.map((query, index) => (
          <QueueLink
            key={query.id}
            name={query.name}
            params={query.params}
            count={counts[index]}
          />
        ))}
      </div>
    </div>
  );
}

/** Same shape as the real thing, so nothing shifts when the counts land. */
function QueuesSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-1" aria-hidden>
      <p className="text-muted-foreground px-2 pt-2 pb-1 text-xs font-medium">
        Queues
      </p>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex h-7 items-center px-2">
            <div className="bg-muted h-3 w-28 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
