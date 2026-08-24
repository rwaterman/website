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
import mandelbrot from '../shaders/mandelbrot.frag?raw';
import sierpinski from '../shaders/sierpinski.frag?raw';
import kifs from '../shaders/kifs.frag?raw';
import spiral from '../shaders/spiral.frag?raw';
import rose from '../shaders/rose.frag?raw';
import quasicrystal from '../shaders/quasicrystal.frag?raw';
import opart from '../shaders/opart.frag?raw';
import lissajous from '../shaders/lissajous.frag?raw';
import tesseract from '../shaders/tesseract.frag?raw';
import gears from '../shaders/gears.frag?raw';
import matrix from '../shaders/matrix.frag?raw';
import crt from '../shaders/crt.frag?raw';
import circuit from '../shaders/circuit.frag?raw';
import dna from '../shaders/dna.frag?raw';
import iris from '../shaders/iris.frag?raw';
import bubbles from '../shaders/bubbles.frag?raw';
import glitch from '../shaders/glitch.frag?raw';
import clouds from '../shaders/clouds.frag?raw';
import aurora from '../shaders/aurora.frag?raw';
import fire from '../shaders/fire.frag?raw';
import lightning from '../shaders/lightning.frag?raw';
import caustics from '../shaders/caustics.frag?raw';
import ripples from '../shaders/ripples.frag?raw';
import galaxy from '../shaders/galaxy.frag?raw';
import mountains from '../shaders/mountains.frag?raw';
import vortex from '../shaders/vortex.frag?raw';
import flow from '../shaders/flow.frag?raw';
import torus from '../shaders/torus.frag?raw';
import cube from '../shaders/cube.frag?raw';
import terrain from '../shaders/terrain.frag?raw';
import planet from '../shaders/planet.frag?raw';
import isocubes from '../shaders/isocubes.frag?raw';
import squaretunnel from '../shaders/squaretunnel.frag?raw';
import rotozoom from '../shaders/rotozoom.frag?raw';
import synthgrid from '../shaders/synthgrid.frag?raw';
import blackhole from '../shaders/blackhole.frag?raw';
import lava from '../shaders/lava.frag?raw';

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
  { id: 'mandelbrot', title: 'Seahorse', caption: 'Escape-time Mandelbrot · smooth iteration count · cosine palette', source: mandelbrot },
  { id: 'sierpinski', title: 'Gasket', caption: 'Kaleidoscopic fold IFS · per-level edge SDF · pulsing hierarchy', source: sierpinski },
  { id: 'kifs', title: 'Bloom', caption: 'Kaleidoscopic IFS · abs/rotate/scale folds · orbit-trap color', source: kifs },
  { id: 'spiral', title: 'Vortex arms', caption: 'Log-polar spirals · three arm layers · radial falloff', source: spiral },
  { id: 'rose', title: 'Rhodonea', caption: 'Polar rose curves · implicit-function SDF · k crossfade', source: rose },
  { id: 'quasicrystal', title: 'Sevenfold', caption: 'Seven summed plane waves · aperiodic interference · contour banding', source: quasicrystal },
  { id: 'opart', title: 'Dazzle', caption: 'Polar checkerboard · drifting lens warp · fwidth anti-aliasing', source: opart },
  { id: 'lissajous', title: 'Phosphor', caption: 'Lissajous polylines · 48-segment SDF trails · additive glow', source: lissajous },
  { id: 'tesseract', title: 'Hypercube', caption: '4D bit-indexed vertices · xw/yz rotation · double perspective', source: tesseract },
  { id: 'gears', title: 'Clockwork', caption: 'SDF spur gears · solved mesh phases · gradient-bevel shading', source: gears },
  { id: 'matrix', title: 'Rain', caption: 'Hashed 3×5 bit-glyphs · per-column scroll speed · head/trail falloff', source: matrix },
  { id: 'crt', title: 'Test card', caption: 'Barrel distortion · curved scanlines · RGB subpixel mask · roll bar', source: crt },
  { id: 'circuit', title: 'Copper', caption: 'Truchet routes with 45° jogs · hashed corner pads · phase-hashed pulses', source: circuit },
  { id: 'dna', title: 'Helix', caption: 'Sine strands ordered by cos depth · slope-corrected tubes · fixed-interval rungs', source: dna },
  { id: 'iris', title: 'Iris', caption: 'Angle-periodic fbm fibres · ember-to-gold bands · breathing pupil', source: iris },
  { id: 'bubbles', title: 'Rising', caption: 'Four hashed grid layers · rim + refractive gradient · pixel-aware AA', source: bubbles },
  { id: 'glitch', title: 'Datamosh', caption: 'Hash-shifted bands · RGB split · block corruption · burst schedule', source: glitch },
  { id: 'clouds', title: 'Cumulus', caption: 'Layered fbm density · one-sided light · horizon gradient', source: clouds },
  { id: 'aurora', title: 'Curtains', caption: '1D fbm streaks · three bands · teal→violet→ember by altitude', source: aurora },
  { id: 'fire', title: 'Bonfire', caption: 'Upward-scrolling fbm · height-shaped heat · black→ember→highlight ramp', source: fire },
  { id: 'lightning', title: 'Strike', caption: 'Noise-offset channel · fixed-height branches · core + glow · hashed strobe', source: lightning },
  { id: 'caustics', title: 'Poolside', caption: 'Animated Voronoi F2−F1 ridges · three scales · additive teal', source: caustics },
  { id: 'ripples', title: 'Rainfall', caption: 'Hashed drop timing · analytic ring gradients → normal · fake specular', source: ripples },
  { id: 'galaxy', title: 'Pinwheel', caption: 'Log-spiral warped fbm · dust lanes · gold core · hashed star grid', source: galaxy },
  { id: 'mountains', title: 'Ridgelines', caption: 'Five 1D ridged fbm layers · depth haze · low sun · parallax drift', source: mountains },
  { id: 'vortex', title: 'Maelstrom', caption: 'Angle twisted by log(r) · fbm through polar warp · pulsing core', source: vortex },
  { id: 'flow', title: 'Streamlines', caption: 'Analytic curl of a sine potential · 14-step streamlines · traveling dashes', source: flow },
  { id: 'torus', title: 'Twist', caption: 'Raymarched torus · twisted stripe · rim + specular', source: torus },
  { id: 'cube', title: 'Tumble', caption: 'Raymarched rounded box · soft shadow march · fresnel rim', source: cube },
  { id: 'terrain', title: 'Overflight', caption: 'Raymarched fbm heightfield · height fog · ember sun', source: terrain },
  { id: 'planet', title: 'Landfall', caption: 'Analytic ray–sphere · 3D fbm continents · atmosphere rim', source: planet },
  { id: 'isocubes', title: 'Hexfield', caption: '2D isometric hex tiling · flat-shaded columns · sine bob', source: isocubes },
  { id: 'squaretunnel', title: 'Bore', caption: 'Chebyshev tunnel · angle × 1/r checker · wobbling centre', source: squaretunnel },
  { id: 'rotozoom', title: 'Spin cycle', caption: 'Rotozoomer · two sine-warped layers · procedural dots', source: rotozoom },
  { id: 'synthgrid', title: 'Outrun', caption: 'Perspective grid · banded sun · 1D-noise ridges', source: synthgrid },
  { id: 'blackhole', title: 'Singularity', caption: '2D lensing · hashed starfield · gold accretion ring', source: blackhole },
  { id: 'lava', title: 'Slow burn', caption: 'Metaballs · gradient-shaded field · glass highlight', source: lava },
];
