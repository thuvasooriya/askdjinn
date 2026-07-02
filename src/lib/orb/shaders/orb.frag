#version 300 es

// ============================================================
// Djinn Orb -- Fragment Shader (Metaball Renderer)
// ============================================================
// Renders up to 8 metaballs inside a circular container with:
//   - Smooth metaball blending via polynomial smin
//   - Cursor-driven container displacement
//   - Click ripple effect
//   - Rim glow + edge ring at the sphere boundary
//   - Core brightness, saturation, breathing animation
// ============================================================

precision highp float;

// ---- Interpolated Inputs ----
in vec2 vUv;                // UV coordinate (0,0 = bottom-left, 1,1 = top-right)

// ---- Output ----
out vec4 outColor;          // Final RGBA pixel color

// ---- Constants ----
#define N 8                 // Maximum number of metaball blobs

// ---- Uniforms (set every frame from TypeScript) ----

// Resolution & time
uniform vec2 uRes;          // Canvas resolution in pixels (for aspect correction)
uniform float uTime;        // Elapsed time in seconds (drives all animation)

// Mouse / pointer interaction
uniform vec2 uMouse;        // Mouse position in NDC (normalized device coords)
uniform int uMouseActive;   // 1 if mouse is over the canvas, 0 otherwise

// Click ripple
uniform float uClickTime;   // Seconds since last click (resets to 0 on click)
uniform vec2 uClickPos;     // Click position in NDC (where ripple originates)

// Metaball blob data (arrays of N elements)
uniform vec2 uCenters[N];   // Blob center positions in NDC
uniform vec2 uAniso[N];     // Blob anisotropy (stretch per axis: x = width, y = height)
uniform float uRadii[N];    // Blob base radii
uniform vec3 uColors[N];    // Blob colors (RGB float 0-1)
uniform float uWeights[N];  // Blob visibility weights (0 = invisible, 1 = full)

// Visual tweak parameters (from the design controls panel)
uniform float uSoft;        // Metaball merge softness (smin k factor)
uniform float uGlow;        // Outer glow bloom intensity
uniform float uSat;         // Color saturation multiplier
uniform float uCore;        // Core brightness (white center hotspot)
uniform float uRim;         // Rim glow intensity at sphere edge
uniform float uBreathe;     // Breathing animation amplitude (sphere pulses)
uniform float uAudio;       // Audio level (0-1) for live mode voice reactivity
uniform float uCursorPull;  // How strongly the cursor displaces the container sphere
uniform vec3 uBgColor;      // Background color (RGB float 0-1)

// ---- Included Utility Functions ----
#include chunks/smin.glsl
#include chunks/adjustSat.glsl

// ============================================================
// Main Fragment Entry Point -- runs once per pixel
// ============================================================
void main(){
  // ---- Coordinate Setup ----
  // Map UV from [0,1] to NDC [-1,+1] so origin is at canvas center
  vec2 uv = (vUv * 2.0 - 1.0);

  // Correct for non-square aspect ratio so the orb stays circular
  // even if the canvas were wider than tall (currently 1:1, but future-proof)
  uv.x *= uRes.x / uRes.y;

  // ---- Cursor Influence ----
  // Read mouse position (or zero if pointer is outside canvas)
  vec2 mouseUv = (uMouseActive == 1) ? uMouse : vec2(0.0);

  // Mouse influence falls off from center to edge using smoothstep:
  // - at center (dist=0): influence = 1.0
  // - at dist=0.9: influence starts dropping
  // - at dist>=1.0: influence = 0.0
  float mouseInfluence = (uMouseActive == 1)
    ? smoothstep(0.9, 0.0, length(uv))
    : 0.0;

  // ---- Container Sphere Displacement ----
  // The outer circular boundary moves toward the cursor.
  // containerOffset is a vector pointing from origin toward mouseUv,
  // scaled by user's uCursorPull strength and falloff.
  vec2 containerOffset = mouseUv * uCursorPull * mouseInfluence;

  // Shift UV coordinates away from the offset so the sphere appears
  // to slide toward the cursor while blobs stay fixed in world space.
  vec2 containerUv = uv - containerOffset;

  // ---- Container Mask (Circular Boundary) ----
  // Distance from the (displaced) container center
  float dist = length(containerUv);

  // Breathing animation: the container radius oscillates smoothly
  // at frequency 0.7, amplitude controlled by uBreathe slider.
  float breathe = 1.0 + sin(uTime * 0.7) * uBreathe + uAudio * 0.15;

  // Alpha mask for the container edge:
  // - dist < breathe-0.04 : fully inside (alpha = 1)
  // - breathe-0.04 ... breathe : smooth transition
  // - dist > breathe : fully outside (alpha = 0)
  float mask = smoothstep(breathe, breathe - 0.04, dist);

  // Early exit: if this pixel is outside the container, render background
  // and skip all metaball calculations (performance optimization).
  if(mask < 0.001){
    outColor = vec4(uBgColor, 0.0);
    return;
  }

  // ---- Metaball Distance Field ----
  // Evaluate all N metaballs and blend their signed-distance fields
  // into a single scalar field using smooth minimum.

  float field = 1000.0;     // Start far away (no surface yet)
  vec3 colAccum = vec3(0.0);// Accumulator for weighted color sum
  float wSum = 0.0;         // Sum of weights for color normalization

  for(int i = 0; i < N; i++){
    // Skip invisible blobs (weight near zero)
    float wgt = uWeights[i];
    if(wgt < 0.003) continue;

    // Blob center position (no cursor pull -- blobs stay in world space)
    vec2 c = uCenters[i];

    // Transform UV into blob-local space:
    //   rel = (uv - center) / anisotropy
    // Anisotropy stretches/compresses the blob per axis:
    //   aniso=(1,1) = round, aniso=(0.16, 0.5) = tall thin bar
    vec2 rel = (uv - c) / uAniso[i];

    // Signed distance from blob surface:
    //   d > 0  = outside the blob
    //   d = 0  = on the surface
    //   d < 0  = inside the blob
    float d = length(rel) - uRadii[i];

    // Scale distance by weight: lower weight pushes the surface outward
    // so the blob becomes smaller/fainter.
    // dw = d / wgt + (1-wgt)*offset -- when wgt < 1, the blob shrinks
    float dw = d / max(wgt, 0.05) + (1.0 - wgt) * 0.4;

    // Smooth-min blend into the global field:
    // Each successive blob pushes the field value down where they overlap,
    // creating the fluid merging effect.
    field = smin(field, dw, uSoft);

    // Compute per-blob color weight:
    // Exponential falloff from blob surface -- blobs contribute color
    // mostly at/inside their surface, fading quickly outside.
    float w = exp(-max(d, 0.0) * 6.0) * wgt;

    // Accumulate weighted color
    colAccum += uColors[i] * w;
    wSum += w;
  }

  // Final blob color is the weighted average of all contributing blobs.
  // Fallback to first blob's color if no blobs contribute.
  vec3 blobColor = (wSum > 0.0001) ? colAccum / wSum : uColors[0];

  // ---- Surface Detection ----
  // Convert the continuous field into a hard-ish surface:
  //   field > 0.06  = outside (shape = 0)
  //   field < -0.15 = inside  (shape = 1)
  //   in between    = soft transition (antialiased edge)
  float shape = smoothstep(0.06, -0.15, field);

  // Wider version for the glow effect:
  //   field > 0.5  = no glow
  //   field < -0.3 = full glow
  float glowShape = smoothstep(0.5, -0.3, field);

  // ---- Click Ripple ----
  // A circular wave that expands from the click point and fades over 1.6s.
  float ripple = 0.0;
  if(uClickTime < 1.6){
    // Distance from current pixel to the click origin
    float rd = length(uv - uClickPos);
    // Wavefront travels outward at speed 1.2
    float wave = uClickTime * 1.2;
    // Ring around the wavefront, fading linearly over time
    ripple = smoothstep(0.1, 0.0, abs(rd - wave)) * (1.0 - uClickTime / 1.6);
  }

  // ---- Color Composition ----
  // Start with the blob surface color (modulated by shape)
  vec3 col = blobColor * shape;

  // Add outer glow (bloom around the blobs)
  col += blobColor * glowShape * uGlow * 0.5;

  // Add core hotspot: bright white at the center of each blob,
  // using pow(shape, 4) to confine it to the blob interior.
  col += vec3(1.0) * pow(shape, 4.0) * uCore * 0.5;

  // Add click ripple tint
  col += blobColor * ripple * 1.1;

  // ---- Container Sphere Effects ----
  // Wide rim glow at the sphere edge (starts from 40% inward,
  // giving a soft halo effect).
  float rim = smoothstep(breathe * 0.4, breathe, dist);
  col += rim * uRim * mix(blobColor, vec3(1.0), 0.5) * 0.8;

  // Crisp bright ring exactly at the sphere boundary:
  //   - smoothstep(breathe*0.92, breathe*0.98, dist) = start lighting up
  //   - smoothstep(breathe*0.98, breathe*1.02, dist) = start fading out
  //   The subtraction isolates a thin band at ~95% of the sphere radius.
  float edgeRing = smoothstep(breathe * 0.92, breathe * 0.98, dist)
                 - smoothstep(breathe * 0.98, breathe * 1.02, dist);
  col += vec3(1.0) * edgeRing * 0.6;

  // ---- Post-processing ----
  // Adjust color saturation (can boost or reduce)
  col = adjustSat(col, uSat);

  // Final alpha: combine mask * (shape + glow + rim) so edges fade smoothly
  float alpha = mask * clamp(
    shape * 1.3 + glowShape * uGlow * 0.4 + rim * uRim * 0.5,
    0.0, 1.0
  );

  // Blend blob color over background using alpha
  col = mix(uBgColor, col, alpha);

  // Output final pixel: RGB color + alpha (at least 0.1 for blending)
  outColor = vec4(col, mask * max(alpha, 0.1));
}
