// Lightning — a strike every second or so. The main channel is x = f(y) from
// three octaves of value noise; branches fork at fixed heights to alternating
// sides. Distance to each channel gives a white core with ember glow, and a
// hashed strobe lights the clouds behind.
float hash21(vec2 p) {
  p = fract(mod(p, 289.0) * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float hash11(float n) {
  return hash21(vec2(n, n * 0.37 + 1.3));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float boltX(float y, float seed) {
  float x = (noise(vec2(y * 1.2, seed)) - 0.5) * 0.9;
  x += (noise(vec2(y * 5.0, seed + 3.0)) - 0.5) * 0.25;
  x += (noise(vec2(y * 20.0, seed + 6.0)) - 0.5) * 0.07;
  return x;
}

// Core plus glow of a near-vertical channel at xPath, alive for y in [yMin, yMax].
float channel(vec2 p, float xPath, float yMin, float yMax, float width) {
  float alive = step(yMin, p.y) * step(p.y, yMax);
  float d = abs(p.x - xPath);
  return alive * (smoothstep(width, 0.0, d) + 0.01 / (d + 0.02));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  float period = 1.2;
  float cycle = floor(iTime / period);
  float phase = fract(iTime / period);
  float seed = hash11(cycle) * 40.0;
  float flicker = 0.6 + 0.4 * step(0.5, hash11(floor(iTime * 30.0)));
  float strike = exp(-phase * 3.0) * flicker;
  float flash = 0.12 * step(0.8, hash11(floor(iTime * 7.0) + 0.5)) + 0.2 * exp(-phase * 10.0);

  float cloud = 0.6 * noise(p * 3.0 + vec2(iTime * 0.05, 0.0)) + 0.4 * noise(p * 7.0 - vec2(iTime * 0.1, 0.0));
  vec3 col = dark + ember * cloud * (0.15 + flash * 2.5) * smoothstep(-0.3, 0.5, p.y);
  col += ember * flash;

  float jitter = (noise(vec2(p.y * 40.0, iTime * 25.0)) - 0.5) * 0.015;
  float energy = channel(p, boltX(p.y, seed) + jitter, -0.6, 0.6, 0.007);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float yBranch = 0.32 - fi * 0.24;
    float side = 1.0 - 2.0 * mod(fi, 2.0);
    float wiggle = (noise(vec2(p.y * 9.0, seed + fi + 20.0)) - noise(vec2(yBranch * 9.0, seed + fi + 20.0))) * 0.12;
    float xBranch = boltX(yBranch, seed) + (yBranch - p.y) * side * (0.5 + 0.4 * hash11(seed + fi)) + wiggle;
    energy += 0.6 * channel(p, xBranch, yBranch - 0.3, yBranch, 0.004);
  }
  energy *= strike;
  col += ember * energy * 1.2 + highlight * energy * energy;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
