// Square tunnel — the classic demo tunnel with a Chebyshev radius.
// max(|x|,|y|) replaces length() so the bore is square; angle and 1/r index a checker that
// scrolls toward the viewer while the centre wobbles and the four corner seams glow.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  p -= 0.15 * vec2(sin(iTime * 0.7), cos(iTime * 0.9));
  float r = max(abs(p.x), abs(p.y));
  float angle = atan(p.y, p.x) / 6.28318530718 + iTime * 0.03;
  float depth = 0.25 / max(r, 0.01);
  vec2 tex = vec2(angle * 8.0, depth - iTime * 2.5);

  float checker = mod(floor(tex.x) + floor(tex.y), 2.0);
  float stripe = 1.0 - smoothstep(0.30, 0.45, abs(fract(tex.y) - 0.5));
  float seam = 1.0 - smoothstep(0.0, 0.06, abs(fract(tex.x) - 0.5));
  float corner = 1.0 - smoothstep(0.0, 0.02, abs(abs(p.x) - abs(p.y)));

  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 col = mix(ember * 0.6, accent, checker);
  col *= 0.55 + 0.45 * stripe;
  col += vec3(1.0, 0.9, 0.85) * seam * 0.3;
  col += accent * corner * 0.5;
  col *= 1.0 - exp(-r * 4.0);
  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
