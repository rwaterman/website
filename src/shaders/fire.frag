// Fire — the classic demo flame. fbm scrolls upward through a heat field that
// is hot at the base and thins toward the tips, a second faster noise tears
// the edges, and heat indexes a black → ember → accent → highlight ramp.
float hash21(vec2 p) {
  p = fract(mod(p, 289.0) * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.0 + 10.0;
    amplitude *= 0.5;
  }
  return value;
}

vec3 heatRamp(float heat) {
  vec3 col = mix(vec3(0.03, 0.015, 0.02), vec3(0.70, 0.15, 0.12), smoothstep(0.0, 0.4, heat));
  col = mix(col, vec3(0.94, 0.41, 0.36), smoothstep(0.4, 0.75, heat));
  col = mix(col, vec3(1.0, 0.9, 0.85), smoothstep(0.75, 1.05, heat));
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime;
  float rise = p.y + 0.5;
  float sway = (noise(vec2(rise * 3.0 - t * 1.5, p.x * 2.0)) - 0.5) * 0.4 * rise;
  vec2 q = vec2((p.x + sway) * 4.5, rise * 2.5 - t * 2.0);
  float body = fbm(q);
  float edge = fbm(q * 2.3 + vec2(t * 0.4, -t * 2.5));
  float heat = (1.0 - rise) * 1.5 - 0.45 + (body - 0.5) * 2.2 + (edge - 0.5) * 0.7;
  heat -= abs(p.x) * 0.3 * rise;
  heat = clamp(heat, 0.0, 1.0);

  vec3 col = heatRamp(heat);
  col += vec3(0.70, 0.15, 0.12) * 0.25 * exp(-rise * 4.0);

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
