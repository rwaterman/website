// Op-art — a warped dartboard. Concentric rings crossed with angular sectors make a
// polar checkerboard; a lens drifting around the frame pushes and pulls the grid
// beneath it while the rings creep outward. Screen-space derivatives anti-alias.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.0;
  float t = iTime;
  vec2 lensCenter = vec2(0.7 * sin(t * 0.23), 0.4 * cos(t * 0.31));
  vec2 delta = p - lensCenter;
  float lens = exp(-dot(delta, delta) * 4.0);
  float bulge = 0.45 * sin(t * 0.45);
  vec2 q = p + delta * bulge * lens;

  float r = length(q);
  float theta = atan(q.y, q.x);
  float checker = sin(r * 26.0 - t * 0.5) * sin(theta * 12.0);
  float aa = max(fwidth(checker), 1e-4);
  float v = smoothstep(-aa, aa, checker);

  vec3 light = mix(vec3(1.0, 0.9, 0.85), vec3(0.94, 0.41, 0.36), lens * 0.85) * 2.4;
  vec3 dark = mix(vec3(0.03, 0.015, 0.02), vec3(0.70, 0.15, 0.12) * 0.35, lens);
  vec3 col = mix(dark, light, v);
  col *= 0.75 + 0.25 * smoothstep(1.3, 0.3, r);

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
