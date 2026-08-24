// Gears — three meshing spur gears as 2D SDFs. Each is a circle whose radius follows
// a squared-off cosine of the angle for teeth, minus a hub hole and a groove; they
// share a tooth pitch and turn at inverse ratios with phases solved so teeth interleave.
const float PI = 3.14159265;

float gearShape(vec2 q, float radius, float teeth, float phase) {
  float r = length(q);
  float theta = atan(q.y, q.x);
  float tooth = smoothstep(-0.45, 0.45, 1.5 * cos(teeth * (theta - phase)));
  float d = r - (radius - 0.045 + 0.09 * tooth);
  d = max(d, 0.28 * radius - r);
  return max(d, -(abs(r - 0.62 * radius) - 0.012));
}

float scene(vec2 q, float angle) {
  float teethA = 12.0;
  float teethB = 8.0;
  float teethC = 18.0;
  float radiusA = 0.42;
  float pitch = radiusA / teethA;
  float radiusB = pitch * teethB;
  float radiusC = pitch * teethC;
  float dirB = 2.6;
  float dirC = -0.5;
  vec2 centerB = (radiusA + radiusB) * vec2(cos(dirB), sin(dirB));
  vec2 centerC = (radiusA + radiusC) * vec2(cos(dirC), sin(dirC));
  float phaseB = (dirB * (teethA + teethB) + (teethB - 1.0) * PI) / teethB - angle * teethA / teethB;
  float phaseC = (dirC * (teethA + teethC) + (teethC - 1.0) * PI) / teethC - angle * teethA / teethC;
  float d = gearShape(q, radiusA, teethA, angle);
  d = min(d, gearShape(q - centerB, radiusB, teethB, phaseB));
  d = min(d, gearShape(q - centerC, radiusC, teethC, phaseC));
  return d;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.2;
  vec2 q = p + vec2(0.33, -0.25);
  float angle = iTime * 0.4;
  float eps = 0.006;
  float d = scene(q, angle);
  vec2 grad = vec2(scene(q + vec2(eps, 0.0), angle) - d, scene(q + vec2(0.0, eps), angle) - d) / eps;
  float bevel = smoothstep(-0.05, 0.0, d);
  vec3 normal = normalize(vec3(grad * bevel * 1.5, 1.0));
  vec3 lightDir = normalize(vec3(cos(iTime * 0.3), sin(iTime * 0.3) + 0.5, 0.8));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float spec = pow(max(dot(reflect(-lightDir, normal), vec3(0.0, 0.0, 1.0)), 0.0), 20.0);

  float inside = smoothstep(0.004, -0.004, d);
  float brush = 0.92 + 0.08 * sin(d * 220.0);
  vec3 metal = vec3(0.70, 0.15, 0.12) * 0.55 + vec3(0.94, 0.41, 0.36) * 0.25;
  vec3 col = vec3(0.03, 0.015, 0.02) + vec3(0.70, 0.15, 0.12) * 0.12 * exp(-dot(q, q) * 0.8);
  col = mix(col, metal * brush * (0.3 + 0.9 * diffuse) + vec3(1.0, 0.9, 0.85) * spec * 0.7, inside);
  col += vec3(0.94, 0.41, 0.36) * smoothstep(0.01, 0.0, abs(d)) * 0.5;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
