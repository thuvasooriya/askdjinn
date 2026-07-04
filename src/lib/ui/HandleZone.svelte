<script lang="ts">
    // HandleZone: a small floating pill anchored to a panel or control group.
    // It is always intrinsically sized to its own content (the collapsed nub,
    // or the row/column of action buttons once expanded) — it never stretches
    // to fill the width/height of whatever container it lives in, and it owns
    // its own positioning via the `anchor` prop rather than relying on the
    // consumer to bolt on external CSS.
    //
    // Reused anywhere a compact set of controls needs to stay out of the way
    // until needed:
    //   - Panel chrome (close / minimize) — anchor="top-center", horizontal.
    //   - The floating AgentBar bubble toggle — anchor="inline", horizontal.
    //   - The minimized-panels dock — anchor="right-middle", vertical, with an
    //     auto-collapse timer instead of hover (there's no single "trigger"
    //     element to hover — the whole stack is always potentially visible).
    import type { Component, Snippet } from "svelte";
    import { browser } from "$app/environment";
    import { onDestroy } from "svelte";
    import { cn } from "$lib/utils";

    export type HandleAction = {
        id: string;
        icon: Component;
        label: string;
        onClick: (e: MouseEvent) => void;
        variant?: "default" | "danger" | "active";
        urgent?: boolean;
        badge?: number | string;
    };

    let {
        actions,
        orientation = "horizontal",
        label,
        class: className = "",
        collapsedIcon: CollapsedIcon,
        autoCollapseMs,
        startExpanded = false,
        /** Where this zone positions itself, relative to its nearest positioned
         *  ancestor (for "top-center") or the viewport (for "right-middle").
         *  "inline" renders in normal document flow at its intrinsic size, for
         *  embedding next to other controls (e.g. inside the AgentBar row). */
        anchor = "inline",
        children,
    }: {
        actions: HandleAction[];
        orientation?: "horizontal" | "vertical";
        label?: string;
        class?: string;
        /** Icon shown in the collapsed state instead
 of the default grab-bar dash. */
        collapsedIcon?: Component;
        /** If set, the zone starts expanded and auto-collapses after this many ms
         *  of no interaction (used by the minimized-panels dock). If unset, the
         *  zone only expands on hover (pointer devices) or tap (touch devices),
         *  matching the original panel-handle behavior. */
        autoCollapseMs?: number;
        /** Start in the expanded state (only meaningful with autoCollapseMs). */
        startExpanded?: boolean;
        anchor?: "inline" | "top-center" | "right-middle";
        /** Optional extra content rendered inside the collapsed nub area, e.g. a count. */
        children?: Snippet;
    } = $props();

    const canHover = browser && window.matchMedia("(hover: hover)").matches;
    const isAutoCollapse = $derived(autoCollapseMs !== undefined);

    let expanded = $state(false);
    let collapseTimer: ReturnType<typeof setTimeout> | undefined;

    $effect(() => {
        if (startExpanded) expanded = true;
    });

    function resetAutoCollapse() {
        if (!isAutoCollapse) return;
        if (collapseTimer) clearTimeout(collapseTimer);
        collapseTimer = setTimeout(() => {
            expanded = false;
        }, autoCollapseMs);
    }

    // Whenever the action list changes size (e.g. a new minimized panel
    // appears), re-open and restart the idle timer.
    $effect(() => {
        const count = actions.length;
        if (isAutoCollapse && count > 0) {
            expanded = true;
            resetAutoCollapse();
        }
    });

    onDestroy(() => {
        if (collapseTimer) clearTimeout(collapseTimer);
    });

    function onEnter() {
        if (isAutoCollapse) {
            expanded = true;
            resetAutoCollapse();
        } else if (canHover) expanded = true;
    }
    function onLeave() {
        if (!isAutoCollapse && canHover) expanded = false;
    }
    function onTap() {
        if (isAutoCollapse) {
            expanded = true;
            resetAutoCollapse();
        } else expanded = !expanded;
    }
</script>

<div
    class={cn(
        "handle-zone",
        `handle-zone--${orientation}`,
        `handle-zone--anchor-${anchor}`,
        className,
    )}
    class:expanded
    role="button"
    tabindex="0"
    aria-label={label ? `${label} controls` : "Controls"}
    aria-expanded={expanded}
    onpointerenter={onEnter}
    onpointerleave={onLeave}
    onclick={onTap}
    onkeydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            expanded = !expanded;
        }
    }}
>
    {#if !expanded}
        <span class="handle-collapsed" aria-hidden="true">
            {#if CollapsedIcon}
                <CollapsedIcon class="h-4 w-4" />
            {:else}
                <span class="handle-bar"></span>
            {/if}
            {@render children?.()}
        </span>
    {/if}
    <div class="handle-actions">
        {#each actions as action (action.id)}
            <button
                type="button"
                class={cn(
                    "glass-btn glass-btn--sm handle-action-btn",
                    action.variant === "danger" && "glass-btn--danger",
                    action.variant === "active" && "glass-btn--active",
                    action.urgent && "glass-btn--urgent",
                )}
                onclick={(e) => {
                    e.stopPropagation();
                    action.onClick(e);
                }}
                aria-label={action.label}
                title={action.label}
            >
                <action.icon class="h-3.5 w-3.5" />
                {#if action.badge != null && action.badge !== 0}
                    <span class="glass-btn-badge">{action.badge}</span>
                {/if}
            </button>
        {/each}
    </div>
</div>

<style>
    .handle-zone {
        /* Intrinsic sizing, always — this must never stretch to fill a flex or
       grid parent's cross axis (e.g. PanelHost's column-flex tile-host). */
        display: inline-flex;
        width: max-content;
        height: max-content;
        flex: 0 0 auto;
        align-self: start;
        position: relative;
        align-items: center;
        justify-content: center;
        z-index: 10;
        border: 1px solid transparent;
        cursor: pointer;
        color: var(--color-muted-foreground);
        transition:
            background 0.15s ease,
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            padding 0.15s ease;
    }

    .handle-zone--horizontal {
        flex-direction: row;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: var(--radius-full);
    }
    .handle-zone--vertical {
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.25rem;
        border-radius: var(--radius-full);
    }

    /* Anchoring — each mode owns its own placement so consumers never need to
     reach in with external/global CSS to position this component. */
    .handle-zone--anchor-inline {
        position: relative;
    }
    .handle-zone--anchor-top-center {
        position: absolute;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        align-self: auto;
    }
    .handle-zone--anchor-right-middle {
        position: fixed;
        top: 50%;
        right: 0.35rem;
        transform: translateY(-50%);
        z-index: 58;
    }

    .handle-zone.expanded {
        background: color-mix(in srgb, var(--color-muted) 60%, transparent);
        border-color: color-mix(in srgb, var(--color-border) 75%, transparent);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
        box-shadow: var(--shadow-card);
    }

    .handle-collapsed {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        min-width: 2.25rem;
        min-height: 1.25rem;
        color: inherit;
    }

    .handle-bar {
        width: 2.25rem;
        height: 0.25rem;
        border-radius: var(--radius-full);
        background: var(--color-muted-foreground);
        opacity: 0.25;
    }
    .handle-zone--vertical .handle-bar {
        width: 0.25rem;
        height: 2.25rem;
    }

    .handle-actions {
        display: none;
        align-items: center;
        justify-content: center;
        gap: 0.3125rem;
    }
    .handle-zone--vertical .handle-actions {
        flex-direction: column;
    }
    .handle-zone.expanded .handle-actions {
        display: flex;
    }

    .handle-action-btn {
        color: var(--color-muted-foreground);
    }
    .handle-action-btn:hover {
        color: var(--color-foreground);
    }

    @media (prefers-reduced-motion: reduce) {
        .handle-zone {
            transition-duration: 0.01ms;
        }
    }
</style>
