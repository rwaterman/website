// Menger — a raymarched Menger sponge, three subdivisions deep, slowly tumbling.
// The distance field is a box carved by a repeating cross at each scale.
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float map(vec3 p) {
  p.xz *= rot(iTime * 0.25);
  p.xy *= rot(iTime * 0.17);
  float d = sdBox(p, vec3(1.0));
  float s = 1.0;
  for (int i = 0; i < 3; i++) {
    vec3 a = mod(p * s, 2.0) - 1.0;
    s *= 3.0;
    vec3 r = abs(1.0 - 3.0 * abs(a));
    float da = max(r.x, r.y);
    float db = max(r.y, r.z);
    float dc = max(r.z, r.x);
    d = max(d, (min(da, min(db, dc)) - 1.0) / s);
  }
  return d;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.0005, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(uv, -1.6));

  float t = 0.0;
  float d = 0.0;
  int steps = 0;
  for (int i = 0; i < 72; i++) {
    d = map(ro + rd * t);
    steps = i;
    if (d < 0.001 || t > 8.0) break;
    t += d;
  }

  vec3 col = vec3(0.03, 0.015, 0.02);
  if (d < 0.001) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    float diffuse = max(dot(n, normalize(vec3(0.5, 0.8, 0.6))), 0.0);
    float ao = 1.0 - float(steps) / 72.0;
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    col = vec3(0.70, 0.15, 0.12) * (0.2 + diffuse) * ao + vec3(0.94, 0.41, 0.36) * rim * 0.5;
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
