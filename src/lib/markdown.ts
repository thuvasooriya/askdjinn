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
 *  styling (see app.css).
 *
 *  Tables from GFM markdown are wrapped in a scrollable container
 *  (.md-table-scroll) so wide tables don't overflow the bubble on narrow views. */
export function renderMarkdown(t: string): string {
  if (!t) return "";
  try {
    let html = marked.parse(t) as string;
    // marked never emits target/rel itself, so this can't double-add attributes.
    // Escaped anchors inside code (`&lt;a&gt;`) are not matched by the regex.
    html = html.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" class="dj-link" ');
    // Wrap GFM tables in a scrollable container. Marked escapes HTML in code
    // fences, so <table> in the output always comes from markdown table syntax.
    html = html.replace(/<table>/g, '<div class="md-table-scroll"><table>');
    html = html.replace(/<\/table>/g, '</table></div>');
    return html;
  } catch (err) {
    console.error("Markdown parse failed:", err);
    return t;
  }
}
