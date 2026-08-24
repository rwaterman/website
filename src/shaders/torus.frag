// Torus — a raymarched torus with a twisted stripe, tumbling on two axes.
// Ember diffuse plus a rim and a tight specular, over a soft floor glow on the dark backdrop.
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 toObject(vec3 p) {
  p.xz *= rot(iTime * 0.35);
  p.yz *= rot(iTime * 0.23);
  return p;
}

float map(vec3 p) {
  vec3 q = toObject(p);
  vec2 d = vec2(length(q.xz) - 1.0, q.y);
  return length(d) - 0.38;
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, 3.6);
  vec3 rd = normalize(vec3(uv, -1.5));

  float t = 0.0;
  float d = 0.0;
  for (int i = 0; i < 64; i++) {
    d = map(ro + rd * t);
    if (d < 0.001 || t > 8.0) break;
    t += d;
  }

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * 0.35 * exp(-3.0 * length(uv - vec2(0.0, -0.45)));
  if (d < 0.001) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 q = toObject(p);
    float major = atan(q.z, q.x);
    float minor = atan(q.y, length(q.xz) - 1.0);
    float stripe = smoothstep(-0.2, 0.2, sin(minor * 3.0 + major * 2.0 + iTime));
    vec3 lightDir = normalize(vec3(0.6, 0.8, 0.5));
    vec3 halfDir = normalize(lightDir - rd);
    float diffuse = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(n, halfDir), 0.0), 48.0);
    float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
    vec3 base = mix(vec3(0.70, 0.15, 0.12), vec3(0.94, 0.41, 0.36), stripe);
    col = base * (0.12 + diffuse) + vec3(0.94, 0.41, 0.36) * rim * 0.4 + vec3(1.0, 0.9, 0.85) * spec * 0.8;
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
