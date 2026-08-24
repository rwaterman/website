// Still life — raymarched signed distance fields.
// A sphere melted into a torus over a ground plane, key light with soft shadows,
// rim light in the site accent. Drag horizontally to orbit the camera.
float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float ground = p.y + 1.0;
  float sphere = sdSphere(p - vec3(0.0, 0.2 * sin(iTime * 1.3), 0.0), 0.8);
  float torus = sdTorus(p - vec3(0.0, -0.3, 0.0), vec2(1.5, 0.22));
  return min(ground, smin(sphere, torus, 0.4));
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

float softShadow(vec3 origin, vec3 dir) {
  float shade = 1.0;
  float t = 0.05;
  for (int i = 0; i < 24; i++) {
    float h = map(origin + dir * t);
    shade = min(shade, 10.0 * h / t);
    if (h < 0.001) break;
    t += clamp(h, 0.02, 0.3);
  }
  return clamp(shade, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float drag = iMouse.z > 0.0 ? (iMouse.x - iMouse.z) / iResolution.x * 4.0 : 0.0;
  float orbit = iTime * 0.3 + drag;

  vec3 ro = vec3(3.5 * sin(orbit), 1.2, 3.5 * cos(orbit));
  vec3 fwd = normalize(vec3(0.0, -0.2, 0.0) - ro);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
  vec3 up = cross(fwd, right);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.6 * fwd);

  float t = 0.0;
  float d = 0.0;
  for (int i = 0; i < 80; i++) {
    d = map(ro + rd * t);
    if (d < 0.001 || t > 20.0) break;
    t += d;
  }

  vec3 sky = vec3(0.04, 0.03, 0.035);
  vec3 col = sky;
  if (d < 0.001) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 key = normalize(vec3(0.6, 0.8, 0.3));
    float diffuse = max(dot(n, key), 0.0) * softShadow(p + n * 0.01, key);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    float ao = clamp(map(p + n * 0.2) / 0.2, 0.0, 1.0);
    vec3 albedo = p.y < -0.99 ? vec3(0.10, 0.10, 0.11) : vec3(0.70, 0.15, 0.12);
    col = albedo * (0.15 + diffuse) * ao + vec3(0.94, 0.41, 0.36) * rim * 0.4;
    col = mix(col, sky, 1.0 - exp(-0.0025 * t * t));
  }

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
