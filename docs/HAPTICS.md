# Web Haptics — Research Findings

## Platform Support Matrix (mid-2026)

| Platform | Works? | Mechanism |
|---|---|---|
| Android Chrome / Firefox | ✅ | `navigator.vibrate(ms)` — standard Vibration API |
| iOS Safari ≥17.4 | ✅ (workaround) | Hidden `<input type="checkbox" switch">` toggle fires Taptic Engine |
| iOS Safari <17.4 | ❌ | No path available |
| macOS Safari / Chrome / Firefox | ❌ | No haptic API exposed to web content. Force Touch is native-app only |
| Desktop Chrome (some hardware) | ⚠️ | Sporadic, unreliable |

## Vibration API (`navigator.vibrate`)

### Signature
```ts
// Single pulse (milliseconds)
navigator.vibrate(10);

// Pattern: [vibrate, pause, vibrate, pause, ...]
navigator.vibrate([10, 50, 10]);
```

### Caveats
- Requires user gesture (click/tap) to trigger
- No intensity control — just on/off duration
- iOS Safari blocks it entirely
- macOS / desktop support is inconsistent

## iOS Safari Workaround

Since iOS 17.4, Safari supports a native toggle switch via `<input type="checkbox" switch">`. When toggled programmatically, it fires the Taptic Engine.

### How it works
```ts
let el = document.querySelector<HTMLInputElement>("#haptic-switch");
el.checked = false;
requestAnimationFrame(() => { el.checked = true; });
```

### Feature detection
```ts
function supportsSwitch(): boolean {
  const el = document.createElement("input");
  el.type = "checkbox";
  return "switch" in el;
}
```

### Why it works
Apple exposes native control toggling to the Taptic Engine. The hidden element is never visible to the user — it's just a conduit for the haptic actuator.

## Svelte Integration

### Option A: Lightweight DIY action (~25 lines, no deps)

```ts
// src/lib/actions/haptic.ts
let switchEl: HTMLInputElement | null = null;

function supportsSwitch(): boolean {
  const el = document.createElement("input");
  el.type = "checkbox";
  return "switch" in el;
}

export function ensureHapticSwitch(): void {
  if (switchEl || typeof document === "undefined") return;
  if (!supportsSwitch()) return;
  switchEl = document.createElement("input");
  switchEl.type = "checkbox";
  switchEl.setAttribute("switch", "");
  switchEl.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:0;height:0";
  document.body.appendChild(switchEl);
}

export function hapticTap(): void {
  if (switchEl) {
    switchEl.checked = false;
    requestAnimationFrame(() => { switchEl!.checked = true; });
    return;
  }
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}
```

Usage in a Svelte component:
```svelte
<script>
  import { ensureHapticSwitch, hapticTap } from "$lib/actions/haptic";
  import { onMount } from "svelte";
  onMount(ensureHapticSwitch);
</script>

<button onclick={() => { hapticTap(); doStuff(); }}>
  Tap me
</button>
```

### Option B: WebHaptics library

NPM: `@rowixorg/web-haptics` (~2 kB gzipped)

Provides presets and handles iOS trick + Android fallback internally.

```ts
import { trigger, presets } from "@rowixorg/web-haptics";
trigger(presets.medium);
// presets: light, medium, heavy, soft, rigid
//          selection, success, warning, error
```

### Option C: Svelte action (`use:haptic`)

```ts
// src/lib/actions/haptic.ts
export function haptic(node: HTMLElement) {
  function fire() { hapticTap(); }
  node.addEventListener("pointerdown", fire);
  return { destroy() { node.removeEventListener("pointerdown", fire); } };
}
```

```svelte
<script>
  import { haptic, ensureHapticSwitch } from "$lib/actions/haptic";
  import { onMount } from "svelte";
  onMount(ensureHapticSwitch);
</script>

<button use:haptic onclick={doStuff}>Tap</button>
```

## Chrome/Blink Proposed API (not shipped)

Blink has discussed a CSS-based `@haptic` at-rule (reactive haptics only, V1). No ship date. Not usable today.

## Further Reading

- WebHaptics library: https://github.com/lochie/web-haptics
- BlinkOn 21 Haptics API talk: https://www.youtube.com/watch?v=Jq31x97JkVU
- iOS Haptics via checkbox switch: https://github.com/dm-zharov/haptic-feedback
