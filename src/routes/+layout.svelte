<script lang="ts">
  import "../app.css";
  import { Toaster } from "svelte-sonner";
  import { APP_NAME } from "$lib/brand";
  let { children } = $props();
</script>

<svelte:head>
  <title>{APP_NAME}</title>
</svelte:head>

{@render children()}

<Toaster
  theme="dark"
  position="top-center"
  richColors
  toastOptions={{
    classes: {
      toast: "!bg-[var(--color-surface)] !border !border-[var(--color-border)] !text-[var(--color-foreground)] !rounded-xl",
    },
  }}
/>
