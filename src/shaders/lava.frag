// Lava lamp — five metaballs drifting on sine paths inside a glass tube.
// The summed inverse-square field is thresholded with a soft edge and shaded by its own
// gradient for a fake-3D bulge, under a vertical glass highlight and a warm bulb glow below.
float field(vec2 p) {
  float f = 0.0;
  for (int i = 0; i < 5; i++) {
    float k = float(i);
    vec2 c = vec2(
      0.26 * sin(iTime * (0.35 + 0.11 * k) + k * 1.7),
      0.28 * sin(iTime * (0.22 + 0.07 * k) + k * 2.3) - 0.02);
    float radius = 0.08 + 0.02 * k;
    vec2 d = p - c;
    f += radius * radius / (dot(d, d) + 0.0005);
  }
  return f;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  float inTube = (1.0 - smoothstep(0.44, 0.46, abs(p.x))) * (1.0 - smoothstep(0.455, 0.475, abs(p.y)));
  float f = field(p);
  vec2 e = vec2(0.004, 0.0);
  vec2 grad = vec2(field(p + e.xy) - field(p - e.xy), field(p + e.yx) - field(p - e.yx)) / (2.0 * e.x);
  vec3 n = normalize(vec3(-grad * 0.08, 1.0));
  vec3 lightDir = normalize(vec3(-0.4, 0.5, 0.75));
  float light = max(dot(n, lightDir), 0.0);
  float spec = pow(max(dot(n, normalize(lightDir + vec3(0.0, 0.0, 1.0))), 0.0), 24.0);
  float body = smoothstep(0.85, 1.15, f);
  vec3 blob = mix(ember, accent, light) + highlight * spec * 0.6 + accent * 0.3 * smoothstep(1.5, 4.0, f);

  vec3 liquid = vec3(0.09, 0.03, 0.03) + ember * 0.3 * exp(-(p.y + 0.5) * 3.0);
  liquid += ember * 0.25 * smoothstep(0.2, 0.85, f);
  vec3 col = mix(liquid, blob, body);
  float stripe = (p.x + 0.28) * 14.0;
  col += highlight * 0.10 * exp(-stripe * stripe);
  col = mix(dark + ember * 0.06 * exp(-abs(p.x) * 2.0), col, inTube);
  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
