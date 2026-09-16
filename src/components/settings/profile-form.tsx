"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

  // Controlled rather than defaultValue: saving calls router.refresh(), which
  // re-renders this with new props while the inputs stay mounted — and
  // changing the default of an uncontrolled input is undefined behaviour.
  const [form, setForm] = useState({
    name: user.name,
    handle: user.handle,
    jobTitle: user.jobTitle ?? "",
  });

  const set = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateProfileAction({
        name: form.name,
        handle: form.handle,
        jobTitle: form.jobTitle || null,
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
        <Input id="name" value={form.name} onChange={set("name")} required />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          value={form.handle}
          onChange={set("handle")}
          required
        />
        <p className="text-muted-foreground text-xs">
          Used for @mentions in comments.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="jobTitle">Title</Label>
        <Input
          id="jobTitle"
          value={form.jobTitle}
          onChange={set("jobTitle")}
          placeholder="Software Engineer"
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={user.email} disabled readOnly />
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        Save changes
      </Button>
    </form>
  );
}
