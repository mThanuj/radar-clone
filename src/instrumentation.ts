/**
 * Runs once when the server starts (both `next dev` and a deployed instance).
 *
 * Validating here rather than at module import means a missing variable is a
 * boot failure with a message naming it, while `next build` — which imports
 * every module to collect routes — stays free of any need for runtime secrets.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/lib/env");
  validateEnv();
}
