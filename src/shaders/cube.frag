// Cube — a raymarched rounded cube tumbling above a ground plane.
// Faces carry a positional grid and a fresnel rim; a short 24-step march toward the light
// drops a soft shadow onto the floor.
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 toObject(vec3 p) {
  p.xz *= rot(iTime * 0.4);
  p.xy *= rot(iTime * 0.27);
  return p;
}

float mapCube(vec3 p) {
  vec3 q = abs(toObject(p)) - vec3(0.6);
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.08;
}

float map(vec3 p) {
  return min(mapCube(p), p.y + 1.4);
}

vec3 normalAt(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.05;
  for (int i = 0; i < 24; i++) {
    float d = mapCube(ro + rd * t);
    res = min(res, 8.0 * d / t);
    t += clamp(d, 0.04, 0.3);
    if (res < 0.01 || t > 4.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.9, 3.8);
  vec3 rd = normalize(vec3(uv, -1.6));
  rd.yz *= rot(-0.2);

  float t = 0.0;
  float d = 0.0;
  for (int i = 0; i < 64; i++) {
    d = map(ro + rd * t);
    if (d < 0.001 || t > 16.0) break;
    t += d;
  }

  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 col = dark;
  if (d < 0.001) {
    vec3 p = ro + rd * t;
    vec3 n = normalAt(p);
    vec3 lightDir = normalize(vec3(0.5, 0.9, 0.4));
    float diffuse = max(dot(n, lightDir), 0.0) * shadow(p + n * 0.02, lightDir);
    if (mapCube(p) < 0.005) {
      vec3 g = abs(fract(toObject(p) * 3.0) - 0.5);
      float grid = smoothstep(0.40, 0.47, max(g.x, max(g.y, g.z)));
      float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
      float spec = pow(max(dot(n, normalize(lightDir - rd)), 0.0), 32.0);
      vec3 base = mix(vec3(0.70, 0.15, 0.12), vec3(0.94, 0.41, 0.36), grid * 0.6);
      col = base * (0.12 + diffuse) + vec3(1.0, 0.9, 0.85) * (spec * 0.6 + fresnel * 0.35);
    } else {
      float glow = exp(-1.2 * length(p.xz));
      col = mix(dark, vec3(0.70, 0.15, 0.12) * 0.45, glow) * (0.35 + 0.65 * diffuse);
      col = mix(col, dark, smoothstep(4.0, 12.0, t));
    }
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
