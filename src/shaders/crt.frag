// Test card — a CRT test pattern in ember: colour bars, gradient bands, a
// grid, circle and crosshair, then barrel distortion, curved scanlines, RGB
// subpixel stripes, a rolling dark bar, vignette and per-frame noise flicker.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 col = mix(vec3(0.03, 0.015, 0.02), vec3(0.70, 0.15, 0.12), smoothstep(0.0, 0.35, t));
  col = mix(col, vec3(0.94, 0.41, 0.36), smoothstep(0.35, 0.7, t));
  return mix(col, vec3(1.0, 0.9, 0.85), smoothstep(0.7, 1.0, t));
}

vec3 testCard(vec2 uv, float aspect) {
  vec3 col;
  if (uv.y > 0.66) {
    float bar = floor(uv.x * 8.0);
    col = ramp(fract(bar * 0.618 + iTime * 0.04));
  } else if (uv.y > 0.42) {
    float t = uv.x < 0.5 ? uv.x * 2.0 : floor(uv.x * 16.0 - 8.0) / 7.0;
    col = ramp(t);
  } else {
    vec2 grid = abs(fract(uv * vec2(aspect, 1.0) * 6.0) - 0.5);
    float line = smoothstep(0.46, 0.5, max(grid.x, grid.y));
    col = vec3(0.03, 0.015, 0.02) + vec3(0.70, 0.15, 0.12) * line * 0.8;
  }
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float ring = smoothstep(0.012, 0.004, abs(r - 0.4));
  float crosshair = smoothstep(0.008, 0.002, min(abs(p.x), abs(p.y))) * step(r, 0.4);
  return mix(col, vec3(1.0, 0.9, 0.85), max(ring, crosshair) * 0.9);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float aspect = iResolution.x / iResolution.y;
  vec2 c = uv * 2.0 - 1.0;
  float r2 = dot(c, c);
  c *= 1.0 + 0.1 * r2;
  vec2 warped = c * 0.5 + 0.5;
  vec2 edge = smoothstep(vec2(0.0), vec2(0.008), warped) * smoothstep(vec2(0.0), vec2(0.008), 1.0 - warped);
  float inside = edge.x * edge.y;

  vec3 col = testCard(warped, aspect);
  float scan = 0.8 + 0.2 * sin(warped.y * iResolution.y * 2.0);
  float sub = mod(fragCoord.x, 3.0);
  vec3 mask = vec3(step(sub, 1.0), step(1.0, sub) * step(sub, 2.0), step(2.0, sub)) * 0.5 + 0.65;
  float roll = 1.0 - smoothstep(0.0, 0.1, abs(fract(warped.y + iTime * 0.08) - 0.5));
  float grain = 0.85 + 0.3 * hash21(fragCoord + fract(iTime * 7.0) * 100.0);
  float flicker = 0.94 + 0.08 * hash21(vec2(mod(floor(iTime * 24.0), 256.0), 3.0));
  float vig = 16.0 * warped.x * warped.y * (1.0 - warped.x) * (1.0 - warped.y);
  vig = pow(clamp(vig, 0.0, 1.0), 0.35);

  col *= scan * mask * (1.0 - 0.35 * roll) * grain * flicker * vig * inside;
  col += vec3(0.70, 0.15, 0.12) * 0.03 * (1.0 - inside);
  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
