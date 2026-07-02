<script lang="ts">
  // Region: recursive layout renderer. A split renders its children in a row
  // or column flex container and recurses; a leaf renders a PanelHost.
  // Recursion lets layouts compose (e.g. products | (chat / detail)).

  import type { LayoutRegion } from "$lib/layout/tree";
  import type { Panel } from "$lib/stores/panel-registry";
  import type { Product } from "$lib/shopping-engine";
  import PanelHost from "./PanelHost.svelte";
  // Svelte 5 self-recursion: import the component itself (replaces <svelte:self>).
  import Self from "./Region.svelte";

  let {
    region,
    panels,
    onClose,
    onAddProduct,
    onClickProduct,
    onCheckout,
    liveActive = false,
  }: {
    region: LayoutRegion | null;
    panels: Panel[];
    onClose: (panelId: string) => void;
    onAddProduct?: (product: Product, sourceEl: HTMLElement | null) => void;
    onClickProduct?: (product: Product) => void;
    onCheckout?: () => void;
    liveActive?: boolean;
  } = $props();

  // Look up the panel for a leaf (passed down so leaves don't each query).
  function panelFor(id: string): Panel | undefined {
    return panels.find(p => p.id === id);
  }
</script>

{#if region?.kind === "split"}
  <div class="split {region.orientation}">
    {#each region.children as child, i (i)}
      <div class="split-child" style={region.weights ? `flex: ${region.weights[i] ?? 1}` : ""}>
        <Self
          region={child}
          {panels}
          {onClose}
          {onAddProduct}
          {onClickProduct}
          {onCheckout}
          {liveActive}
        />
      </div>
    {/each}
  </div>
{:else if region?.kind === "leaf"}
  {@const panel = panelFor(region.panelId)}
  {#if panel}
    <PanelHost
      {panel}
      onClose={() => onClose(panel.id)}
      {onAddProduct}
      {onClickProduct}
      {onCheckout}
      {liveActive}
    />
  {/if}
{/if}

<style>
  .split {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    gap: 0.75rem;
    flex: 1 1 auto;
  }
  .split.row { flex-direction: row; }
  .split.column { flex-direction: column; }
  .split-child {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 0;
  }
  /* On small screens, a row split that would overflow collapses to a column
     rather than forcing tiny slivers. The slot cap already limits count, so
     this only kicks in at edge cases. */
  @media (max-width: 639px) {
    .split.row { flex-direction: column; }
  }
</style>
