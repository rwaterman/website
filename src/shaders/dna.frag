// Helix — a double helix. Two sine strands half a turn apart, drawn as tubes
// shaded by depth (cos decides which is in front), rungs at a fixed interval,
// the whole thing rotating; a fainter second helix drifts behind.
float cover(float d, float w) {
  return smoothstep(w, w * 0.7, d);
}

float shade(float d, float w) {
  float x = clamp(d / w, 0.0, 1.0);
  return sqrt(1.0 - x * x);
}

vec3 helix(vec2 p, float t, float amp, float w, float gain, vec3 bg) {
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);
  float k = 3.0;
  float a = p.y * k + t;
  float x1 = amp * sin(a);
  float z1 = cos(a);
  float slope = amp * k * cos(a);
  float foreshorten = 1.0 / sqrt(1.0 + slope * slope);
  float d1 = abs(p.x - x1) * foreshorten;
  float d2 = abs(p.x + x1) * foreshorten;
  float depth1 = 0.5 + 0.5 * z1;
  float depth2 = 1.0 - depth1;
  float s1 = shade(d1, w);
  float s2 = shade(d2, w);
  vec3 c1 = mix(ember, accent, depth1) * (0.3 + 0.7 * s1) + highlight * smoothstep(0.75, 1.0, s1) * depth1 * 0.7;
  vec3 c2 = mix(ember, accent, depth2) * (0.3 + 0.7 * s2) + highlight * smoothstep(0.75, 1.0, s2) * depth2 * 0.7;

  float spacing = 0.3;
  float yn = (floor(p.y / spacing) + 0.5) * spacing;
  float xr = amp * sin(yn * k + t);
  float dx = max(abs(p.x) - abs(xr), 0.0);
  float dr = length(vec2(dx, p.y - yn));
  vec3 cr = mix(ember, accent, 0.4) * (0.25 + 0.6 * shade(dr, w * 0.55));

  float front = step(z1, 0.0);
  vec3 col = mix(bg, mix(c2, c1, front), cover(mix(d2, d1, front), w) * gain);
  col = mix(col, cr, cover(dr, w * 0.55) * gain);
  col = mix(col, mix(c1, c2, front), cover(mix(d1, d2, front), w) * gain);
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.4;
  float tilt = 0.45;
  p = mat2(cos(tilt), -sin(tilt), sin(tilt), cos(tilt)) * p;
  float t = iTime * 1.1;

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * 0.1 * (1.0 - smoothstep(0.2, 1.4, abs(p.x)));
  col = helix(p + vec2(1.25, 0.6), t * 0.6 + 2.0, 0.3, 0.05, 0.4, col);
  col = helix(p, t, 0.45, 0.08, 1.0, col);

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
