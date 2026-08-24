// Aurora — curtains over a star field. Each layer is a 1D fbm profile along x
// stretched into vertical streaks, hung from a wavy base and fading upward;
// three layers at different heights and speeds, tinted teal → violet → ember.
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
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.0 + 17.0;
    amplitude *= 0.5;
  }
  return value;
}

float curtain(vec2 p, float seed, float speed, float base) {
  float t = iTime * speed;
  float x = p.x * 2.0 + seed + 0.5 * (p.y - base);
  float intensity = smoothstep(0.25, 0.85, fbm(vec2(x * 1.5 + t, seed)));
  intensity *= intensity;
  float streak = 0.55 + 0.45 * noise(vec2(x * 16.0 - t * 4.0, seed + 5.0));
  float bottom = base + 0.25 * (noise(vec2(x * 1.3 + t * 0.7, seed + 9.0)) - 0.5);
  float h = p.y - bottom;
  float band = smoothstep(-0.06, 0.1, h) * exp(-max(h, 0.0) * 3.0);
  return band * intensity * streak;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 teal = vec3(0.2, 0.8, 0.75);
  vec3 violet = vec3(0.55, 0.35, 0.95);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  vec2 grid = p * 40.0;
  vec2 cellId = floor(grid);
  float starHash = hash21(cellId);
  vec2 starOffset = vec2(hash21(cellId + 3.1), hash21(cellId + 7.7)) - 0.5;
  float starDist = length(fract(grid) - 0.5 - starOffset * 0.6) / 40.0;
  float twinkle = 0.6 + 0.4 * sin(iTime * 3.0 + starHash * 50.0);
  float star = smoothstep(2.5 / iResolution.y, 0.0, starDist) * step(0.88, starHash) * twinkle;
  vec3 col = dark + highlight * star * 0.8;

  float glow = curtain(p, 1.0, 0.12, -0.32) * 0.9;
  glow += curtain(p, 4.0, 0.2, -0.12) * 0.7;
  glow += curtain(p, 9.0, 0.3, 0.08) * 0.5;
  vec3 tint = mix(teal, violet, smoothstep(-0.25, 0.2, p.y));
  tint = mix(tint, ember, smoothstep(0.2, 0.55, p.y));
  col += tint * glow * 2.0;
  col += highlight * glow * glow * 0.3;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
