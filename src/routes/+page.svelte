<script lang="ts">
  import { page } from "$app/state";
  import AppShell from "$lib/components/AppShell.svelte";

  const liveAvailable = $derived(page.data.liveAvailable);
</script>

<AppShell {liveAvailable} />
