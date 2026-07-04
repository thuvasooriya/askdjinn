<script lang="ts">
    import type { Component, Snippet } from "svelte";
    import { cn } from "$lib/utils";

    let {
        icon: Icon,
        title,
        description,
        class: className,
        children,
    }: {
        icon: Component;
        title: string;
        description?: string;
        class?: string;
        children?: Snippet;
    } = $props();
</script>

<div
    class={cn(
        "flex h-full flex-col items-center justify-center px-4 py-10 text-center",
        className,
    )}
>
    <div class="panel-empty-icon">
        <Icon class="h-6 w-6" strokeWidth={1.9} />
    </div>
    <p class="mt-3 text-sm font-semibold text-[var(--color-foreground)]">
        {title}
    </p>
    {#if description}
        <p class="mt-1 max-w-56 text-xs leading-relaxed text-[var(--color-muted-foreground)]/70">
            {description}
        </p>
    {/if}
    {@render children?.()}
</div>
