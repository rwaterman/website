// Quasicrystal — seven plane waves with evenly spaced directions summed together.
// Seven-fold symmetry cannot tile the plane, so the interference never repeats;
// phases drift with time and contours of the sum are banded in ember.
const float PI = 3.14159265;

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float spin = iTime * 0.03;
  float freq = 36.0 + 8.0 * sin(iTime * 0.07);
  float sum = 0.0;
  for (int i = 0; i < 7; i++) {
    float a = float(i) * PI / 7.0 + spin;
    vec2 dir = vec2(cos(a), sin(a));
    sum += cos(dot(p, dir) * freq + iTime * (0.35 + 0.05 * float(i)));
  }

  float v = 0.5 + 0.5 * sum / 7.0;
  float band = 0.5 + 0.5 * cos(sum * 1.6 - iTime * 0.5);
  float vignette = 1.0 - 0.35 * dot(p, p);

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * band * 0.45;
  col += vec3(0.94, 0.41, 0.36) * smoothstep(0.6, 0.85, v);
  col += vec3(1.0, 0.9, 0.85) * smoothstep(0.82, 1.0, v) * 0.8;
  col *= vignette;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
