// Sierpinski — the gasket by kaleidoscopic folding. Each pass reflects the plane
// into the wedge nearest the apex and doubles it about that vertex; every level's
// triangle outline is accumulated as glow, so the whole hierarchy shows at once.
float sdTriangle(vec2 p) {
  float bottom = -p.y - 0.5;
  float right = dot(p, vec2(0.8660254, 0.5)) - 0.5;
  float left = dot(p, vec2(-0.8660254, 0.5)) - 0.5;
  return max(bottom, max(right, left));
}

mat2 rotate(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  float zoom = 2.3 - 0.3 * sin(iTime * 0.2);
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * zoom;
  p = rotate(iTime * 0.1) * p;
  float pixel = zoom / iResolution.y;
  vec2 mirrorA = vec2(0.5, 0.8660254);
  vec2 mirrorB = vec2(-0.5, 0.8660254);
  vec2 apex = vec2(0.0, 1.0);

  float scale = 1.0;
  float edges = 0.0;
  float d = 0.0;
  for (int i = 0; i < 8; i++) {
    d = sdTriangle(p) / scale;
    float pulse = 0.55 + 0.45 * sin(iTime * 1.2 - float(i) * 1.1);
    edges += smoothstep(pixel * 2.0, 0.0, abs(d)) * pulse;
    if (scale * 14.0 > iResolution.y) break;
    p -= 2.0 * min(0.0, dot(p, mirrorA)) * mirrorA;
    p -= 2.0 * min(0.0, dot(p, mirrorB)) * mirrorB;
    p = p * 2.0 - apex;
    scale *= 2.0;
  }

  float fill = smoothstep(pixel, -pixel, d);
  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * fill * 0.45;
  col += vec3(0.94, 0.41, 0.36) * edges * 0.7;
  col += vec3(1.0, 0.9, 0.85) * edges * edges * 0.12;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
