// Isocubes — a 2D isometric column field on a pointy-top hex tiling, no raymarching.
// Each hex is a cube with three flat-shaded faces; columns bob on a sine of position and time,
// and the front-most column covering a pixel wins a five-sample vertical depth test.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 hexCenter(vec2 p) {
  vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  return dot(a, a) < dot(b, b) ? p - a : p - b;
}

float columnHeight(vec2 center) {
  return 0.25 + 0.22 * sin(iTime * 1.6 + center.x * 0.8 + center.y * 0.5 + hash21(center) * 1.5);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec2 p = uv * 6.5 + vec2(iTime * 0.12, iTime * 0.08);
  vec3 ember = vec3(0.70, 0.15, 0.12);

  vec3 col = vec3(0.03, 0.015, 0.02);
  for (int i = 4; i >= 0; i--) {
    vec2 center = hexCenter(p - vec2(0.0, float(i) * 0.125));
    vec2 local = p - center;
    float h = columnHeight(center);
    float margin = 1.0 - 1.7320508 * abs(local.x);
    if (abs(local.x) > 0.5 || local.y < -margin || local.y > h + margin) continue;
    float topY = local.y - h;
    bool isTop = topY > 0.57735 * abs(local.x);
    float lift = 0.75 + 0.7 * h;
    if (isTop) {
      col = vec3(0.94, 0.41, 0.36) * lift;
    } else if (local.x < 0.0) {
      col = ember * lift;
    } else {
      col = ember * 0.4 * lift;
    }
    float edge = abs(topY - 0.57735 * abs(local.x));
    if (!isTop) edge = min(edge, abs(local.x));
    edge = min(edge, 0.5 - abs(local.x));
    edge = min(edge, h + margin - local.y);
    col *= 0.5 + 0.5 * smoothstep(0.0, 0.04, edge);
    break;
  }
  col *= 1.0 - 0.5 * dot(uv, uv);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
