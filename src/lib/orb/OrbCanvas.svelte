<script lang="ts">
  import { N, computeLayout, lerpLayout, easeInOut, hexToRgb } from './state-machine.svelte';
  import type { OrbState } from './state-machine.svelte';
  import vsSrc from './shaders/orb.vert?raw';
  import fragSrc from './shaders/orb.frag?raw';
  import sminSrc from './shaders/chunks/smin.glsl?raw';
  import adjustSatSrc from './shaders/chunks/adjustSat.glsl?raw';

  // Resolve #include directives once at module load. Chunks are static, so this
  // runs a single time. Vite ?raw hands us the raw source -- no GLSL plugin.
  const GLSL_CHUNKS: Record<string, string> = {
    'chunks/smin.glsl': sminSrc,
    'chunks/adjustSat.glsl': adjustSatSrc,
  };
  const fsSrc = fragSrc.replace(/#include\s+(\S+)/g, (_, p) => GLSL_CHUNKS[p] ?? `// unresolved include: ${p}`);

  let { orb, audioLevel = 0, interactive = true, size = 300, onHoldComplete = undefined as (() => void) | undefined }: { orb: OrbState; audioLevel?: number; interactive?: boolean; size?: number; onHoldComplete?: () => void } = $props();

  let canvas: HTMLCanvasElement;

  function compile(type: number, src: string, gl: WebGL2RenderingContext): WebGLShader {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  $effect(() => {
    const c = canvas;
    if (!c) return;
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return;

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSrc, gl));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSrc, gl));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const U: Record<string, WebGLUniformLocation | null> = {};
    const uniforms = [
      'uRes', 'uTime', 'uMouse', 'uMouseActive', 'uClickTime', 'uClickPos',
      'uSoft', 'uGlow', 'uSat', 'uCore', 'uRim', 'uBreathe', 'uAudio', 'uCursorPull', 'uBgColor',
    ];
    uniforms.forEach(n => { U[n] = gl.getUniformLocation(prog, n); });
    U.uCenters = gl.getUniformLocation(prog, 'uCenters');
    U.uAniso = gl.getUniformLocation(prog, 'uAniso');
    U.uRadii = gl.getUniformLocation(prog, 'uRadii');
    U.uColors = gl.getUniformLocation(prog, 'uColors');
    U.uWeights = gl.getUniformLocation(prog, 'uWeights');

    const centersArr = new Float32Array(N * 2);
    const anisoArr = new Float32Array(N * 2);
    const radiiArr = new Float32Array(N);
    const colorsArr = new Float32Array(N * 3);
    const weightsArr = new Float32Array(N);

    let start = performance.now();
    let animId: number;

    function resize() {
      if (!gl) return;
      const DPR = Math.min(window.devicePixelRatio || 1, 2);
      c.width = size * DPR;
      c.height = size * DPR;
      c.style.width = size + 'px';
      c.style.height = size + 'px';
      gl.viewport(0, 0, c.width, c.height);
    }
    resize();

    function frame() {
      if (!gl) return;
      const now = performance.now();
      const t = (now - start) / 1000 * orb.design.morphSpeed;


      if (orb.mode === 'connecting' && (now - orb.transitionStart) > 1500) {
        orb.switchState('live', 'idle');
      }
      if (orb.mode === 'disconnecting' && (now - orb.transitionStart) > 1500) {
        orb.switchState('llm', 'idle');
      }

      if (orb.clickTime < 1.6) orb.clickTime += 1 / 60;

      const transProgress = Math.min(1, (now - orb.transitionStart) / orb.TRANSITION_MS);
      const k = easeInOut(transProgress);
      const layoutFrom = computeLayout(orb.prevMode, orb.prevState, t, orb.design, audioLevel);
      const layoutTo = computeLayout(orb.mode, orb.state, t, orb.design, audioLevel);
      const L = lerpLayout(layoutFrom, layoutTo, k);

      for (let i = 0; i < N; i++) {
        centersArr[i * 2] = L.centers[i][0];
        centersArr[i * 2 + 1] = L.centers[i][1];
        anisoArr[i * 2] = L.aniso[i][0];
        anisoArr[i * 2 + 1] = L.aniso[i][1];
        radiiArr[i] = L.radii[i];
        colorsArr[i * 3] = L.colors[i][0];
        colorsArr[i * 3 + 1] = L.colors[i][1];
        colorsArr[i * 3 + 2] = L.colors[i][2];
        weightsArr[i] = L.weights[i];
      }

      const bg = hexToRgb(orb.design.cBg);
      gl.uniform2f(U.uRes, c.width, c.height);
      gl.uniform1f(U.uTime, t);
      gl.uniform2f(U.uMouse, orb.mouseX, orb.mouseY);
      gl.uniform1i(U.uMouseActive, orb.mouseActive ? 1 : 0);
      gl.uniform1f(U.uClickTime, orb.clickTime);
      gl.uniform2f(U.uClickPos, orb.clickX, orb.clickY);
      gl.uniform2fv(U.uCenters, centersArr);
      gl.uniform2fv(U.uAniso, anisoArr);
      gl.uniform1fv(U.uRadii, radiiArr);
      gl.uniform3fv(U.uColors, colorsArr);
      gl.uniform1fv(U.uWeights, weightsArr);
      gl.uniform1f(U.uSoft, orb.design.soft);
      gl.uniform1f(U.uGlow, orb.design.glow);
      gl.uniform1f(U.uSat, orb.design.sat);
      gl.uniform1f(U.uCore, orb.design.core);
      gl.uniform1f(U.uRim, orb.design.rim);
      gl.uniform1f(U.uBreathe, orb.design.breathe);
      gl.uniform1f(U.uAudio, audioLevel);
      gl.uniform1f(U.uCursorPull, orb.design.cursorPull);
      gl.uniform3f(U.uBgColor, bg[0], bg[1], bg[2]);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(animId);
    };
  });

  function toNDC(e: PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    return [x * (rect.width / rect.height), y];
  }

  function handlePointerMove(e: PointerEvent) {
    if (!interactive) return;
    const [x, y] = toNDC(e);
    orb.mouseX = x;
    orb.mouseY = y;
    orb.mouseActive = true;
  }

  function handlePointerLeave() {
    if (!interactive) return;
    orb.mouseActive = false;
  }

  function handlePointerDown(e: PointerEvent) {
    if (!interactive) return;
    const [x, y] = toNDC(e);
    orb.clickX = x;
    orb.clickY = y;
    orb.clickTime = 0;
    orb.tryStartHold();
  }

  $effect(() => {
    if (!interactive) return;
    const handler = () => {
      if (orb.holding) {
        const held = (performance.now() - orb.holdStart) / 1000;
        if (held >= orb.design.holdDur) {
          orb.completeHold();
          onHoldComplete?.();
        }
      }
      orb.cancelHold();
    };
    window.addEventListener('pointerup', handler);
    return () => window.removeEventListener('pointerup', handler);
  });
</script>

<div class="orb-shell" style="width:{size}px;height:{size}px;">
  <canvas
    bind:this={canvas}
    onpointermove={handlePointerMove}
    onpointerleave={handlePointerLeave}
    onpointerdown={handlePointerDown}
    style="width:{size}px;height:{size}px;"
  ></canvas>
</div>

<style>
  .orb-shell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  canvas {
    border-radius: var(--radius-full);
    cursor: pointer;
    touch-action: none;
    background: transparent;
  }
</style>
