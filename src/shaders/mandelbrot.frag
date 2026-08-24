// Mandelbrot — a breathing zoom into the seahorse valley at (-0.745, 0.186).
// Escape time is smoothed with the log-log of the bailout radius so bands blend,
// then fed through a cosine palette in ember reds; the interior stays dark.
const int MAX_ITER = 100;

vec3 palette(float t) {
  return vec3(0.42, 0.16, 0.13) + vec3(0.40, 0.15, 0.12) * cos(6.2831853 * (t + vec3(0.0, 0.10, 0.18)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float depth = 11.0 * (0.5 - 0.5 * cos(iTime * 0.05));
  float scale = 2.6 * exp2(-depth);
  vec2 c = vec2(-0.745, 0.186) + p * scale;

  vec2 z = vec2(0.0);
  float smoothIter = 0.0;
  bool escaped = false;
  for (int i = 0; i < MAX_ITER; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    float r2 = dot(z, z);
    if (r2 > 256.0) {
      smoothIter = float(i) + 1.0 - log2(log2(r2) * 0.5);
      escaped = true;
      break;
    }
  }

  vec3 col = vec3(0.03, 0.015, 0.02);
  if (escaped) {
    float t = sqrt(max(smoothIter, 0.0) / float(MAX_ITER));
    col = palette(t * 3.0 - iTime * 0.04) * (0.25 + 0.75 * t);
    col += vec3(1.0, 0.9, 0.85) * t * t * t * t * 0.5;
  }

  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
