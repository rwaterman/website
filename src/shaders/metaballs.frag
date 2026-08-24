// Metaballs — five wandering charges summed as r²/d². A threshold makes the
// blobs merge and split; iso-contours below the threshold show the field.
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.0;
  float field = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec2 c = 0.7 * vec2(sin(iTime * (0.5 + fi * 0.13) + fi * 1.7), cos(iTime * (0.4 + fi * 0.11) + fi * 2.3));
    float radius = 0.12 + 0.05 * fi;
    field += radius * radius / dot(p - c, p - c);
  }

  float blob = smoothstep(0.9, 1.1, field);
  float rings = 0.5 + 0.5 * sin(field * 20.0 - iTime * 2.0);
  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * (1.0 - blob) * pow(rings, 8.0) * smoothstep(0.1, 0.9, field) * 0.8;
  col = mix(col, vec3(0.94, 0.41, 0.36), blob);
  col += vec3(1.0, 0.9, 0.85) * smoothstep(1.1, 2.5, field) * 0.5;
  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
