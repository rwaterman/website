// Rose — polar roses r = cos(k * theta), drawn as glowing lines from the implicit
// form |r - |cos(k theta)|| divided by its gradient. k steps through 2..6 with a
// crossfade between neighbours; a counter-rotating teal rose and ring grid sit below.
mat2 rotate(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

float roseDist(vec2 p, float k) {
  float r = length(p);
  float theta = atan(p.y, p.x);
  float f = r - abs(cos(k * theta));
  float slope = k * sin(k * theta) / max(r, 0.02);
  return abs(f) / sqrt(1.0 + slope * slope);
}

float glowLine(float d, float pixel) {
  return smoothstep(pixel * 2.5, 0.0, d) + 0.35 * 0.02 / (d + 0.02);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.3;
  float pixel = 2.3 / iResolution.y;
  float s = iTime * 0.12;
  float kNow = 2.0 + mod(floor(s), 5.0);
  float kNext = 2.0 + mod(floor(s) + 1.0, 5.0);
  float blend = smoothstep(0.6, 0.95, fract(s));

  vec2 q = rotate(iTime * 0.08) * p;
  float outer = mix(glowLine(roseDist(q, kNow), pixel), glowLine(roseDist(q, kNext), pixel), blend);
  vec2 inner = rotate(-iTime * 0.2) * p / 0.45;
  float innerRose = glowLine(roseDist(inner, 3.0) * 0.45, pixel);

  float r = length(p);
  float ringDist = abs(fract(r * 5.0 + 0.5) - 0.5) / 5.0;
  float rings = smoothstep(pixel * 1.5, 0.0, ringDist) * smoothstep(1.25, 0.4, r);

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * rings * 0.35;
  col += vec3(0.94, 0.41, 0.36) * outer * 0.9;
  col += vec3(1.0, 0.9, 0.85) * outer * outer * 0.25;
  col += vec3(0.2, 0.8, 0.75) * innerRose * 0.6;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
