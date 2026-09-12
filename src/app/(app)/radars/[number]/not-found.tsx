import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RadarNotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-base font-semibold">No such radar</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        That number doesn&apos;t exist. Radar numbers start at 100000000 — check
        for a typo, or search from the palette with ⌘K.
      </p>
      <Button render={<Link href="/radars" />} nativeButton={false} size="sm">
        Back to radars
      </Button>
    </div>
  );
}
