// Pull in Bun's type declarations (including the `bun:test` module) so the
// test files type-check under svelte-check / tsc. Auto-loading of @types/bun
// does not always expose the ambient `bun:test` module to the program.
/// <reference types="bun" />

// Vite ?raw imports return the file source as a string. Used for GLSL shaders
// (orb.vert / orb.frag / chunks/*.glsl). Vite core handles ?raw natively, so
// no GLSL plugin is required.
declare module "*?raw" {
  const value: string;
  export default value;
}
