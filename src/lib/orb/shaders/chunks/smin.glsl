// Polynomial smooth min (smin) -- blends two distance fields together
// so metaballs merge smoothly instead of cutting sharply.
//
// a, b  : the two signed-distance values to blend
// k     : softness factor (higher = smoother merge, lower = sharper)
//
// Returns a value that is slightly less than min(a,b), creating
// a smooth bridge when two blobs get close.
#ifndef SMIN_GLSL
#define SMIN_GLSL

float smin(float a, float b, float k){
  // Normalize (b-a) into [0,1] range using k as the smoothing radius
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  // Linear blend of a and b, then subtract the polynomial term
  // k*h*(1-h) creates the rounded "bridge" between the two surfaces
  return mix(b, a, h) - k * h * (1.0 - h);
}

#endif
