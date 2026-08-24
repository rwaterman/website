// Galaxy — a face-on spiral. fbm is sampled through coordinates whose angle is
// offset by log(r), so the noise winds into logarithmic arms with dust lanes;
// a hot gold core sits in the middle and a hashed grid scatters point stars.
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
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.0 + 10.0;
    amplitude *= 0.5;
  }
  return value;
}

float starField(vec2 uv, float scale, float chance) {
  vec2 grid = uv * scale;
  vec2 id = floor(grid);
  float h = hash21(id);
  vec2 offset = (vec2(hash21(id + 0.7), hash21(id + 1.9)) - 0.5) * 0.5;
  float d = length(fract(grid) - 0.5 - offset) / scale;
  return smoothstep(1.8 / iResolution.y, 0.0, d) * step(1.0 - chance, h) * (0.4 + 0.6 * h);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 gold = vec3(1.0, 0.75, 0.3);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  float t = iTime * 0.04;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float spiral = angle - 2.6 * log(max(r, 0.001)) + t * (1.0 + 1.5 * exp(-r * 4.0));
  vec2 q = r * vec2(cos(spiral), sin(spiral));

  float arms = 0.5 + 0.5 * cos(2.0 * spiral);
  arms = arms * arms * arms;
  float clumps = fbm(q * 5.0 + 3.0);
  float dust = smoothstep(0.55, 0.8, fbm(q * 8.0 - 4.0)) * smoothstep(0.08, 0.25, r);
  float disc = exp(-r * 3.5);
  float density = disc * (0.15 + arms * (0.5 + 1.2 * clumps)) * (1.0 - 0.7 * dust);
  float core = 1.2 * exp(-r * 10.0) + 2.5 * exp(-r * 35.0);

  vec3 col = dark;
  col += ember * density * 1.6;
  col += accent * density * density * 2.0;
  col += mix(gold, highlight, exp(-r * 20.0)) * core;

  mat2 spin = mat2(cos(t), sin(t), -sin(t), cos(t));
  col += highlight * starField(spin * p, 90.0, 0.1 + 0.5 * density) * (0.5 + density);
  col += highlight * starField(p, 30.0, 0.05) * 0.6;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
