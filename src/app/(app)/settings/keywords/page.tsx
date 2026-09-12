import type { Metadata } from "next";
import { KeywordsAdmin } from "@/components/settings/keywords-admin";
import { requireUser } from "@/server/guards";
import { getKeywords } from "@/server/radars/queries";

export const metadata: Metadata = { title: "Keywords" };

export default async function KeywordSettingsPage() {
  await requireUser();
  const keywords = await getKeywords();
  return <KeywordsAdmin keywords={keywords} />;
}
