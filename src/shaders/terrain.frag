// Terrain — a raymarched fbm heightfield flown over toward a low ember sun.
// Four noise octaves drive the march and five the final shade; the normal comes from
// height differences and fog pools in the valleys.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float height(vec2 p, int octaves) {
  float value = 0.0;
  float amplitude = 1.0;
  mat2 rotate = mat2(0.8, 0.6, -0.6, 0.8);
  p *= 0.3;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    value += amplitude * noise(p);
    p = rotate * p * 2.0 + 10.0;
    amplitude *= 0.5;
  }
  return value * 1.8 - 1.4;
}

vec3 skyColor(vec3 rd, vec3 sunDir) {
  float sunAmount = max(dot(rd, sunDir), 0.0);
  float horizon = pow(1.0 - clamp(rd.y, 0.0, 1.0), 5.0);
  vec3 col = mix(vec3(0.03, 0.015, 0.02), vec3(0.70, 0.15, 0.12) * 0.7, horizon);
  col += vec3(0.94, 0.41, 0.36) * pow(sunAmount, 6.0) * 0.5;
  col += vec3(1.0, 0.9, 0.85) * pow(sunAmount, 96.0);
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 sunDir = normalize(vec3(0.5, 0.12, 1.0));
  vec3 ro = vec3(0.6 * sin(iTime * 0.2), 0.0, iTime * 1.2);
  ro.y = height(ro.xz, 2) + 1.5;
  vec3 rd = normalize(vec3(uv.x, uv.y - 0.12, 1.0));

  float t = 0.1;
  float hit = 0.0;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    float h = p.y - height(p.xz, 4);
    if (h < 0.003 * t) { hit = 1.0; break; }
    if (t > 40.0) break;
    t += 0.3 * h + 0.005 * t;
  }

  vec3 col = skyColor(rd, sunDir);
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    float e = 0.02 + 0.003 * t;
    vec3 n = normalize(vec3(
      height(p.xz - vec2(e, 0.0), 5) - height(p.xz + vec2(e, 0.0), 5),
      2.0 * e,
      height(p.xz - vec2(0.0, e), 5) - height(p.xz + vec2(0.0, e), 5)));
    float diffuse = max(dot(n, sunDir), 0.0);
    float skyLight = 0.5 + 0.5 * n.y;
    vec3 ground = mix(vec3(0.10, 0.04, 0.035), vec3(0.70, 0.15, 0.12), smoothstep(-0.8, 1.6, p.y));
    ground = mix(ground, vec3(0.94, 0.41, 0.36), 0.5 * smoothstep(0.6, 1.0, n.y) * smoothstep(0.8, 2.0, p.y));
    col = ground * (0.12 * skyLight + 1.1 * diffuse);
    float fog = 1.0 - exp(-0.06 * t);
    fog = max(fog, 0.7 * exp(-1.5 * max(p.y + 0.9, 0.0)) * (1.0 - exp(-0.1 * t)));
    col = mix(col, skyColor(rd, sunDir), clamp(fog, 0.0, 1.0));
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
