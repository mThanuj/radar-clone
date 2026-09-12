import { Suspense } from "react";
import type { Metadata } from "next";
import { FilterBar } from "@/components/search/filter-bar";
import { ResultTable } from "@/components/search/result-table";
import { ViewOptions } from "@/components/search/view-options";
import { parseSearchParams } from "@/lib/search/url";
import type { FilterError, RadarQuery } from "@/lib/search/types";
import { requireUser } from "@/server/guards";
import { getOptionSources, searchRadars } from "@/server/radars/queries";
import { toURLSearchParams } from "@/server/search-params";

export const metadata: Metadata = { title: "Radars" };

export default async function RadarsPage({
  searchParams,
}: PageProps<"/radars">) {
  const params = toURLSearchParams(await searchParams);
  const { query, errors } = parseSearchParams(params);

  // The heading and view controls need no data, so they paint immediately
  // while the query runs. Without this the whole page waited on the results.
  return (
    <div className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold">Radars</h1>
        <ViewOptions query={query} />
      </div>

      <Suspense fallback={<ResultsSkeleton />}>
        <Results query={query} errors={errors} />
      </Suspense>
    </div>
  );
}

async function Results({
  query,
  errors,
}: {
  query: RadarQuery;
  errors: FilterError[];
}) {
  const user = await requireUser();
  const [{ rows, total }, sources] = await Promise.all([
    searchRadars(query, { userId: user.id }),
    getOptionSources(),
  ]);

  return (
    <>
      <FilterBar query={query} errors={errors} sources={sources} />
      <ResultTable rows={rows} query={query} total={total} sources={sources} />
    </>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="bg-muted h-7 w-64 animate-pulse rounded-md" />
      <div className="overflow-hidden rounded-lg border">
        <div className="bg-muted/40 h-9 border-b" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-b px-3 py-2.5">
            <div className="bg-muted h-3 w-20 animate-pulse rounded" />
            <div className="bg-muted h-3 flex-1 animate-pulse rounded" />
            <div className="bg-muted h-3 w-24 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
