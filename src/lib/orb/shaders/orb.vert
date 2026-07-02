#version 300 es

// -- Vertex Shader for the Djinn Orb --
// Renders a full-screen quad (two triangles) that covers the canvas.
// The fragment shader does all the work; this just passes UV coordinates.

// Input: vertex position from the quad buffer (-1 to +1)
in vec2 aPos;

// Output: UV coordinate (0 to 1) passed to the fragment shader
out vec2 vUv;

void main(){
  // Map from [-1,1] NDC to [0,1] UV space for the fragment shader
  vUv = aPos * 0.5 + 0.5;
  // Pass position directly as clip-space coordinates (full-screen quad)
  gl_Position = vec4(aPos, 0.0, 1.0);
}
