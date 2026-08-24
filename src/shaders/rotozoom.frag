// Rotozoom — the demoscene rotozoomer: a procedural dot-and-checker texture spun and zoomed by time.
// Two layers at different speeds, each sine-warped, blend into a plasma-ish ember mix.
mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float pattern(vec2 p) {
  vec2 cell = fract(p) - 0.5;
  float checker = mod(floor(p.x) + floor(p.y), 2.0);
  float dots = 1.0 - smoothstep(0.22, 0.30, length(cell));
  return mix(checker, 1.0 - checker, dots);
}

float layer(vec2 p, float t, float spin, float speed, vec2 drift) {
  float zoom = 1.5 + sin(t * speed);
  vec2 q = rot(t * spin) * p * zoom * 3.0 + drift * t;
  q += 0.18 * sin(q.yx * 1.7 + t);
  return pattern(q);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float t = iTime;
  float a = layer(uv, t, 0.25, 0.6, vec2(0.6, 0.2));
  float b = layer(uv, t + 3.0, -0.17, 0.43, vec2(-0.3, 0.5));

  vec3 col = mix(vec3(0.03, 0.015, 0.02), vec3(0.70, 0.15, 0.12), a);
  col = mix(col, vec3(0.94, 0.41, 0.36), b * 0.55);
  col += vec3(1.0, 0.9, 0.85) * a * b * 0.25;
  col *= 1.0 - 0.4 * dot(uv, uv);
  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
