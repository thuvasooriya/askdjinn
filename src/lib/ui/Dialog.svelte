<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    children,
    class: className,
    hideClose = false,
    onOpenChange,
  }: {
    open?: boolean;
    children?: Snippet;
    class?: string;
    hideClose?: boolean;
    onOpenChange?: (open: boolean) => void;
  } = $props();
</script>

<DialogPrimitive.Root
  open={open}
  onOpenChange={(v) => { open = v; onOpenChange?.(v); }}
>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="fixed inset-0 z-50 bg-black/70 backdrop-blur-md data-[state=open]:animate-fade-in"
    />
    <DialogPrimitive.Content
      class={cn(
        "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-float data-[state=open]:animate-scale-in",
        className
      )}
    >
      {@render children?.()}
      {#if !hideClose}
        <DialogPrimitive.Close
          class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-black/70 active:scale-90"
          aria-label="Close"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </DialogPrimitive.Close>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
