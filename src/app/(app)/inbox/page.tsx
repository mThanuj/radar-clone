import type { Metadata } from "next";
import { InboxList } from "@/components/inbox/inbox-list";
import { requireUser } from "@/server/guards";
import { getInbox } from "@/server/notifications/queries";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
  const user = await requireUser();
  const items = await getInbox({ userId: user.id });

  return (
    <div className="mx-auto max-w-4xl p-5">
      <InboxList items={items} />
    </div>
  );
}
