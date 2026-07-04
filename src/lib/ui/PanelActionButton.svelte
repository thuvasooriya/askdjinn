<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import type { HTMLButtonAttributes } from "svelte/elements";
    import Button from "$lib/ui/Button.svelte";
    import { cn } from "$lib/utils";

    let {
        label,
        icon: Icon,
        iconOnly = false,
        tone = "default",
        class: className,
        children,
        ...restProps
    }: {
        label: string;
        icon?: Component;
        iconOnly?: boolean;
        tone?: "default" | "primary" | "danger";
        class?: string;
        children?: Snippet;
    } & HTMLButtonAttributes = $props();
</script>

<Button
    variant="outline"
    size={iconOnly ? "icon-sm" : "sm"}
    class={cn(
        "panel-action-btn",
        iconOnly && "panel-action-btn--icon",
        tone === "primary" && "panel-action-btn--primary",
        tone === "danger" && "panel-action-btn--danger",
        className,
    )}
    aria-label={restProps["aria-label"] ?? (iconOnly ? label : undefined)}
    title={restProps.title ?? (iconOnly ? label : undefined)}
    {...restProps}
>
    {#if Icon}
        <Icon class={iconOnly ? "h-3.5 w-3.5" : "h-3.5 w-3.5 shrink-0"} />
    {/if}
    {#if !iconOnly}
        <span class="truncate">
            {#if children}
                {@render children()}
            {:else}
                {label}
            {/if}
        </span>
    {/if}
</Button>
