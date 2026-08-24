// Warp — a starfield streaking past the camera. The screen is mapped to
// (angle, log radius); each layer is a hashed grid of streaks sliding outward.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float angle = atan(p.y, p.x);
  float r = length(p);
  vec3 col = vec3(0.02, 0.01, 0.015);

  for (int layer = 0; layer < 6; layer++) {
    float fl = float(layer);
    vec2 uv = vec2(angle / 6.2831 * 24.0, log(max(r, 0.001)) * 5.0 - iTime * (1.5 + fl * 0.4) - fl * 7.3);
    vec2 cell = floor(uv);
    vec2 f = fract(uv) - 0.5;
    float h = hash21(cell + fl * 13.7);
    float present = step(h, 0.14);
    float sx = (hash21(cell + 3.1 + fl) - 0.5) * 0.6;
    float streak = smoothstep(0.08, 0.0, abs(f.x - sx)) * smoothstep(0.5, 0.0, abs(f.y));
    vec3 tint = mix(vec3(0.94, 0.41, 0.36), vec3(1.0, 0.9, 0.85), h * 6.0);
    col += present * streak * tint * smoothstep(0.0, 0.5, r) * 0.9;
  }

  col += vec3(0.70, 0.15, 0.12) * 0.03 / (r + 0.05);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
