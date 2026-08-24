// Ember — domain-warped fractal noise.
// Value noise stacked into fbm, then fed back into itself twice (Quilez's warp),
// shaded with a cosine palette in the site's ember reds.
#define TAU 6.28318530718

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
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = rotate * p * 2.0 + 10.0;
    amplitude *= 0.5;
  }
  return value;
}

vec3 palette(float t) {
  return vec3(0.32, 0.10, 0.08) + vec3(0.60, 0.26, 0.16) * cos(TAU * (0.8 * t + vec3(0.0, 0.08, 0.12)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.5;
  float t = iTime * 0.15;

  vec2 q = vec2(fbm(p + t), fbm(p + vec2(5.2, 1.3) - t));
  vec2 r = vec2(
    fbm(p + 4.0 * q + vec2(1.7, 9.2) + 0.3 * t),
    fbm(p + 4.0 * q + vec2(8.3, 2.8) - 0.2 * t));
  float f = fbm(p + 4.0 * r);

  vec3 col = palette(f + 0.2 * length(q));
  col *= 0.4 + 0.9 * f * f;
  col += vec3(0.94, 0.41, 0.36) * pow(clamp(length(r) - 0.6, 0.0, 1.0), 2.0) * 0.6;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
