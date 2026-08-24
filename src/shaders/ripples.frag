// Ripples — rain on still water. Every grid cell drops once per hashed period;
// each ring is a windowed sine whose analytic gradient is summed over the 5×5
// neighborhood into a surface normal, then lit with a fake specular ember sky.
float hash21(vec2 p) {
  p = fract(mod(p, 289.0) * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 rippleGradient(vec2 p, float t) {
  vec2 grad = vec2(0.0);
  vec2 cell = floor(p);
  for (int y = -2; y <= 2; y++) {
    for (int x = -2; x <= 2; x++) {
      vec2 id = cell + vec2(float(x), float(y));
      float h = hash21(id);
      vec2 center = id + 0.5 + 0.7 * (vec2(hash21(id + 1.3), hash21(id + 2.7)) - 0.5);
      float period = 3.0 + 3.0 * h;
      float age = mod(t + h * 17.0, period);
      vec2 toP = p - center;
      float r = length(toP);
      float phase = r * 20.0 - age * 8.0;
      float window = smoothstep(1.0, -3.0, phase) * smoothstep(-15.0, -7.0, phase);
      float amplitude = 0.6 * exp(-age * 0.8) * window;
      grad += amplitude * cos(phase) * toP / max(r, 0.001);
    }
  }
  return grad;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;
  vec3 dark = vec3(0.03, 0.015, 0.02);
  vec3 ember = vec3(0.70, 0.15, 0.12);
  vec3 accent = vec3(0.94, 0.41, 0.36);
  vec3 highlight = vec3(1.0, 0.9, 0.85);

  vec2 grad = rippleGradient(p * 3.0, iTime);
  vec3 normal = normalize(vec3(-grad, 1.0));
  vec3 lightDir = normalize(vec3(-0.4, 0.6, 0.7));
  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(normal, halfVec), 0.0), 48.0);
  float diffuse = max(dot(normal, lightDir), 0.0);
  float tilt = 1.0 - normal.z;
  float skyReflect = smoothstep(-0.7, 0.9, p.y + normal.y * 1.5);

  vec3 col = dark + ember * (0.1 + 0.3 * skyReflect) * (0.6 + 0.4 * diffuse);
  col += accent * tilt * 1.5;
  col += highlight * spec * 0.9;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
