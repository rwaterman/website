// Iris — a procedural eye. Radial fibres from fbm that wraps seamlessly around
// the angle, colour bands from ember out to gold, a pupil breathing on a slow
// sine (it dilates and glances toward the mouse when pressed), limbal ring, glint.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Value noise whose lattice wraps in x every `period`, so it tiles around the angle.
float noise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float x0 = mod(i.x, period);
  float x1 = mod(i.x + 1.0, period);
  return mix(
    mix(hash21(vec2(x0, i.y)), hash21(vec2(x1, i.y)), u.x),
    mix(hash21(vec2(x0, i.y + 1.0)), hash21(vec2(x1, i.y + 1.0)), u.x),
    u.y);
}

float fbm(vec2 p, float period) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p, period);
    p = p * 2.0 + 7.3;
    period *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.2;
  float dilate = 0.0;
  if (iMouse.z > 0.0) {
    vec2 m = (iMouse.xy - 0.5 * iResolution.xy) / iResolution.y * 2.2;
    p -= m * 0.12;
    dilate = 0.08;
  }
  float r = length(p);
  float ang = (atan(p.y, p.x) / 6.28318530718 + 0.5) * 48.0 + iTime * 0.15;

  float fibre = fbm(vec2(ang, r * 2.5), 48.0);
  float fine = noise(vec2(ang * 4.0 + 3.0, r * 9.0), 192.0);
  float pupilR = mix(0.24, 0.36, 0.5 + 0.5 * sin(iTime * 0.5)) + dilate;
  float rw = r + 0.03 * (fibre - 0.5);
  float pupil = smoothstep(pupilR, pupilR + 0.025, rw);
  float band = smoothstep(pupilR, 1.0, r);

  vec3 col = mix(vec3(0.70, 0.15, 0.12), vec3(1.0, 0.75, 0.3), band * band);
  col = mix(col, vec3(0.94, 0.41, 0.36), smoothstep(0.2, 0.5, band) * (1.0 - smoothstep(0.5, 0.85, band)));
  col *= 0.35 + 1.3 * fibre * fibre + 0.5 * fine;
  col *= 0.75 + 0.25 * sin(r * 26.0 + fibre * 7.0);
  col += vec3(0.94, 0.41, 0.36) * 0.5 * smoothstep(pupilR + 0.02, pupilR + 0.1, rw) * (1.0 - smoothstep(pupilR + 0.1, pupilR + 0.28, rw));
  col *= pupil * smoothstep(1.0, 0.8, r);
  vec3 outside = vec3(0.03, 0.015, 0.02) + vec3(0.70, 0.15, 0.12) * 0.08 * (1.0 - smoothstep(1.0, 1.7, r));
  col = mix(outside, col, smoothstep(1.03, 0.99, r));

  vec2 glint = vec2(-0.36, 0.42) + 0.03 * vec2(sin(iTime * 0.7), cos(iTime * 0.5));
  col += vec3(1.0, 0.9, 0.85) * smoothstep(0.22, 0.0, length(p - glint));
  col += vec3(1.0, 0.9, 0.85) * 0.35 * smoothstep(0.1, 0.0, length(p - vec2(0.3, -0.28)));

  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
