// Black hole — gravitational lensing faked in 2D: star lookups are pulled toward the centre by
// a 1/r term around a dark event horizon, ringed by a thin ember-and-gold accretion disc whose
// front half passes over the hole.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float stars(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash21(cell);
  vec2 offset = vec2(hash21(cell + 1.3), hash21(cell + 2.7)) - 0.5;
  float d = length(f - offset * 0.7);
  float twinkle = 0.7 + 0.3 * sin(iTime * 2.0 + h * 60.0);
  return step(0.92, h) * twinkle * (1.0 - smoothstep(0.0, 0.12, d));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  float r = length(uv);
  vec2 dir = uv / max(r, 0.0001);
  float horizonR = 0.13;

  vec2 lensed = uv - dir * 0.022 / max(r - 0.04, 0.02);
  float spin = iTime * 0.02;
  lensed = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * lensed;
  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(1.0, 0.9, 0.85) * stars(lensed * 26.0) * 0.9;
  col += vec3(0.94, 0.41, 0.36) * stars(lensed * 50.0 + 9.0) * 0.4;
  col += vec3(0.70, 0.15, 0.12) * 0.08 * exp(-length(lensed) * 2.0);

  vec2 q = mat2(0.94, -0.34, 0.34, 0.94) * uv;
  q.y *= 2.6;
  float rr = length(q);
  float x = (rr - 0.3) * 22.0;
  float a = atan(q.y, q.x);
  float doppler = 0.4 + 0.6 * smoothstep(-1.0, 1.0, cos(a));
  float ring = exp(-x * x) * doppler * (0.7 + 0.3 * sin(a * 3.0 - iTime * 2.0));
  float haze = exp(-abs(rr - 0.3) * 9.0) * 0.25 * doppler;

  float hole = 1.0 - smoothstep(horizonR, horizonR + 0.008, r);
  col *= 1.0 - hole;
  float photon = (r - horizonR - 0.012) * 90.0;
  col += vec3(0.94, 0.41, 0.36) * exp(-photon * photon) * 0.8;

  vec3 ringCol = mix(vec3(0.94, 0.41, 0.36), vec3(1.0, 0.75, 0.3), doppler);
  float front = step(q.y, 0.0);
  float visible = 1.0 - hole * (1.0 - front);
  col += ringCol * (ring * 1.6 + haze) * visible;
  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
