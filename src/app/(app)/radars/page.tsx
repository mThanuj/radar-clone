import type { Metadata } from "next";
import { FilterBar } from "@/components/search/filter-bar";
import { ResultTable } from "@/components/search/result-table";
import { ViewOptions } from "@/components/search/view-options";
import { parseSearchParams } from "@/lib/search/url";
import { requireUser } from "@/server/guards";
import { getOptionSources, searchRadars } from "@/server/radars/queries";
import { toURLSearchParams } from "@/server/search-params";

export const metadata: Metadata = { title: "Radars" };

export default async function RadarsPage({
  searchParams,
}: PageProps<"/radars">) {
  const user = await requireUser();
  const params = toURLSearchParams(await searchParams);
  const { query, errors } = parseSearchParams(params);

  const [{ rows, total }, sources] = await Promise.all([
    searchRadars(query, { userId: user.id }),
    getOptionSources(),
  ]);

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold">Radars</h1>
        <ViewOptions query={query} />
      </div>

      <FilterBar query={query} errors={errors} sources={sources} />

      <ResultTable rows={rows} query={query} total={total} sources={sources} />
    </div>
  );
}
