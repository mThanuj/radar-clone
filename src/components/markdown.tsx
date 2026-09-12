import { cn } from "cn";
import { renderMarkdown } from "@/lib/markdown-render";

/**
 * Server component. `prose-radar` is defined in globals.css so the same
 * typography applies to descriptions, comments, and milestone notes.
 */
export async function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const html = await renderMarkdown(children);
  return (
    <div
      className={cn("prose-radar", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
