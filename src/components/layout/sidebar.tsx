import Link from "next/link";
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

export async function Sidebar({ user }: { user: CurrentUser }) {
  const queries = await getSavedQueries(user.id);

  const pinned = queries.filter((q) => q.isPinned);
  const counts = await Promise.all(
    pinned.map((q) => countForSavedQuery(q.params, user.id)),
  );

  return (
    <aside className="bg-sidebar flex w-60 shrink-0 flex-col gap-3 border-r px-2 py-3">
      <div className="flex items-center gap-2 px-2">
        <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
          <RadarIcon className="size-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">Radar</span>
      </div>

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

      {pinned.length > 0 && (
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
      )}

      <div className="mt-auto px-1">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
