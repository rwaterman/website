// Glitch — datamosh. A striped ember gradient sliced into horizontal bands that
// hash-shift sideways, RGB channels split, block corruption rectangles and
// scanline noise; the glitch bursts on a hashed schedule and then calms down.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 base(vec2 uv, float aspect) {
  float t = iTime;
  float grad = clamp(uv.y * 0.8 + 0.25 * sin(uv.x * 4.0 + t * 0.5), 0.0, 1.0);
  float stripes = smoothstep(0.35, 0.65, 0.5 + 0.5 * sin((uv.x * aspect + uv.y * 0.6) * 30.0 - t * 1.2));
  vec3 col = mix(vec3(0.03, 0.015, 0.02), vec3(0.70, 0.15, 0.12), grad);
  col = mix(col, vec3(0.94, 0.41, 0.36), stripes * (0.3 + 0.4 * grad));
  vec2 c = (uv - 0.5) * vec2(aspect, 1.0);
  float ring = smoothstep(0.025, 0.0, abs(length(c) - 0.3 - 0.03 * sin(t * 0.8)));
  col += vec3(1.0, 0.9, 0.85) * ring * 0.8;
  col += vec3(1.0, 0.9, 0.85) * 0.25 * smoothstep(0.9, 1.0, grad);
  return col;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  float aspect = iResolution.x / iResolution.y;
  float frame = mod(floor(iTime * 18.0), 997.0);

  float slot = floor(iTime * 0.7);
  float within = fract(iTime * 0.7);
  float burst = step(0.45, hash21(vec2(slot, 5.0))) * (1.0 - within) * (1.0 - within);
  float intensity = 0.05 + 0.95 * burst;

  uv.y = fract(uv.y + step(0.92, hash21(vec2(frame, 4.0))) * intensity * 0.2);
  float band = floor(uv.y * 20.0 + hash21(vec2(frame, 1.0)) * 5.0);
  float shift = (hash21(vec2(band, frame)) - 0.5) * step(0.55, hash21(vec2(band, frame + 0.5))) * 0.3 * intensity;
  float band2 = floor(uv.y * 90.0);
  shift += (hash21(vec2(band2, frame + 3.0)) - 0.5) * step(0.7, hash21(vec2(band2, frame + 7.0))) * 0.06 * intensity;
  vec2 guv = vec2(fract(uv.x + shift), uv.y);

  float split = 0.003 + 0.02 * intensity;
  vec3 col = vec3(
    base(guv + vec2(split, 0.0), aspect).r,
    base(guv, aspect).g,
    base(guv - vec2(split, 0.0), aspect).b);

  vec2 blockId = floor(uv * vec2(12.0, 7.0) + hash21(vec2(frame, 2.0)) * 3.0);
  float blockOn = step(0.97 - 0.2 * intensity, hash21(blockId + frame * 0.1));
  vec2 moshOffset = vec2(hash21(blockId + 0.5), hash21(blockId + 0.9)) * 0.4;
  vec3 moshed = base(fract(uv + moshOffset), aspect) * vec3(1.3, 0.9, 1.1);
  col = mix(col, moshed, blockOn);

  float line = hash21(vec2(floor(fragCoord.y), frame));
  col += (line - 0.5) * 0.15 * (0.2 + intensity);
  col *= 0.92 + 0.16 * hash21(fragCoord * 0.37 + frame);

  col = max(col, 0.0);
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
