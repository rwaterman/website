// Synthgrid — a synthwave horizon: a perspective grid scrolling toward the viewer under a
// banded setting sun, a violet-to-ember sky, and two ridges of mountains cut from 1D value noise.
float hash11(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float noise1d(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash11(i), hash11(i + 1.0), u);
}

float ridge(float x, float seed) {
  return 0.10 * noise1d(x * 3.0 + seed) + 0.05 * noise1d(x * 7.0 + seed * 2.0) + 0.02 * noise1d(x * 17.0 + seed);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);
  vec3 violet = vec3(0.55, 0.35, 0.95);
  float horizon = 0.02;
  vec3 col;

  if (uv.y < horizon) {
    float d = horizon - uv.y;
    float z = 0.35 / d;
    vec2 g = vec2(uv.x * z, z + iTime * 1.5) / 0.3;
    vec2 dist = 0.5 - abs(fract(g) - 0.5);
    vec2 w = fwidth(g) * 1.2 + 0.02;
    vec2 lines = 1.0 - smoothstep(vec2(0.0), w, dist);
    float gridLine = max(lines.x, lines.y) * (1.0 - exp(-d * 30.0));
    col = dark + ember * 0.12 * exp(-d * 12.0);
    col += mix(ember, highlight, gridLine * 0.3) * gridLine * 1.3;
  } else {
    float sky = smoothstep(horizon, 0.45, uv.y);
    col = mix(ember * 0.45, violet * 0.12, sky);
    vec2 sunPos = vec2(0.0, horizon + 0.2);
    float sd = length(uv - sunPos);
    float sun = 1.0 - smoothstep(0.20, 0.205, sd);
    float band = sin((uv.y - horizon) * 90.0 - iTime * 0.8);
    float threshold = 0.9 - 6.0 * (uv.y - horizon);
    sun *= smoothstep(-0.08, 0.08, band - threshold);
    vec3 sunCol = mix(accent, highlight, smoothstep(sunPos.y - 0.2, sunPos.y + 0.2, uv.y));
    col += sunCol * sun + accent * 0.35 * exp(-sd * 5.0);
    float farRidge = horizon + 0.03 + ridge(uv.x + 0.3, 5.0);
    float nearRidge = horizon + 0.005 + ridge(uv.x, 1.0) * 0.7;
    if (uv.y < farRidge) col = mix(violet * 0.18, dark, smoothstep(0.0, 0.06, farRidge - uv.y));
    if (uv.y < nearRidge) col = dark + ember * 0.15 * (1.0 - smoothstep(0.0, 0.015, nearRidge - uv.y));
  }
  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
