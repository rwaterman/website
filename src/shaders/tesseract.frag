// Tesseract — a hypercube turning in the xw and yz planes. The 16 vertices come
// from the bits of their index, the 32 edges join vertices one bit apart; each is
// projected 4D -> 3D -> 2D with perspective and drawn as a glowing segment.
float segmentDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Returns (screen x, screen y, nearness in [0, 1]).
vec3 project(int index, mat4 rot4, mat3 rot3) {
  vec4 v = vec4(
    float(index & 1),
    float((index >> 1) & 1),
    float((index >> 2) & 1),
    float((index >> 3) & 1)) * 2.0 - 1.0;
  v = rot4 * v;
  float depth4 = 1.0 / (2.6 - v.w);
  vec3 q = rot3 * (v.xyz * depth4);
  float depth3 = 1.0 / (4.0 - q.z);
  return vec3(q.xy * depth3 * 2.4, clamp(0.5 + 0.35 * v.w, 0.0, 1.0));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 p = (fragCoord - 0.5 * iResolution.xy) / iResolution.y * 2.0;
  float pixel = 2.0 / iResolution.y;
  float ca = cos(iTime * 0.35);
  float sa = sin(iTime * 0.35);
  float cb = cos(iTime * 0.22);
  float sb = sin(iTime * 0.22);
  float cc = cos(iTime * 0.1);
  float sc = sin(iTime * 0.1);
  mat4 rotXW = mat4(vec4(ca, 0.0, 0.0, sa), vec4(0.0, 1.0, 0.0, 0.0), vec4(0.0, 0.0, 1.0, 0.0), vec4(-sa, 0.0, 0.0, ca));
  mat4 rotYZ = mat4(vec4(1.0, 0.0, 0.0, 0.0), vec4(0.0, cb, sb, 0.0), vec4(0.0, -sb, cb, 0.0), vec4(0.0, 0.0, 0.0, 1.0));
  mat3 rotY = mat3(vec3(cc, 0.0, -sc), vec3(0.0, 1.0, 0.0), vec3(sc, 0.0, cc));
  mat3 tilt = mat3(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.92, 0.39), vec3(0.0, -0.39, 0.92));
  mat4 rot4 = rotYZ * rotXW;
  mat3 rot3 = tilt * rotY;

  vec3 col = vec3(0.03, 0.015, 0.02);
  for (int i = 0; i < 16; i++) {
    vec3 from = project(i, rot4, rot3);
    vec2 toVertex = p - from.xy;
    col += vec3(1.0, 0.9, 0.85) * (0.0004 / (dot(toVertex, toVertex) + 0.0004)) * (0.3 + 0.7 * from.z) * 0.5;
    for (int bit = 0; bit < 4; bit++) {
      if (((i >> bit) & 1) == 1) continue;
      vec3 to = project(i | (1 << bit), rot4, rot3);
      float d = segmentDist(p, from.xy, to.xy);
      float nearness = 0.5 * (from.z + to.z);
      float line = smoothstep(pixel * 1.5, 0.0, d) + 0.4 * 0.0006 / (d * d + 0.0006);
      col += mix(vec3(0.70, 0.15, 0.12), vec3(0.94, 0.41, 0.36), nearness) * line * (0.35 + 0.9 * nearness);
    }
  }

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
