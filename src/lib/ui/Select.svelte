<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";
  import { ChevronDown } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    value = $bindable(),
    children,
    ...restProps
  }: { class?: string; value?: string; children?: Snippet } & HTMLSelectAttributes = $props();
</script>

<div class="relative">
  <select
    bind:value
    class={cn(
      "flex h-10 w-full appearance-none rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 pr-8 text-sm text-[var(--color-foreground)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20",
      className
    )}
    {...restProps}
  >
    {@render children?.()}
  </select>
  <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
</div>
