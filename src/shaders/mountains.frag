// Mountains — parallax ridgelines under a low sun. Five layers, each a 1D
// ridged fbm profile at its own scale and drift speed; nearer layers are
// darker and taller, farther ones dissolve into sunlit ember haze.
float hash21(vec2 p) {
  p = fract(mod(p, 289.0) * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise1D(float x, float seed) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hash21(vec2(i, seed)), hash21(vec2(i + 1.0, seed)), u);
}

float ridge(float x, float seed) {
  float height = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    float n = noise1D(x, seed + float(i) * 3.7);
    height += amplitude * (1.0 - abs(2.0 * n - 1.0));
    x = x * 2.1 + 7.3;
    amplitude *= 0.5;
  }
  return height;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  vec2 sunPos = vec2(0.3, 0.2);
  float sunDist = length(p - sunPos);
  vec3 col = mix(ember * 0.6, dark, smoothstep(0.0, 0.5, p.y));
  col += accent * 0.4 * exp(-sunDist * 3.0);
  col += highlight * smoothstep(0.075, 0.065, sunDist);
  col += highlight * 0.3 * exp(-sunDist * 12.0);

  vec3 haze = ember * 0.55 + accent * 0.2;
  float edge = 1.5 / iResolution.y;
  for (int i = 0; i < 5; i++) {
    float layer = float(i);
    float depth = 1.0 - layer / 4.0;
    float x = p.x * (1.5 + layer * 0.6) + iTime * (0.01 + layer * 0.015) + layer * 11.0;
    float baseline = 0.12 - layer * 0.12;
    float height = baseline + (0.15 + layer * 0.06) * ridge(x, layer * 5.0);
    float mask = smoothstep(-edge, edge, height - p.y);
    vec3 layerCol = mix(dark, haze, depth * 0.8);
    layerCol += accent * 0.3 * depth * exp(-sunDist * 3.0);
    col = mix(col, layerCol, mask);
  }

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
