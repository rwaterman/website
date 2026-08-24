// Waves — a stack of sine curves with drifting phase and amplitude, each drawn
// as a thin glowing line. Reads like an oscilloscope left running.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 col = vec3(0.03, 0.015, 0.02);

  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float baseline = -0.4 + fi * 0.07;
    float amplitude = 0.05 + 0.03 * sin(iTime * 0.7 + fi);
    float wave = baseline
      + amplitude * sin(p.x * (4.0 + fi * 0.5) + iTime * (1.0 + fi * 0.1) + fi)
      + 0.02 * sin(p.x * 20.0 - iTime * 3.0 + fi * 2.0);
    float d = abs(p.y - wave);
    float line = 0.004 / (d + 0.004);
    col += mix(vec3(0.70, 0.15, 0.12), vec3(0.94, 0.41, 0.36), fi / 11.0) * line * 0.6;
  }

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
