export const N = 8;

export type Mode = 'llm' | 'live' | 'connecting' | 'disconnecting';
export type State = 'idle' | 'working' | 'voiceIn' | 'stream' | 'error';

export interface DesignParams {
  cIdle: string; cWork: string; cListen: string; cStream: string; cError: string; cBg: string;
  blobSize: number; soft: number; morphSpeed: number; breathe: number;
  glow: number; sat: number; core: number; rim: number;
  cursorPull: number; holdDur: number;
}

/** Per-agent SHAPE/MOTION parameters only. Color comes from the theme
 *  (readThemeOrbColors below). Defined here, consumed by agents.ts. */
export interface OrbShape {
  blobSize: number;
  soft: number;
  morphSpeed: number;
  breathe: number;
  glow: number;
  sat: number;
}

export interface OrbLayout {
  centers: [number, number][];
  aniso: [number, number][];
  radii: number[];
  colors: [number, number, number][];
  weights: number[];
}

export function hexToRgb(hex: string): [number, number, number] {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return [0.5, 0.5, 0.9];
  const v = parseInt(hex.slice(1), 16);
  if (!Number.isFinite(v)) return [0.5, 0.5, 0.9];
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

export function easeInOut(x: number): number {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export const defaultDesign: DesignParams = {
  cIdle: '#7c6bff', cWork: '#4d9fff', cListen: '#1dd3a0', cStream: '#ff8fae', cError: '#ff3b5c', cBg: '#050508',
  blobSize: 0.38, soft: 0.26, morphSpeed: 1.1, breathe: 0.02,
  glow: 0.85, sat: 1.15, core: 0.65, rim: 0.55,
  cursorPull: 0.2, holdDur: 0.9,
};

/** Per-agent orb shape/motion. Keys are agent ids; values carry only the
 *  shape fields of DesignParams. COLOR is derived from the active theme at
 *  runtime via readThemeOrbColors() — there is no per-agent color palette
 *  anymore (single source of truth = the theme). */
export const AGENT_SHAPE: Record<string, OrbShape> = {
  ruka:  { blobSize: 0.40, soft: 0.28, morphSpeed: 1.3, breathe: 0.03, glow: 0.90, sat: 1.15 },
  mithu: { blobSize: 0.36, soft: 0.22, morphSpeed: 0.7, breathe: 0.015, glow: 0.70, sat: 1.0 },
  kavi:  { blobSize: 0.38, soft: 0.30, morphSpeed: 0.9, breathe: 0.025, glow: 0.85, sat: 1.1 },
  neel:  { blobSize: 0.34, soft: 0.24, morphSpeed: 1.1, breathe: 0.02, glow: 0.80, sat: 1.05 },
};

/** Read the orb's color fields from the active theme's CSS variables, then
 *  SHUFFLE which semantic token leads each agent so the four orbs are visually
 *  distinct on screen -- "shuffling the common theme variables" per agent:
 *
 *    ruka  (Warm/Bold)          idle=primary   work=accent
 *    mithu (Moody/Moon)         idle=accent    work=primary
 *    kavi  (Poetic/Thoughtful)  idle=success   work=accent
 *    neel  (Sharp/Analytical)   idle=primary∘accent blend   work=success
 *
 *  Each agent's idle color is a DISTINCT theme token, so four orbs side by
 *  side never collide. Streaming is always the idle color lightened toward
 *  white; cError=destructive, cBg=background are shared.
 *
 *  Reads computed style once per call (called on mount + theme/agent change,
 *  never per-frame). Falls back to defaultDesign values if a var is unset
 *  (e.g. during SSR or before hydration). */
export function readThemeOrbColors(agentId?: string): Pick<DesignParams, 'cIdle' | 'cWork' | 'cListen' | 'cStream' | 'cError' | 'cBg'> {
  if (typeof document === 'undefined') {
    return {
      cIdle: defaultDesign.cIdle, cWork: defaultDesign.cWork, cListen: defaultDesign.cListen,
      cStream: defaultDesign.cStream, cError: defaultDesign.cError, cBg: defaultDesign.cBg,
    };
  }
  const css = getComputedStyle(document.documentElement);
  const get = (token: string, fallback: string) => {
    const v = css.getPropertyValue(token).trim();
    return v || fallback;
  };
  // Convert any CSS color (hsl/rgb/hex/named) to a hex string the shader
  // pipeline already understands (hexToRgb expects #rrggbb).
  const toHex = (cssColor: string, fallback: string): string => {
    if (!cssColor) return fallback;
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return fallback;
    ctx.fillStyle = '#000';
    ctx.fillStyle = cssColor;
    const resolved = ctx.fillStyle;
    // Canvas normalizes to #rrggbb (or rgba() for alpha) — our colors are opaque.
    return resolved.startsWith('#') ? resolved : fallback;
  };
  const primary = toHex(get('--color-primary', defaultDesign.cIdle), defaultDesign.cIdle);
  const accent = toHex(get('--color-accent', defaultDesign.cWork), defaultDesign.cWork);
  const success = toHex(get('--color-success', defaultDesign.cListen), defaultDesign.cListen);
  const destructive = toHex(get('--color-destructive', defaultDesign.cError), defaultDesign.cError);
  const bg = toHex(get('--color-background', defaultDesign.cBg), defaultDesign.cBg);

  // Per-agent shuffle: each idle leads with a DISTINCT theme token so four
  // orbs side by side never read as the same color. See doc comment above.
  if (agentId === "mithu") {
    // Mithu (Moody/Moon): accent-led, cooler feel.
    const stream = mixToHex(accent, '#ffffff', 0.6);
    return { cIdle: accent, cWork: primary, cListen: success, cStream: stream, cError: destructive, cBg: bg };
  } else if (agentId === "kavi") {
    // Kavi (Poetic/Thoughtful): success-led (green), soft white streaming.
    const stream = mixToHex(success, '#ffffff', 0.7);
    return { cIdle: success, cWork: accent, cListen: primary, cStream: stream, cError: destructive, cBg: bg };
  } else if (agentId === "neel") {
    // Neel (Sharp/Analytical): a primary∘accent blend distinct from both.
    const idle = mixToHex(primary, accent, 0.5);
    const stream = mixToHex(idle, '#ffffff', 0.5);
    return { cIdle: idle, cWork: success, cListen: accent, cStream: stream, cError: destructive, cBg: bg };
  } else {
    // Ruka (Warm/Bold): primary-led, the brand-dominant mapping.
    const stream = mixToHex(primary, '#ffffff', 0.6);
    return { cIdle: primary, cWork: accent, cListen: success, cStream: stream, cError: destructive, cBg: bg };
  }
}

/** Mix two hex colors: returns hex of (1-t)*a + t*b. Used to derive the
 *  streaming color from the theme's primary. */
function mixToHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round((pa[0] + (pb[0] - pa[0]) * t) * 255);
  const g = Math.round((pa[1] + (pb[1] - pa[1]) * t) * 255);
  const bl = Math.round((pa[2] + (pb[2] - pa[2]) * t) * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${bl.toString(16).padStart(2, '0')}`;
}

export function createOrbState() {
  let mode = $state<Mode>('llm');
  let state = $state<State>('idle');
  let prevMode = $state<Mode>('llm');
  let prevState = $state<State>('idle');
  let transitionStart = $state(performance.now());
  let design = $state<DesignParams>({ ...defaultDesign });

  let mouseX = $state(0);
  let mouseY = $state(0);
  let mouseActive = $state(false);
  let clickTime = $state(999);
  let clickX = $state(0);
  let clickY = $state(0);

  const TRANSITION_MS = 700;

  function getModeLabel() {
    return mode === 'live' ? 'LIVE MODE'
      : mode === 'llm' ? 'LLM MODE'
      : mode === 'connecting' ? 'CONNECTING...'
      : 'DISCONNECTING...';
  }

  function getModeDotColor() {
    return mode === 'live' ? '#1dd3a0'
      : mode === 'llm' ? '#7c6bff'
      : '#888';
  }

  function getDisplayState() {
    return mode === 'connecting' || mode === 'disconnecting' ? mode : state;
  }

  function getCaptionText() {
    const captions: Record<string, string> = {
      'llm-idle': 'Waiting for input...',
      'llm-working': 'Thinking...',
      'llm-stream': 'Responding...',
      'llm-error': 'Something went wrong',
      'live-idle': 'Listening for voice...',
      'live-voiceIn': 'Hearing you...',
      'live-working': 'Processing...',
      'live-stream': 'Speaking...',
      'live-error': 'Connection error',
      'connecting-idle': 'Connecting to live mode...',
      'disconnecting-idle': 'Returning to text mode...',
    };
    const key = (mode === 'connecting' || mode === 'disconnecting')
      ? mode + '-idle'
      : mode + '-' + state;
    return captions[key] || '\u00A0';
  }

  function switchState(newMode: Mode, newState: State) {
    prevMode = mode;
    prevState = state;
    mode = newMode;
    state = newState;
    transitionStart = performance.now();
  }


  function getStateButtons(): [State, string][] {
    const baseMode = (mode === 'connecting' || mode === 'disconnecting')
      ? (mode === 'connecting' ? 'live' as Mode : 'llm' as Mode)
      : mode;
    if (baseMode === 'llm') {
      return [
        ['idle' as State, 'Idle'],
        ['working' as State, 'Working'],
        ['stream' as State, 'Streaming'],
        ['error' as State, 'Error'],
      ];
    }
    return [
      ['idle' as State, 'Idle'],
      ['voiceIn' as State, 'Voice In'],
      ['working' as State, 'Working'],
      ['stream' as State, 'Streaming'],
      ['error' as State, 'Error'],
    ];
  }

  function getIsActiveState(s: State): boolean {
    const baseMode = (mode === 'connecting' || mode === 'disconnecting')
      ? (mode === 'connecting' ? 'live' as Mode : 'llm' as Mode)
      : mode;
    return mode === baseMode && state === s;
  }

  /** Dev-panel hook: apply an agent's shape preset (motion only, no color). */
  function applyAgentShape(agentId: string) {
    const shape = AGENT_SHAPE[agentId];
    if (shape) Object.assign(design, shape);
  }

  /** Dev-panel hook: override orb colors directly for live tuning. */
  function applyColors(colors: Partial<Pick<DesignParams, 'cIdle' | 'cWork' | 'cListen' | 'cStream' | 'cError' | 'cBg'>>) {
    Object.assign(design, colors);
  }

  return {
    get mode() { return mode; },
    get state() { return state; },
    get prevMode() { return prevMode; },
    get prevState() { return prevState; },
    get transitionStart() { return transitionStart; },
    get design() { return design; },
    get mouseX() { return mouseX; },
    set mouseX(v: number) { mouseX = v; },
    get mouseY() { return mouseY; },
    set mouseY(v: number) { mouseY = v; },
    get mouseActive() { return mouseActive; },
    set mouseActive(v: boolean) { mouseActive = v; },
    get clickTime() { return clickTime; },
    set clickTime(v: number) { clickTime = v; },
    get clickX() { return clickX; },
    set clickX(v: number) { clickX = v; },
    get clickY() { return clickY; },
    set clickY(v: number) { clickY = v; },
    TRANSITION_MS,
    get modeLabel() { return getModeLabel(); },
    get modeDotColor() { return getModeDotColor(); },
    get displayState() { return getDisplayState(); },
    getCaptionText,
    switchState,
    getStateButtons,
    getIsActiveState,
    applyAgentShape,
    applyColors,
  };
}

export type OrbState = ReturnType<typeof createOrbState>;

function emptyLayout(): OrbLayout {
  return {
    centers: Array.from({ length: N }, () => [0, 0] as [number, number]),
    aniso: Array.from({ length: N }, () => [1, 1] as [number, number]),
    radii: new Array(N).fill(0),
    colors: Array.from({ length: N }, () => [0.5, 0.5, 0.9] as [number, number, number]),
    weights: new Array(N).fill(0),
  };
}

export function layoutIdle(t: number, colHex: string, design: DesignParams): OrbLayout {
  const L = emptyLayout();
  const col = hexToRgb(colHex);
  const orbit = 0.24;
  for (let i = 0; i < 4; i++) {
    const speed = 0.35 + i * 0.08;
    const phase = i * 1.7;
    L.centers[i] = [Math.cos(t * speed + phase) * orbit, Math.sin(t * speed * 1.3 + phase) * orbit];
    L.aniso[i] = [1, 1];
    L.radii[i] = design.blobSize * (0.85 + 0.15 * Math.sin(t * 0.6 + i));
    L.colors[i] = col;
    L.weights[i] = 1.0;
  }
  return L;
}

export function layoutSpinner(t: number, colHex: string, dim: boolean, design: DesignParams): OrbLayout {
  const L = emptyLayout();
  const col = hexToRgb(colHex);
  const dotCount = 8;
  const phase = t * 4.2;
  for (let i = 0; i < dotCount; i++) {
    const ang = (i / dotCount) * Math.PI * 2;
    const r = 0.3;
    L.centers[i] = [Math.cos(ang) * r, Math.sin(ang) * r];
    L.aniso[i] = [1, 1];
    L.radii[i] = design.blobSize * 0.32;
    const trail = Math.max(0, Math.cos(ang - phase));
    const w = Math.pow(trail, 3.0) * 0.85 + 0.12;
    L.weights[i] = dim ? w * 0.55 : w;
    L.colors[i] = dim
      ? [col[0] * 0.6 + 0.2, col[1] * 0.6 + 0.2, col[2] * 0.6 + 0.2]
      : col;
  }
  return L;
}

// morphing ring that ripples like a circular audio spectrum -- for voice out / speaking
export function layoutWaveOut(t: number, colHex: string, design: DesignParams, audio: number = 0): OrbLayout {
  const L = emptyLayout();
  const col = hexToRgb(colHex);
  const count = 8;
  const baseR = 0.29;
  const audioBoost = audio * 0.08;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const ripple = 0.05 * Math.sin(ang * 2 + t * 1.8) + 0.035 * Math.sin(ang * 3 - t * 2.6);
    const breathe = 0.02 * Math.sin(t * 2.2) + audioBoost;
    const r = baseR + ripple + breathe;
    L.centers[i] = [Math.cos(ang) * r, Math.sin(ang) * r];
    const wave = 0.5 + 0.5 * Math.sin(t * 3.2 - ang * 5.0);
    L.aniso[i] = [0.72, 0.72];
    L.radii[i] = design.blobSize * (0.36 + 0.12 * wave);
    L.weights[i] = 0.80 + 0.20 * wave;
    L.colors[i] = col;
  }
  return L;
}

// 5 large soft blobs in a pentagon that breathes inward -- for voice in / listening
export function layoutVoiceIn(t: number, colHex: string, design: DesignParams, audio: number = 0): OrbLayout {
  const L = emptyLayout();
  const col = hexToRgb(colHex);
  const count = 5;
  const baseR = 0.30;
  const absorb = 0.5 + 0.5 * Math.sin(t * 3.0) + audio * 0.3;
  const rot = t * 0.25;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2 + rot;
    const r = baseR - 0.05 * absorb;
    L.centers[i] = [Math.cos(ang) * r, Math.sin(ang) * r];
    const pulse = 0.55 + 0.45 * Math.sin(t * 5.0 + i * 1.6);
    L.aniso[i] = [0.85, 0.85];
    L.radii[i] = design.blobSize * (0.60 + 0.10 * pulse);
    L.weights[i] = 1.0;
    L.colors[i] = col;
  }
  return L;
}

export function layoutStreamText(t: number, colHex: string, design: DesignParams): OrbLayout {
  const L = emptyLayout();
  const col = hexToRgb(colHex);
  for (let i = 0; i < 3; i++) {
    const ang = i * (Math.PI * 2 / 3) + t * 0.6;
    const r = 0.12;
    L.centers[i] = [Math.cos(ang) * r, Math.sin(ang) * r];
    L.aniso[i] = [1, 1];
    const pulse = 0.7 + 0.3 * Math.sin(t * 8.0 + i * 2.0);
    L.radii[i] = design.blobSize * 0.55 * pulse;
    L.weights[i] = 1.0;
    L.colors[i] = col;
  }
  return L;
}

export function layoutError(t: number, colHex: string, design: DesignParams): OrbLayout {
  const L = emptyLayout();
  const col = hexToRgb(colHex);
  const shakeDecay = Math.max(0, 1.0 - t * 1.2);
  for (let i = 0; i < 5; i++) {
    const ang = i * (Math.PI * 2 / 5);
    const jitterX = Math.sin(t * 23.0 + i * 5.1) * 0.05 * shakeDecay;
    const jitterY = Math.cos(t * 19.0 + i * 3.7) * 0.05 * shakeDecay;
    L.centers[i] = [Math.cos(ang) * 0.2 + jitterX, Math.sin(ang) * 0.2 + jitterY];
    L.aniso[i] = [1, 1];
    L.radii[i] = design.blobSize * 0.6;
    L.weights[i] = 1.0;
    L.colors[i] = col;
  }
  return L;
}

export function computeLayout(m: Mode, s: State, t: number, design: DesignParams, audio: number = 0): OrbLayout {
  if (m === 'connecting' || m === 'disconnecting') return layoutSpinner(t, '#8a86a8', true, design);
  if (m === 'llm') {
    if (s === 'idle') return layoutIdle(t, design.cIdle, design);
    if (s === 'working') return layoutSpinner(t, design.cWork, false, design);
    if (s === 'stream') return layoutStreamText(t, design.cStream, design);
    if (s === 'error') return layoutError(t, design.cError, design);
  }
  if (m === 'live') {
    if (s === 'idle') return layoutIdle(t, design.cListen, design);
    if (s === 'voiceIn') return layoutVoiceIn(t, design.cListen, design, audio);
    if (s === 'working') return layoutSpinner(t, design.cWork, false, design);
    if (s === 'stream') return layoutWaveOut(t, design.cStream, design, audio);
    if (s === 'error') return layoutError(t, design.cError, design);
  }
  return layoutIdle(t, design.cIdle, design);
}

export function lerpLayout(A: OrbLayout, B: OrbLayout, k: number): OrbLayout {
  const L = emptyLayout();
  for (let i = 0; i < N; i++) {
    L.centers[i] = [
      A.centers[i][0] + (B.centers[i][0] - A.centers[i][0]) * k,
      A.centers[i][1] + (B.centers[i][1] - A.centers[i][1]) * k,
    ];
    L.aniso[i] = [
      A.aniso[i][0] + (B.aniso[i][0] - A.aniso[i][0]) * k,
      A.aniso[i][1] + (B.aniso[i][1] - A.aniso[i][1]) * k,
    ];
    L.radii[i] = A.radii[i] + (B.radii[i] - A.radii[i]) * k;
    L.colors[i] = [
      A.colors[i][0] + (B.colors[i][0] - A.colors[i][0]) * k,
      A.colors[i][1] + (B.colors[i][1] - A.colors[i][1]) * k,
      A.colors[i][2] + (B.colors[i][2] - A.colors[i][2]) * k,
    ];
    L.weights[i] = A.weights[i] + (B.weights[i] - A.weights[i]) * k;
  }
  return L;
}
