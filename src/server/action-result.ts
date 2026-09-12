/**
 * Every server action returns this discriminated union rather than throwing,
 * so the client can show an inline message instead of an error boundary.
 */
export type ActionResult<T = void> =
  | ({ ok: true } & (T extends void ? object : { data: T }))
  | { ok: false; error: string };

export function actionError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Something went wrong.",
  };
}
