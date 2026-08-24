// Julia — the quadratic Julia set for a constant that drifts around the
// Mandelbrot cardioid. Outside: smooth escape time. Inside: an orbit trap.
const int STEPS = 120;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 z = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 3.0;
  float t = iTime * 0.15;
  vec2 c = vec2(-0.745 + 0.11 * cos(t), 0.186 + 0.11 * sin(t * 1.3));
  float trap = 1e9;
  int i = 0;
  for (; i < STEPS; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    trap = min(trap, abs(z.y));
    if (dot(z, z) > 64.0) break;
  }

  vec3 col;
  if (i >= STEPS) {
    col = vec3(0.02, 0.01, 0.015) + vec3(0.70, 0.15, 0.12) * exp(-trap * 6.0);
  } else {
    float s = (float(i) - log2(max(log2(dot(z, z)), 1.0))) / 40.0;
    col = vec3(0.32, 0.10, 0.08) + vec3(0.60, 0.28, 0.18) * cos(6.2831 * (s * 1.5 + vec3(0.0, 0.08, 0.14)));
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
