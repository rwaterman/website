// Cells — animated Voronoi. One feature point jitters inside each grid square;
// distance to the nearest and second-nearest point gives cell shading and glowing borders.
vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 6.0;
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec2 nearest = vec2(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 h = hash22(cell + offset);
      vec2 point = offset + 0.5 + 0.4 * sin(iTime * 0.8 + 6.2831 * h);
      float d = length(point - f);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        nearest = h;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float border = d2 - d1;
  vec3 base = mix(vec3(0.04, 0.02, 0.03), vec3(0.70, 0.15, 0.12), nearest.x * 0.6);
  vec3 col = base * (1.0 - d1 * 0.5);
  col += vec3(0.94, 0.41, 0.36) * smoothstep(0.08, 0.0, border) * 0.9;
  col += vec3(1.0, 0.9, 0.85) * smoothstep(0.06, 0.0, d1) * 0.5;
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
