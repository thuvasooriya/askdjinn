<script lang="ts">
  import { Truck, CircleCheck, CircleX } from "@lucide/svelte";

  let {
    city,
    rate,
    currency = "LKR",
    dates = [],
  }: {
    city: string;
    rate?: number;
    currency?: string;
    dates: Array<{ date: string; available: boolean }>;
  } = $props();

  const formattedRate = $derived(
    rate != null
      ? new Intl.NumberFormat("en-LK", { style: "currency", currency, minimumFractionDigits: 0 }).format(rate)
      : null,
  );

  const monthLabel = $derived.by(() => {
    if (!dates.length) return null;
    try {
      const d = new Date(dates[0].date + "T00:00:00");
      return isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    } catch { return null; }
  });

  function dayLabel(dateStr: string): string {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { day: "numeric" });
    } catch { return dateStr; }
  }
</script>

<div class="dc" class:dc--unavailable={!dates.some(d => d.available)}>
  <div class="dc-left">
    <div class="dc-header">
      <Truck class="dc-icon" />
      {#if monthLabel}<span class="dc-month">{monthLabel}</span>{/if}
    </div>
    <span class="dc-city">
      {city}{#if formattedRate}<span class="dc-rate">&nbsp;&mdash; {formattedRate}</span>{/if}
    </span>
  </div>

  <div class="dc-right">
    {#each dates as d (d.date)}
      <div class="dc-day-col">
        <span class="dc-date-num" class:dc-date-num--ok={d.available} class:dc-date-num--no={!d.available}>
          {dayLabel(d.date)}
        </span>
        <span class="dc-status-icon">
          {#if d.available}
            <CircleCheck class="dc-day-icon dc-day-icon--ok" />
          {:else}
            <CircleX class="dc-day-icon dc-day-icon--no" />
          {/if}
        </span>
      </div>
    {/each}
  </div>
</div>

<style>
  .dc {
    display: inline-flex;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
    border: 1px solid color-mix(in srgb, var(--color-success) 30%, var(--color-border));
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-success) 5%, var(--color-surface));
    font-size: var(--fs-xs);
    line-height: 1.3;
    margin: 0.125rem 0;
    align-items: center;
  }
  .dc--unavailable {
    border-color: color-mix(in srgb, var(--color-destructive) 30%, var(--color-border));
    background: color-mix(in srgb, var(--color-destructive) 5%, var(--color-surface));
  }

  .dc-left {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .dc-header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
  .dc-header :global(.dc-icon) {
    width: 0.875rem;
    height: 0.875rem;
    color: var(--color-success);
    flex-shrink: 0;
  }
  .dc--unavailable .dc-header :global(.dc-icon) {
    color: var(--color-destructive);
  }
  .dc-month {
    color: var(--color-muted-foreground);
    font-weight: 500;
    white-space: nowrap;
  }

  .dc-city {
    color: var(--color-muted-foreground);
    font-size: var(--fs-2xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dc-rate {
    font-weight: 500;
  }

  .dc-right {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    padding-left: 0.5rem;
    border-left: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  }

  .dc-day-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
  }
  .dc-date-num {
    font-weight: 600;
    font-size: var(--fs-xs);
  }
  .dc-date-num--ok { color: var(--color-success); }
  .dc-date-num--no { color: var(--color-destructive); }

  .dc-day-col :global(.dc-day-icon) {
    width: 0.75rem;
    height: 0.75rem;
  }
  .dc-day-col :global(.dc-day-icon--ok) { color: var(--color-success); }
  .dc-day-col :global(.dc-day-icon--no) { color: var(--color-destructive); }
</style>
