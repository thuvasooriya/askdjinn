let switchEl: HTMLInputElement | null = null;

function supportsSwitch(): boolean {
  const el = document.createElement("input");
  el.type = "checkbox";
  return "switch" in el;
}

/** Call once (e.g. onMount) to plant the hidden toggle iOS Safari uses for haptics. */
export function ensureHapticSwitch(): void {
  if (switchEl || typeof document === "undefined") return;
  if (!supportsSwitch()) return; // not iOS ≥17.4
  switchEl = document.createElement("input");
  switchEl.type = "checkbox";
  switchEl.setAttribute("switch", "");
  switchEl.style.cssText = "position:fixed;opacity:0;pointer-events:none;width:0;height:0";
  document.body.appendChild(switchEl);
}

function fire(): void {
  // iOS ≥17.4: toggle hidden switch → Taptic Engine
  if (switchEl) {
    // Toggle off then on — triggers haptic on the second change
    switchEl.checked = false;
    // requestAnimationFrame ensures the checked change registers
    requestAnimationFrame(() => { switchEl!.checked = true; });
    return;
  }
  // Android / other: Vibration API
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

/** Trigger a light haptic tap. Safe to call anywhere — no-ops on unsupported browsers. */
export function hapticTap(): void {
  fire();
}

/**
 * Svelte action — attaches a haptic tap to the element's `pointerdown`.
 * @example <button use:haptic>Tap me</button>
 */
export function haptic(node: HTMLElement): { destroy: () => void } {
  node.addEventListener("pointerdown", fire);
  return {
    destroy() {
      node.removeEventListener("pointerdown", fire);
    },
  };
}
