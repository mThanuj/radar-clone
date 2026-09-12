import Link from "next/link";
import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { requireUser } from "@/server/guards";
import { getComponentTree } from "@/server/radars/queries";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Components" };

export default async function ComponentsPage() {
  await requireUser();
  const components = await getComponentTree();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold">Components</h1>
          <p className="text-muted-foreground text-sm">
            Radars are filed against a component and one of its versions.
          </p>
        </div>
        <Button
          render={<Link href="/settings/components" />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          <Settings /> Manage
        </Button>
      </div>

      <ul className="divide-y rounded-lg border">
        {components.map((component) => (
          <li
            key={component.id}
            className="flex items-center gap-3 px-4 py-2 text-sm"
            // The materialized path already encodes depth, so indent from it.
            style={{ paddingLeft: 16 + component.depth * 18 }}
          >
            <Link
              href={`/radars?component=under:${encodeURIComponent(component.path)}`}
              className="font-medium hover:underline"
            >
              {component.name}
            </Link>

            {component.versions.length > 0 && (
              <span className="text-muted-foreground truncate text-xs">
                {component.versions.map((v) => v.name).join(" · ")}
              </span>
            )}

            <span className="text-muted-foreground ml-auto text-xs tabular-nums">
              {component._count.radars}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
