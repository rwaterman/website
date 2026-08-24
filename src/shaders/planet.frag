// Planet — an analytic ray–sphere planet with fbm continents spinning under a thin atmosphere.
// No marching: the surface is 3D value noise at the hit point, the seas lean teal, and the
// stars behind are a hashed grid that slowly rotates.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash31(vec3 p) {
  p = fract(p * vec3(123.34, 456.21, 789.12));
  p += dot(p, p.yzx + 45.32);
  return fract((p.x + p.y) * p.z);
}

float noise3d(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), u.x);
  float b = mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x);
  float c = mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x);
  float d = mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise3d(p);
    p = p * 2.1 + 7.3;
    amplitude *= 0.5;
  }
  return value;
}

float stars(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash21(cell);
  vec2 offset = vec2(hash21(cell + 1.3), hash21(cell + 2.7)) - 0.5;
  float d = length(f - offset * 0.7);
  float twinkle = 0.7 + 0.3 * sin(iTime * 2.0 + h * 60.0);
  return step(0.93, h) * twinkle * (1.0 - smoothstep(0.0, 0.14, d));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 ro = vec3(0.0, 0.0, 4.4);
  vec3 rd = normalize(vec3(uv, -1.8));
  vec3 sunDir = normalize(vec3(-0.7, 0.35, 0.6));

  float spin = iTime * 0.04;
  vec2 starUv = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * uv;
  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(1.0, 0.9, 0.85) * stars(starUv * 28.0) * 0.8;
  col += vec3(0.94, 0.41, 0.36) * stars(starUv * 55.0 + 11.0) * 0.35;

  float b = dot(ro, rd);
  float c = dot(ro, ro) - 1.0;
  float h = b * b - c;
  float closest = sqrt(max(c + 1.0 - b * b, 0.0));
  col += vec3(0.94, 0.41, 0.36) * 0.9 * exp(-max(closest - 1.0, 0.0) * 14.0);
  if (h > 0.0) {
    float t = -b - sqrt(h);
    vec3 p = ro + rd * t;
    float angle = iTime * 0.15;
    vec3 q = vec3(p.x * cos(angle) - p.z * sin(angle), p.y, p.x * sin(angle) + p.z * cos(angle));
    float elevation = fbm(q * 2.4);
    float land = smoothstep(0.47, 0.51, elevation);
    vec3 sea = vec3(0.2, 0.8, 0.75) * 0.14;
    vec3 ground = mix(vec3(0.70, 0.15, 0.12) * 0.7, vec3(0.94, 0.41, 0.36), smoothstep(0.5, 0.72, elevation));
    vec3 surface = mix(sea, ground, land);
    surface = mix(surface, vec3(1.0, 0.9, 0.85) * 0.8, smoothstep(0.8, 0.95, abs(p.y)));
    float diffuse = max(dot(p, sunDir), 0.0);
    float spec = pow(max(dot(p, normalize(sunDir - rd)), 0.0), 48.0) * (1.0 - land);
    float rim = pow(1.0 - max(dot(p, -rd), 0.0), 3.0);
    col = surface * (0.03 + diffuse) + vec3(1.0, 0.9, 0.85) * spec * 0.5 + vec3(0.94, 0.41, 0.36) * rim * (0.15 + 0.6 * diffuse);
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
