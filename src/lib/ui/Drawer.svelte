<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    side = "right",
    children,
    class: className,
    onOpenChange,
  }: {
    open?: boolean;
    side?: "right" | "left" | "bottom";
    children?: Snippet;
    class?: string;
    onOpenChange?: (open: boolean) => void;
  } = $props();

  const sideClasses = {
    right: "inset-y-0 right-0 h-full w-full max-w-sm animate-slide-in-right border-l",
    left: "inset-y-0 left-0 h-full w-full max-w-sm border-r",
    bottom: "inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl animate-slide-up border-t",
  };
</script>

<DialogPrimitive.Root
  open={open}
  onOpenChange={(v) => { open = v; onOpenChange?.(v); }}
>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in"
    />
    <DialogPrimitive.Content
      class={cn(
        "fixed z-50 flex flex-col border-[var(--color-border)] bg-[var(--color-surface)] shadow-float outline-none",
        sideClasses[side],
        className
      )}
    >
      {@render children?.()}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
