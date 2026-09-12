import "server-only";

/**
 * Next hands searchParams as a plain object with string | string[] values;
 * the whole search layer speaks URLSearchParams.
 */
export function toURLSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return params;
}
