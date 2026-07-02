<script lang="ts" module>
  import { tv, type VariantProps } from "tailwind-variants";

  export const badgeVariants = tv({
    base: "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
    variants: {
      variant: {
        primary: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
        accent: "bg-[var(--color-accent)] text-[var(--color-accent-foreground)]",
        success: "bg-[var(--color-success)] text-[var(--color-success-foreground)]",
        warning: "bg-[var(--color-warning)] text-[var(--color-warning-foreground)]",
        destructive: "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)]",
        muted: "bg-[var(--color-muted)] text-[var(--color-muted-foreground)]",
        outline: "border border-[var(--color-border)] text-[var(--color-muted-foreground)]",
      },
    },
    defaultVariants: { variant: "muted" },
  });

  export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  let {
    class: className,
    variant = "muted" as BadgeVariant,
    children,
  }: {
    class?: string;
    variant?: BadgeVariant;
    children?: Snippet;
  } = $props();
</script>

<span class={cn(badgeVariants({ variant }), className)}>
  {@render children?.()}
</span>
