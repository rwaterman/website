// Afterburn — a neon tube tunnel, a nod to Radial Afterburn.
// Polar remap of the screen into (angle, depth), 16 glowing lanes around the rim,
// rings marching toward the viewer, fogged toward the vanishing point.
#define TAU 6.28318530718

vec3 palette(float t) {
  return mix(vec3(0.70, 0.15, 0.12), vec3(0.94, 0.41, 0.36), t);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float depth = 0.25 / max(r, 1e-3) + iTime * 0.6;
  float twist = angle + 0.35 * sin(depth * 0.8 + iTime * 0.5);

  float lanes = abs(fract(twist / TAU * 16.0) - 0.5);
  float rings = abs(fract(depth * 2.0) - 0.5);
  float laneGlow = 0.02 / (lanes + 0.015);
  float ringGlow = 0.03 / (rings + 0.025);
  float pulse = 0.6 + 0.4 * sin(depth * 3.0 - iTime * 4.0);
  float fog = smoothstep(0.02, 0.6, r);

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += palette(0.5 + 0.5 * sin(depth + iTime)) * laneGlow * fog * 0.6;
  col += palette(fract(depth * 0.5)) * ringGlow * fog * pulse;
  col += vec3(1.0, 0.9, 0.85) * laneGlow * ringGlow * fog * 0.15;
  col += vec3(1.0, 0.85, 0.8) * 0.02 / (r + 0.02);

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
