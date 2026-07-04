<script lang="ts">
  import type { Snippet } from "svelte";
  import type { Component } from "svelte";
  import { X } from "@lucide/svelte";
  import Button from "$lib/ui/Button.svelte";
  import { cn } from "$lib/utils";

  let {
    title,
    subtitle,
    count,
    icon: Icon,
    onClose,
    class: className,
    actions,
  }: {
    title: string;
    subtitle?: string;
    count?: number;
    icon?: Component;
    onClose?: () => void;
    class?: string;
    actions?: Snippet;
  } = $props();
</script>

<div class={cn("flex h-[var(--panel-header-h)] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-0", className)}>
  <div class="flex min-w-0 items-center gap-2">
    {#if Icon}<Icon class="h-4 w-4 shrink-0 text-[var(--color-primary)]" />{/if}
    <div class="min-w-0">
      <h2 class="font-display truncate text-base font-bold leading-none text-[var(--color-foreground)]">{title}</h2>
      {#if subtitle}<p class="mt-0.5 truncate text-[10px] leading-tight text-[var(--color-muted-foreground)]">{subtitle}</p>{/if}
    </div>
    {#if count !== undefined}
      <span class="shrink-0 rounded-full bg-[var(--color-primary)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--color-primary)]">
        {count}
      </span>
    {/if}
  </div>
  <div class="flex shrink-0 items-center gap-1.5">
    {@render actions?.()}
    {#if onClose}
      <Button variant="ghost" size="icon-sm" onclick={onClose} aria-label="Close">
        <X class="h-4 w-4" />
      </Button>
    {/if}
  </div>
</div>
