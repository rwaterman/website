// Spiral — logarithmic spiral arms. In (angle, log radius) a log spiral is a straight
// line, so cos(n * (theta - pitch * log r)) draws n arms at once; three layers with
// different arm counts, pitches and speeds are summed under a radial falloff.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.0;
  float r = max(length(p), 1e-4);
  float theta = atan(p.y, p.x);
  float logR = log(r);
  float t = iTime;

  float armsTwo = pow(0.5 + 0.5 * cos(2.0 * (theta - 0.9 * logR) + t * 0.2), 3.0);
  float armsThree = pow(0.5 + 0.5 * cos(3.0 * (theta - 1.6 * logR) - t * 0.5), 6.0);
  float armsFive = pow(0.5 + 0.5 * cos(5.0 * (theta + 2.2 * logR) + t * 0.35), 10.0);

  float fade = smoothstep(0.0, 0.25, r) * exp(-r * 1.1);
  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * armsTwo * fade * 0.8;
  col += vec3(0.94, 0.41, 0.36) * armsThree * fade * 1.2;
  col += vec3(1.0, 0.75, 0.3) * armsFive * fade * 0.7;
  col += vec3(1.0, 0.9, 0.85) * armsThree * armsFive * fade * 1.5;
  col += vec3(0.70, 0.15, 0.12) * exp(-r * 5.0) * 0.6;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
