<script module lang="ts">
  // Re-export types for backwards compat with components that import from AgentOrb
  export type { Mode as OrbMode, State } from "$lib/orb/state-machine.svelte";

  // Extended OrbState includes aliases used by AgentBar/ConversationTile
  export type OrbState =
    | "idle" | "working" | "voiceIn" | "listening"
    | "stream" | "error" | "searching" | "speaking" | "thinking";
</script>

<script lang="ts">
  // Thin wrapper: creates orb state, syncs external props, renders OrbCanvas.
  // All layout logic, shaders, and interaction live in $lib/orb/.

  import { createOrbState, AGENT_SHAPE, readThemeOrbColors } from "$lib/orb/state-machine.svelte";
  import type { Mode, State } from "$lib/orb/state-machine.svelte";
  import OrbCanvas from "$lib/orb/OrbCanvas.svelte";
  import { useProfile } from "$lib/stores/profile.svelte";
  import { untrack } from "svelte";

  let {
    mode = "llm" as Mode,
    phase = "idle" as OrbState,
    audioLevel = 0,
    size = 48,
    interactive = false,
  }: {
    mode?: Mode;
    phase?: OrbState;
    audioLevel?: number;
    size?: number;
    interactive?: boolean;
  } = $props();

  const profile = useProfile();
  const orb = createOrbState();

  // Re-apply orb design whenever the agent (→ motion) or theme (→ color)
  // changes. Shape comes from the agent preset; color is derived from the
  // active theme's CSS variables. Single source of truth per axis.
  $effect(() => {
    const agentId = profile.agentId;
    const themeId = profile.themeId; // track theme so we re-read colors on switch
    untrack(() => {
      const shape = AGENT_SHAPE[agentId];
      if (shape) Object.assign(orb.design, shape);
      Object.assign(orb.design, readThemeOrbColors(agentId));
    });
    void themeId;
  });

  // Map external phase aliases to internal orb states
  function toInternal(p: OrbState): State {
    if (p === "searching" || p === "thinking") return "working";
    if (p === "speaking") return "stream";
    if (p === "listening") return "voiceIn";
    return p as State;
  }

  // Sync external props -> orb state with smooth transitions
  $effect(() => {
    const targetState = toInternal(phase);
    const currentMode = untrack(() => orb.mode);
    const currentState = untrack(() => orb.state);
    if (currentMode !== mode || currentState !== targetState) {
      untrack(() => {
        orb.switchState(mode, targetState);
      });
    }
  });
</script>

<OrbCanvas {orb} {audioLevel} {interactive} {size} />
