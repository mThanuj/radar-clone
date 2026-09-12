import type { Metadata } from "next";
import { BoardView } from "@/components/board/board-view";
import { FilterBar } from "@/components/search/filter-bar";
import { parseSearchParams } from "@/lib/search/url";
import { requireUser } from "@/server/guards";
import { boardData, getOptionSources } from "@/server/radars/queries";
import { toURLSearchParams } from "@/server/search-params";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ searchParams }: PageProps<"/board">) {
  const user = await requireUser();
  const params = toURLSearchParams(await searchParams);
  const { query, errors } = parseSearchParams(params);

  const [columns, sources] = await Promise.all([
    boardData(query, { userId: user.id }),
    getOptionSources(),
  ]);

  return (
    <div className="flex flex-col gap-3 p-5">
      <h1 className="text-base font-semibold">Board</h1>
      <FilterBar query={query} errors={errors} sources={sources} />
      <BoardView columns={columns} />
    </div>
  );
}
