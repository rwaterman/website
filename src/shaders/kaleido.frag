// Kaleidoscope — the plane folded into eight mirrored wedges, then fractal
// noise painted through the folded coordinates so every wedge matches its neighbors.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
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
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.1 + 7.0;
    amplitude *= 0.5;
  }
  return value;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(p);
  const float WEDGES = 8.0;
  float a = abs(mod(atan(p.y, p.x), 6.2831 / WEDGES) - 3.14159 / WEDGES);
  vec2 q = vec2(cos(a), sin(a)) * r * 4.0;

  float n = fbm(q + vec2(iTime * 0.2, -iTime * 0.15));
  float n2 = fbm(q * 2.0 - iTime * 0.1);
  vec3 col = vec3(0.32, 0.10, 0.08) + vec3(0.60, 0.26, 0.16) * cos(6.2831 * (n * 1.2 + vec3(0.0, 0.08, 0.12)));
  col *= 0.3 + n2;
  col *= smoothstep(1.0, 0.3, r);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
