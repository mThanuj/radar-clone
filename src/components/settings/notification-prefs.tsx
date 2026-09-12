"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES } from "@/lib/notifications/catalog";
import type { CategorySetting } from "@/server/notifications/preferences";
import {
  sendTestEmailAction,
  setEmailEnabledAction,
  setNotificationPreferenceAction,
} from "@/server/notifications/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export function NotificationPrefs({
  emailEnabled,
  categories,
}: {
  emailEnabled: boolean;
  categories: CategorySetting[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(setting: CategorySetting, patch: Partial<CategorySetting>) {
    startTransition(async () => {
      const result = await setNotificationPreferenceAction({
        category: setting.category,
        inApp: patch.inApp ?? setting.inApp,
        email: patch.email ?? setting.email,
      });
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border">
        <header className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b px-4 py-2">
          <span className="text-sm font-medium">Notify me about</span>
          <span className="text-muted-foreground text-center text-xs">In app</span>
          <span className="text-muted-foreground text-center text-xs">Email</span>
        </header>

        <ul className="divide-y">
          {categories.map((setting) => (
            <li
              key={setting.category}
              className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {CATEGORIES[setting.category].label}
                </p>
                <p className="text-muted-foreground text-xs">
                  {CATEGORIES[setting.category].description}
                </p>
              </div>

              <div className="flex justify-center">
                <Switch
                  checked={setting.inApp}
                  disabled={pending}
                  onCheckedChange={(checked: boolean) =>
                    update(setting, { inApp: checked })
                  }
                  aria-label={`${CATEGORIES[setting.category].label} in app`}
                />
              </div>

              <div className="flex justify-center">
                <Switch
                  checked={setting.email && emailEnabled}
                  disabled={pending || !emailEnabled}
                  onCheckedChange={(checked: boolean) =>
                    update(setting, { email: checked })
                  }
                  aria-label={`${CATEGORIES[setting.category].label} by email`}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-start gap-3">
          <Switch
            checked={emailEnabled}
            disabled={pending}
            onCheckedChange={(checked: boolean) =>
              startTransition(async () => {
                const result = await setEmailEnabledAction({ enabled: checked });
                if (result.ok) router.refresh();
                else toast.error(result.error);
              })
            }
            aria-label="Email notifications"
          />
          <span>
            <span className="block text-sm font-medium">Email notifications</span>
            <span className="text-muted-foreground block text-xs">
              Master switch. Turning this off stops all mail regardless of the
              settings above — except when someone mentions you by name.
            </span>
          </span>
        </label>

        <div className="flex items-center gap-3 border-t pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await sendTestEmailAction();
                if (!result.ok) toast.error(result.error);
                else if (result.data.live) toast.success("Test email sent");
                else
                  toast.info(
                    "No SMTP configured — the message was logged to the server console instead.",
                  );
              })
            }
          >
            <Send /> Send a test email
          </Button>
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Mail className="size-3" />
            Goes straight through SMTP, bypassing the queue, so failures surface
            immediately.
          </p>
        </div>
      </section>
    </div>
  );
}
