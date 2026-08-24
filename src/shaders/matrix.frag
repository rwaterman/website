// Rain — digital rain in ember. Each column scrolls at its own hashed speed;
// glyphs are 3x5 bit patterns pulled from a hash and drawn as small squares,
// the head burns bright, the tail fades to ember, and the bits flicker over time.
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// A 3x5 grid of squares inside the unit cell, each bit set by hash.
float glyph(vec2 cellUv, vec2 id, float seed) {
  vec2 grid = (cellUv - 0.1) / 0.8 * vec2(3.0, 5.0);
  if (grid.x < 0.0 || grid.y < 0.0 || grid.x >= 3.0 || grid.y >= 5.0) return 0.0;
  vec2 bit = floor(grid);
  vec2 f = fract(grid);
  float on = step(0.45, hash21(id * 3.1 + bit * 0.7 + seed * 0.13));
  float square = step(0.12, f.x) * step(f.x, 0.88) * step(0.12, f.y) * step(f.y, 0.88);
  return on * square;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.y;
  vec2 cellSize = vec2(0.7, 1.0) / 20.0;
  vec2 cell = floor(uv / cellSize);
  vec2 cellUv = fract(uv / cellSize);

  float speed = 3.0 + 8.0 * hash21(vec2(cell.x, 7.0));
  float trailLen = 8.0 + floor(14.0 * hash21(vec2(cell.x, 11.0)));
  float row = cell.y + floor(iTime * speed + hash21(vec2(cell.x, 3.0)) * 100.0);
  float pos = mod(row, trailLen);
  float alive = step(0.25, hash21(vec2(cell.x, floor(row / trailLen))));
  float fade = 1.0 - pos / trailLen;
  float isHead = 1.0 - step(0.5, pos);

  float flickerRate = 1.5 + 5.0 * hash21(cell + 0.5);
  float seed = floor(iTime * flickerRate + hash21(cell) * 10.0);
  float g = glyph(cellUv, cell, seed) * alive;

  vec3 col = vec3(0.03, 0.015, 0.02);
  col += vec3(0.70, 0.15, 0.12) * g * fade * fade * 1.6;
  col += vec3(0.94, 0.41, 0.36) * g * fade * fade * fade * 0.8;
  col += vec3(1.0, 0.9, 0.85) * g * isHead * 1.5;
  col += vec3(0.70, 0.15, 0.12) * 0.12 * fade * alive;

  col = col / (1.0 + col);
  fragColor = vec4(pow(col, vec3(0.9)), 1.0);
}
