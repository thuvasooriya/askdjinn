import { marked } from "marked";

// Configure marked options for standard, break-respecting GFM rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

/** Shared markdown renderer for conversation messages. */
export function renderMarkdown(t: string): string {
  if (!t) return "";
  try {
    return marked.parse(t) as string;
  } catch (err) {
    console.error("Markdown parse failed:", err);
    return t;
  }
}
