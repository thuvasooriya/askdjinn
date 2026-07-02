<script lang="ts">
  import { page } from "$app/state";
  import { Sparkles } from "@lucide/svelte";
</script>

<div class="gradient-glow flex h-dvh flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center">
  <div class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--color-destructive)]/10 ring-1 ring-[var(--color-destructive)]/20">
    <p class="text-sm font-bold text-[var(--color-destructive)]">!</p>
  </div>
  <h1 class="text-xl font-bold text-[var(--color-foreground)]">Something went wrong</h1>
  <p class="mt-2 max-w-md text-sm leading-relaxed text-[var(--color-muted-foreground)]">
    {page.error?.message ?? "An unexpected error occurred. Please reload the page."}
  </p>
  <a
    href="/"
    class="mt-6 inline-flex items-center gap-2 rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-[var(--color-primary-foreground)] shadow-glow transition hover:shadow-lg active:scale-95"
  >
    <Sparkles class="h-4 w-4" /> Reload
  </a>
</div>
