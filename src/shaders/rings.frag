// Interference — three ring sources wander around; their waves add and cancel
// into a moiré that never repeats.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float sum = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = 0.45 * vec2(cos(iTime * 0.3 + fi * 2.094), sin(iTime * 0.23 + fi * 2.094));
    sum += sin(length(p - c) * 60.0 - iTime * 2.0);
  }
  float v = sum / 3.0;

  vec3 col = vec3(0.32, 0.10, 0.08) + vec3(0.60, 0.26, 0.16) * cos(6.2831 * (v * 0.5 + vec3(0.0, 0.08, 0.12)));
  col *= 0.35 + 0.65 * smoothstep(-0.2, 1.0, v);
  col += vec3(1.0, 0.9, 0.85) * smoothstep(0.85, 1.0, v) * 0.4;
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
