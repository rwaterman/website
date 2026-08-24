// Caustics — light on a pool floor. Three animated Voronoi layers at different
// scales, each reduced to its F2 − F1 cell edges so only the thin bright
// ridges survive, summed additively in teal over an ember-tinted floor.
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float voronoiEdge(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float first = 8.0;
  float second = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 h = hash22(cell + offset);
      vec2 point = offset + 0.5 + 0.4 * sin(t + 6.2831 * h);
      float d = length(point - f);
      if (d < first) {
        second = first;
        first = d;
      } else if (d < second) {
        second = d;
      }
    }
  }
  return second - first;
}

float ridge(vec2 p, float t) {
  float edge = voronoiEdge(p, t);
  float r = smoothstep(0.15, 0.0, edge);
  return r * r;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 teal = vec3(0.2, 0.8, 0.75);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  float t = iTime * 0.5;
  float light = ridge(p * 4.0 + vec2(t * 0.15, 0.0), t);
  light += 0.7 * ridge(p * 6.5 + vec2(3.0, -t * 0.1), t * 1.3 + 2.0);
  light += 0.5 * ridge(p * 10.0 + vec2(7.0 + t * 0.08, 7.0), t * 0.8 + 4.0);

  float floorShade = 0.7 + 0.3 * sin(p.x * 2.0 + p.y * 3.0 + t * 0.4);
  vec3 col = dark + ember * 0.18 * floorShade / (1.0 + 0.5 * dot(p, p));
  col += teal * light * 0.8;
  col += highlight * light * light * 0.4;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
