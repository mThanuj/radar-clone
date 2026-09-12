"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { updateProfileAction } from "@/server/users/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileForm({
  user,
}: {
  user: { name: string; handle: string; email: string; jobTitle: string | null };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateProfileAction({
        name: String(form.get("name")),
        handle: String(form.get("handle")),
        jobTitle: String(form.get("jobTitle") ?? "") || null,
      });
      if (result.ok) {
        toast.success("Profile updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={user.name} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input id="handle" name="handle" defaultValue={user.handle} required />
        <p className="text-muted-foreground text-xs">
          Used for @mentions in comments.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jobTitle">Title</Label>
        <Input
          id="jobTitle"
          name="jobTitle"
          defaultValue={user.jobTitle ?? ""}
          placeholder="Software Engineer"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Email</Label>
        <Input value={user.email} disabled readOnly />
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        Save changes
      </Button>
    </form>
  );
}
