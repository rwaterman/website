// Hex — a hexagonal grid. Every cell pulses on its own phase, offset by its
// distance from the center so waves ripple outward; edges glow.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hexDist(vec2 p) {
  p = abs(p);
  return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x);
}

// Returns (distance to edge, cell id).
vec3 hexCell(vec2 uv) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h;
  vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec3(0.5 - hexDist(gv), uv - gv);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 8.0;
  vec3 cell = hexCell(p);
  float h = hash21(cell.yz);
  float pulse = 0.5 + 0.5 * sin(iTime * 1.5 + h * 6.2831 - length(cell.yz) * 0.6);
  float edge = smoothstep(0.06, 0.0, cell.x);

  vec3 col = vec3(0.03, 0.015, 0.02) + vec3(0.70, 0.15, 0.12) * pulse * pulse * 0.7;
  col += vec3(0.94, 0.41, 0.36) * edge * 0.8;
  col += vec3(1.0, 0.9, 0.85) * smoothstep(0.9, 1.0, pulse) * smoothstep(0.0, 0.2, cell.x) * 0.3;
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
