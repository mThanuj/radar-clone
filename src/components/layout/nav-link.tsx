"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "cn";

export function NavLink({
  href,
  icon,
  label,
  badge,
  exact = false,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: number;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span className="[&>svg]:size-4">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-[0.65rem] font-semibold tabular-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

export function QueueLink({
  name,
  params,
  count,
}: {
  name: string;
  params: string;
  count: number;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const href = params ? `/radars?${params}` : "/radars";

  // Compare canonical strings: the queue is "current" when the URL is exactly
  // what it stored, and stops being current the moment you tweak a filter.
  const active =
    pathname === "/radars" && searchParams.toString() === params;

  return (
    <Link
      href={href}
      className={cn(
        "group flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors",
        active
          ? "bg-muted text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      <span className="flex-1 truncate">{name}</span>
      <span className="text-muted-foreground text-xs tabular-nums">
        {count}
      </span>
    </Link>
  );
}
