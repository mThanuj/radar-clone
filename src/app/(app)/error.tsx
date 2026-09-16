"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/**
 * Catches render and data errors inside the app shell so a single bad page
 * doesn't blank the whole window.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isStale = error.message.includes("changed while you were editing");

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <h1 className="text-base font-semibold">
        {isStale ? "This radar moved under you" : "Something broke"}
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        {isStale
          ? "Someone else changed this radar while you had it open. Reload to pick up their version."
          : error.message}
      </p>
      <div className="flex gap-2">
        <Button onClick={reset} size="sm">
          Try again
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
