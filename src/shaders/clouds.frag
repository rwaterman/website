// Clouds — drifting cumulus. Two fbm layers stack into a density field with a
// horizon gradient, then the same field is re-sampled a step toward the sun:
// the difference lights each puff from one side over a warm ember sky.
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

float cloudDensity(vec2 p) {
  float drift = iTime * 0.05;
  vec2 q = p * vec2(1.0, 1.7) + vec2(drift, 0.0);
  float shape = fbm(q * 1.6);
  float detail = fbm(q * 4.5 + vec2(drift * 1.5, 0.3));
  float horizon = smoothstep(-0.5, 0.3, p.y);
  float density = shape * 0.8 + detail * 0.3 - 0.62 + 0.28 * horizon;
  return clamp(density * 3.0, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  vec2 sunPos = vec2(-0.55, -0.3);
  float sunDist = length(p - sunPos);
  vec3 col = mix(ember * 0.5, dark, smoothstep(-0.5, 0.5, p.y));
  col += accent * 0.5 * exp(-sunDist * 2.5);
  col += highlight * 0.6 * exp(-sunDist * 14.0);

  float density = cloudDensity(p);
  vec2 toSun = normalize(vec2(-0.75, -0.5)) * 0.03;
  float towardSun = cloudDensity(p + toSun);
  float lit = clamp(0.45 + (density - towardSun) * 5.0, 0.0, 1.0);
  vec3 cloudCol = mix(dark + ember * 0.35, mix(accent, highlight, lit), lit);
  cloudCol += highlight * 0.35 * lit * exp(-sunDist * 1.5);
  col = mix(col, cloudCol, density);

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
