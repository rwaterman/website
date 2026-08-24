// Truchet — quarter-circle arcs on a grid, each tile mirrored by a hash, so
// random tiles join into endless loops. Light flows along the arcs.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 7.0 + vec2(iTime * 0.3, 0.0);
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float h = hash21(cell);
  if (h < 0.5) f.x = 1.0 - f.x;

  float d = min(abs(length(f) - 0.5), abs(length(f - 1.0) - 0.5));
  float line = smoothstep(0.08, 0.02, d);
  float glow = 0.02 / (d + 0.05);
  float flow = 0.5 + 0.5 * sin((length(f) + length(f - 1.0)) * 6.0 - iTime * 3.0 + h * 6.2831);

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * glow * 0.6;
  col += mix(vec3(0.94, 0.41, 0.36), vec3(1.0, 0.9, 0.85), flow) * line;
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
