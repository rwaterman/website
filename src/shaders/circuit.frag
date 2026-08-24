// Circuit — a printed circuit board. Each grid cell picks a hashed copper
// route (straight, a 45-degree jog to a neighbouring edge, or a dead end on a
// pad); pads sit on hashed corners and light pulses travel along the traces.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float h = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
  return length(p - a - ab * h);
}

// Returns (distance to the trace, position along it 0..1) for the cell's route.
vec2 route(vec2 p, float variant) {
  if (variant < 1.0) return vec2(abs(p.y), p.x + 0.5);
  if (variant < 2.0) return vec2(abs(p.x), p.y + 0.5);
  if (variant < 6.0) {
    vec2 q = p * vec2(variant < 4.0 ? 1.0 : -1.0, mod(variant, 2.0) < 1.0 ? 1.0 : -1.0);
    float d = min(segDist(q, vec2(-0.5, 0.0), vec2(-0.2, 0.0)), segDist(q, vec2(-0.2, 0.0), vec2(0.0, 0.2)));
    d = min(d, segDist(q, vec2(0.0, 0.2), vec2(0.0, 0.5)));
    return vec2(d, clamp(q.x + 0.5 + q.y, 0.0, 1.0));
  }
  vec2 r = variant < 7.0 ? p : p.yx;
  return vec2(segDist(r, vec2(-0.5, 0.0), vec2(0.0, 0.0)), (r.x + 0.5) * 2.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 7.0;
  p.x += iTime * 0.15;
  vec2 id = floor(p);
  vec2 f = fract(p) - 0.5;
  float variant = floor(hash21(id) * 8.0);
  vec2 tr = route(f, variant);
  float trace = smoothstep(0.07, 0.04, tr.x);
  float traceEdge = smoothstep(0.1, 0.07, tr.x) - trace;

  vec2 cornerId = id + step(0.0, f);
  float padOn = step(0.7, hash21(cornerId + 0.37));
  float dc = length(abs(f) - 0.5);
  float pad = padOn * smoothstep(0.02, 0.0, abs(dc - 0.1) - 0.05);
  float centerPad = step(6.0, variant) * smoothstep(0.02, 0.0, abs(length(f) - 0.09) - 0.045);

  float speed = 0.4 + 0.6 * hash21(id + 0.11);
  float spot = fract(iTime * speed + hash21(id + 0.23));
  float pulse = step(0.55, hash21(id + 0.31)) * smoothstep(0.15, 0.0, abs(tr.y - spot)) * trace;

  float weave = 0.5 + 0.5 * sin(p.x * 60.0) * sin(p.y * 60.0);
  vec3 col = vec3(0.03, 0.015, 0.02) + vec3(0.70, 0.15, 0.12) * (0.06 + 0.05 * weave);
  col += vec3(0.70, 0.15, 0.12) * 0.15 * traceEdge;
  col += vec3(0.94, 0.41, 0.36) * 0.55 * trace;
  col += vec3(0.94, 0.41, 0.36) * 0.7 * max(pad, centerPad);
  col += vec3(1.0, 0.9, 0.85) * pulse * 1.5;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
