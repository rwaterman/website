// Bubbles — rising bubbles. Four layers of hashed grid cells, each holding one
// bubble that drifts upward with a sine wobble: a thin teal rim, a refractive
// inner gradient and a specular dot; the big front bubbles rise faster and brighter.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 layer(vec2 p, float scale, float speed, float strength, float seed) {
  vec2 g = p * scale + vec2(0.0, -iTime * speed);
  vec2 id = floor(g) + seed;
  vec2 f = fract(g) - 0.5;
  float h1 = hash21(id);
  float h2 = hash21(id + 0.37);
  float h3 = hash21(id + 0.71);
  float alive = step(0.3, hash21(id + 1.13));
  float radius = 0.1 + 0.18 * h1;
  vec2 center = (vec2(h2, h3) - 0.5) * (0.86 - 2.0 * radius);
  center.x += 0.04 * sin(iTime * (1.0 + h1) + h2 * 6.2832);
  vec2 q = (f - center) / radius;
  float d = length(q);
  float aa = 2.0 * scale / (iResolution.y * radius);

  float rim = smoothstep(0.08 + aa, 0.0, abs(d - 1.0));
  float inside = smoothstep(1.0 + aa, 1.0 - aa, d);
  float inner = inside * (0.05 + 0.3 * smoothstep(0.45, 1.0, d) * (0.5 - 0.5 * q.y));
  float spec = smoothstep(0.3, 0.0, length(q - vec2(-0.38, 0.4)));
  vec3 col = vec3(0.2, 0.8, 0.75) * (rim * 0.8 + inner);
  col += vec3(1.0, 0.9, 0.85) * (spec * 0.8 + rim * 0.2 * (0.5 - 0.5 * q.y));
  return col * alive * strength;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.0;
  float depth = smoothstep(-1.0, 1.0, p.y);
  vec3 col = vec3(0.03, 0.015, 0.02) + vec3(0.70, 0.15, 0.12) * (0.1 + 0.2 * depth);
  col += vec3(0.2, 0.8, 0.75) * 0.04 * depth;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float scale = 6.5 - fi * 1.55;
    float speed = 0.5 + fi * 0.35;
    float strength = 0.35 + fi * 0.22;
    col += layer(p, scale, speed, strength, fi * 17.0);
  }
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
