"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  createKeywordAction,
  deleteKeywordAction,
} from "@/server/components/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function KeywordsAdmin({
  keywords,
}: {
  keywords: { id: string; name: string; label: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(message);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="text-sm font-medium">Add a keyword</h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            run(
              () =>
                createKeywordAction({
                  name: String(form.get("name")),
                  label: String(form.get("label") ?? "") || undefined,
                }),
              "Keyword added",
            );
            event.currentTarget.reset();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kw-name" className="text-xs">
              Key
            </Label>
            <Input
              id="kw-name"
              name="name"
              required
              placeholder="needs-design"
              pattern="[a-z0-9][a-z0-9\-]*"
              className="h-8 w-44 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kw-label" className="text-xs">
              Label (optional)
            </Label>
            <Input
              id="kw-label"
              name="label"
              placeholder="needs design"
              className="h-8 w-44 text-sm"
            />
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            <Plus /> Add
          </Button>
        </form>
        <p className="text-muted-foreground text-xs">
          The key is the stable identifier used in filters; the label is what
          shows on radars.
        </p>
      </section>

      <ul className="divide-y rounded-lg border">
        {keywords.map((keyword) => (
          <li key={keyword.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="font-mono text-xs">{keyword.name}</span>
            <span className="text-muted-foreground">{keyword.label}</span>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Delete ${keyword.name}`}
              disabled={pending}
              className="ml-auto"
              onClick={() =>
                run(() => deleteKeywordAction({ id: keyword.id }), "Keyword deleted")
              }
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
