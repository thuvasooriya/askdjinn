<script lang="ts">
  // Wraps a registered tool's component as a floating bubble.
  // The component + props are resolved via the tool-render-registry.
  // Only completed tool calls with extractable data render here; pending and
  // unregistered tools are handled by the status pill (session-phase).
  // Tool components (OrderConfirmationCard, DeliveryCheckCard, etc.) provide
  // their own styling — no extra wrapper needed.

  import type { ToolSegment } from "$lib/stores/bubble-feed";
  import { getToolBubbleRender } from "$lib/stores/tool-render-registry";
  import BubbleFrame from "./BubbleFrame.svelte";

  let { segment, onTimeout }: { segment: ToolSegment; onTimeout: () => void } = $props();
</script>

{#if segment.part.status === "done"}
  {@const render = getToolBubbleRender(segment.part.name)}
  {@const extracted = render ? render.extract(segment.part) : null}
  {#if extracted && render}
    <BubbleFrame timeout={render.options.timeout} {onTimeout}>
      {@const Comp = render.component}
      <Comp {...extracted} />
    </BubbleFrame>
  {/if}
{/if}
