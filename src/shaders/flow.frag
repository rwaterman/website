// Flow — streamlines through a curl field. The velocity is the analytic curl
// of a drifting sine potential, so it never diverges; each grid cell seeds a
// short streamline that is stepped forward and drawn as a traveling ember dash.
float hash21(vec2 p) {
  p = fract(mod(p, 289.0) * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Curl of psi = sin(ax) cos(ay) + 0.5 sin(bx) sin(by): (dpsi/dy, -dpsi/dx).
vec2 flowField(vec2 p, float t) {
  float ax = 1.7 * p.x + 0.3 * t;
  float ay = 2.1 * p.y - 0.2 * t;
  float bx = 3.9 * p.x - 0.5 * t + 1.0;
  float by = 3.3 * p.y + 0.4 * t;
  vec2 v = vec2(-2.1 * sin(ax) * sin(ay), -1.7 * cos(ax) * cos(ay));
  v += vec2(1.65 * sin(bx) * cos(by), -1.95 * cos(bx) * sin(by));
  return v;
}

float segmentDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  vec2 ap = p - a;
  float h = clamp(dot(ap, ab) / max(dot(ab, ab), 0.000001), 0.0, 1.0);
  return length(ap - ab * h);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  float t = iTime * 0.6;
  float cellSize = 0.11;
  float stepLen = cellSize * 0.07;
  float lineWidth = 1.2 / iResolution.y;
  vec2 cell = floor(p / cellSize);
  float glow = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      vec2 pos = (id + vec2(hash21(id), hash21(id + 5.3))) * cellSize;
      float phase = fract(iTime * 0.2 + hash21(id + 9.1));
      float line = 0.0;
      for (int i = 0; i < 14; i++) {
        vec2 v = flowField(pos, t);
        vec2 next = pos + v / (length(v) + 0.1) * stepLen;
        float along = (float(i) + 0.5) / 14.0;
        float dash = smoothstep(0.4, 0.0, abs(along - phase));
        line = max(line, smoothstep(lineWidth * 2.0, 0.0, segmentDist(p, pos, next)) * dash);
        pos = next;
      }
      glow += line;
    }
  }

  vec2 here = flowField(p, t);
  vec3 col = dark + ember * 0.03 * length(here);
  col += ember * glow * 1.3 + accent * glow * glow * 0.5;
  col += highlight * smoothstep(1.5, 2.5, glow) * 0.3;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
