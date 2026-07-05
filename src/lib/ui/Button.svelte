<script lang="ts" module>
    import { tv, type VariantProps } from "tailwind-variants";

    export const buttonVariants = tv({
        base: "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] cursor-pointer",
        variants: {
            variant: {
                primary: "frosted-primary",
                secondary: "frosted-secondary",
                outline:
                    "border border-[var(--color-border)] bg-transparent text-[var(--color-foreground)] hover:bg-[var(--color-muted)]",
                ghost: "text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]",
                destructive:
                    "bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:opacity-90",
                success:
                    "bg-[var(--color-success)] text-[var(--color-success-foreground)] hover:opacity-90",
            },
            size: {
                sm: "h-9 px-3 text-xs",
                md: "h-10 px-4 text-sm",
                lg: "h-12 px-6 text-sm",
                icon: "h-10 w-10",
                "icon-sm": "h-8 w-8",
                "icon-xs": "h-6 w-6 rounded-lg",
                "icon-lg": "h-12 w-12",
            },
        },
        defaultVariants: { variant: "primary", size: "md" },
    });

    export type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
    export type ButtonSize = VariantProps<typeof buttonVariants>["size"];
</script>

<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    import type { Component, Snippet } from "svelte";
    import { cn } from "$lib/utils";

    let {
        class: className,
        variant = "primary" as ButtonVariant,
        size = "md" as ButtonSize,
        icon: Icon,
        iconPosition = "left",
        children,
        ...restProps
    }: {
        class?: string;
        variant?: ButtonVariant;
        size?: ButtonSize;
        icon?: Component;
        iconPosition?: "left" | "right";
        children?: Snippet;
    } & HTMLButtonAttributes = $props();
</script>

<button class={cn(buttonVariants({ variant, size }), className)} {...restProps}>
    {#if Icon && iconPosition === "left"}
        <Icon class="h-4 w-4 shrink-0" />
    {/if}
    {@render children?.()}
    {#if Icon && iconPosition === "right"}
        <Icon class="h-4 w-4 shrink-0" />
    {/if}
</button>
