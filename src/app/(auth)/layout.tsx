import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/guards";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  // Validated here rather than in middleware. Middleware can only see that a
  // cookie exists; this can tell whether it means anything, which is the
  // difference between sending a signed-in user home and trapping someone
  // with a stale cookie in a redirect loop.
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg font-semibold">
            R
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Radar</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
