// Lissajous — four curves x = sin(a s + phi), y = sin(b s) traced like a phosphor
// scope: 48 samples trail behind a moving head, the distance to each segment adds
// glow, and the weight fades toward the tail so the trace has persistence.
float segmentDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// k = (a, b, phi, amplitude)
vec2 curvePoint(float s, vec4 k) {
  return k.w * vec2(1.45 * sin(k.x * s + k.z), 0.85 * sin(k.y * s));
}

float trace(vec2 p, vec4 k, float head, float span, float pixel) {
  float glow = 0.0;
  vec2 prev = curvePoint(head, k);
  for (int i = 1; i <= 48; i++) {
    float f = float(i) / 48.0;
    vec2 next = curvePoint(head - f * span, k);
    float d = segmentDist(p, prev, next);
    float weight = (1.0 - f) * (1.0 - f);
    glow += weight * (smoothstep(pixel * 2.0, 0.0, d) + 0.5 * 0.0015 / (d * d + 0.0015));
    prev = next;
  }
  vec2 headPoint = curvePoint(head, k);
  glow += 0.004 / (dot(p - headPoint, p - headPoint) + 0.004);
  return glow;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.2;
  float pixel = 2.2 / iResolution.y;
  float t = iTime * 0.45;

  float traceA = trace(p, vec4(3.0, 2.0, 1.5708, 1.0), t, 1.3, pixel);
  float traceB = trace(p, vec4(1.0, 3.0, 0.7854, 0.8), t * 0.85 + 2.0, 2.2, pixel);
  float traceC = trace(p, vec4(5.0, 4.0, 0.0, 0.92), t * 0.6 + 4.0, 0.8, pixel);
  float traceD = trace(p, vec4(2.0, 3.0, 0.5, 0.6), t * 0.7 + 1.0, 3.0, pixel);

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * traceA * 0.9;
  col += vec3(0.94, 0.41, 0.36) * traceB * 0.8;
  col += vec3(0.94, 0.41, 0.36) * traceC * 0.45;
  col += vec3(0.70, 0.15, 0.12) * traceD * 0.7;
  col += vec3(1.0, 0.9, 0.85) * (traceA + traceB + traceC + traceD) * 0.12;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
