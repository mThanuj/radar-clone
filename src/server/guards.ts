import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  handle: string;
  image: string | null;
  isAdmin: boolean;
};

/**
 * The session for this request. Deduped with React cache() so a page that
 * checks auth in the layout, the page, and three server components still
 * only validates once.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & {
    handle?: string;
    isAdmin?: boolean;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    handle: u.handle ?? u.email.split("@")[0],
    image: u.image ?? null,
    isAdmin: u.isAdmin ?? false,
  };
});

/**
 * Real authorization boundary. middleware.ts only checks for a cookie —
 * it runs on the edge where there's no DB — so every protected layout and
 * every server action calls this.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/radars");
  return user;
}
