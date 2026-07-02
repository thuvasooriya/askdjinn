// Adjusts the saturation of a color without affecting its luminance.
//
// c     : input RGB color
// s     : saturation multiplier (1.0 = original, 0.0 = grayscale, >1 = boosted)
#ifndef ADJUSTSAT_GLSL
#define ADJUSTSAT_GLSL

vec3 adjustSat(vec3 c, float s){
  // Compute luminance using standard ITU-R BT.601 weights
  // (human vision is most sensitive to green, least to blue)
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Blend between grayscale (vec3(l)) and original (c) by factor s
  return mix(vec3(l), c, s);
}

#endif
