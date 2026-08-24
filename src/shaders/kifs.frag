// KIFS — a kaleidoscopic iterated function system. Every pass mirrors the plane
// across both axes, shifts it off-center, then rotates and scales it; orbit traps
// (closest approach to the origin and to the x-axis) drive the coloring.
mat2 rotate(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.4;
  float t = iTime * 0.15;
  float mouseTurn = iMouse.z > 0.0 ? (iMouse.x / iResolution.x - 0.5) * 3.0 : 0.0;
  mat2 twist = rotate(0.55 + 0.3 * sin(t * 0.9) + mouseTurn);
  vec2 offset = vec2(0.9 + 0.15 * sin(t * 1.3), 0.35 + 0.1 * cos(t * 0.7));
  p = rotate(t) * p;

  float trapOrigin = 1e5;
  float trapAxis = 1e5;
  for (int i = 0; i < 8; i++) {
    p = abs(p) - offset;
    p = twist * p;
    p *= 1.35;
    trapOrigin = min(trapOrigin, dot(p, p));
    trapAxis = min(trapAxis, abs(p.y));
  }

  float glow = exp(-trapOrigin * 2.5);
  float lines = exp(-trapAxis * 9.0);
  float band = 0.5 + 0.5 * cos(trapOrigin * 3.0 - iTime * 0.6);

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * band * 0.55;
  col += vec3(0.94, 0.41, 0.36) * glow * 0.9;
  col += vec3(0.55, 0.35, 0.95) * lines * 0.6;
  col += vec3(1.0, 0.9, 0.85) * glow * lines * 0.6;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
