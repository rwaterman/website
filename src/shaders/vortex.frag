// Vortex — a whirlpool of fbm. Polar coordinates whose angle is twisted by
// log(r) and time wind the noise into spiral arms; spinning a log spiral reads
// as inward flow, and everything brightens toward a pulsing white core.
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

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  float t = iTime * 0.25;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float twisted = angle + 3.0 * log(r + 0.03) - t;
  vec2 q = vec2(cos(twisted), sin(twisted)) * (1.0 + r * 3.0);

  float swirl = fbm(q * 1.5);
  float detail = fbm(q * 4.0 + 7.0);
  float arms = 0.5 + 0.5 * sin(3.0 * twisted + swirl * 5.0 + t * 2.0);
  float field = swirl * 0.8 + detail * 0.4;
  float energy = field * (0.4 + 0.6 * arms);
  float pull = 1.0 / (1.0 + r * 6.0);

  vec3 col = dark;
  col += ember * energy * energy * (0.8 + pull * 3.0);
  col += accent * energy * energy * energy * pull * 3.0;
  col += highlight * smoothstep(0.7, 1.0, energy * (0.6 + pull)) * 0.5;
  col += highlight * exp(-r * 14.0) * (0.8 + 0.3 * sin(iTime * 2.0));

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
