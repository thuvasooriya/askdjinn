import { marked } from "marked";

// Configure marked options for standard, break-respecting GFM rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

/** Shared markdown renderer for conversation messages.
 *  Every link is forced into a new tab (target=_blank + noopener) so external
 *  pages (e.g. Kapruka payment/product pages and their trackers) never navigate
 *  the app's own tab or pollute its console. Links are tagged `.dj-link` for
 *  styling (see app.css). */
export function renderMarkdown(t: string): string {
  if (!t) return "";
  try {
    const html = marked.parse(t) as string;
    // marked never emits target/rel itself, so this can't double-add attributes.
    // Escaped anchors inside code (`&lt;a&gt;`) are not matched by the regex.
    return html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" class="dj-link" ');
  } catch (err) {
    console.error("Markdown parse failed:", err);
    return t;
  }
}
