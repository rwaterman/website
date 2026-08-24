import tunnel from '../shaders/tunnel.frag?raw';
import raymarch from '../shaders/raymarch.frag?raw';
import plasma from '../shaders/plasma.frag?raw';
import cells from '../shaders/cells.frag?raw';
import julia from '../shaders/julia.frag?raw';
import warp from '../shaders/warp.frag?raw';
import metaballs from '../shaders/metaballs.frag?raw';
import truchet from '../shaders/truchet.frag?raw';
import hex from '../shaders/hex.frag?raw';
import kaleido from '../shaders/kaleido.frag?raw';
import menger from '../shaders/menger.frag?raw';
import waves from '../shaders/waves.frag?raw';
import rings from '../shaders/rings.frag?raw';

export interface Shader {
  id: string;
  title: string;
  /** Technique line shown under the title. */
  caption: string;
  /** Shadertoy-style fragment body: defines mainImage(out vec4, in vec2). */
  source: string;
}

/** Shown on /fun in this order. Each one was drafted with generative AI, then tuned by hand. */
export const shaders: Shader[] = [
  { id: 'tunnel', title: 'Afterburn', caption: 'Polar remap · 16 neon lanes · a nod to Radial Afterburn', source: tunnel },
  { id: 'raymarch', title: 'Still life', caption: 'Raymarched SDFs · soft shadows · drag to orbit', source: raymarch },
  { id: 'plasma', title: 'Ember', caption: 'Domain-warped fbm · cosine palette', source: plasma },
  { id: 'menger', title: 'Menger', caption: 'Raymarched Menger sponge · three folds', source: menger },
  { id: 'cells', title: 'Cells', caption: 'Animated Voronoi · glowing borders', source: cells },
  { id: 'julia', title: 'Julia', caption: 'Julia set · smooth escape time · orbit trap', source: julia },
  { id: 'warp', title: 'Warp', caption: 'Log-polar starfield · six layers', source: warp },
  { id: 'metaballs', title: 'Metaballs', caption: 'Inverse-square field · iso-contours', source: metaballs },
  { id: 'truchet', title: 'Truchet', caption: 'Quarter-circle tiles · hashed mirroring', source: truchet },
  { id: 'hex', title: 'Hex', caption: 'Hexagonal grid · per-cell pulse', source: hex },
  { id: 'kaleido', title: 'Kaleidoscope', caption: 'Eight-way polar fold · fbm', source: kaleido },
  { id: 'waves', title: 'Waves', caption: 'Twelve sine lines · additive glow', source: waves },
  { id: 'rings', title: 'Interference', caption: 'Three ring sources · moiré', source: rings },
];
