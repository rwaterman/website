import * as THREE from 'three';
import { terrainHeight, WATER_LEVEL, WORLD_RADIUS } from './terrain';

export interface FlightInput {
  /** -1 (left) .. 1 (right). */
  steerX: number;
  /** -1 (dive) .. 1 (climb). */
  steerY: number;
  /** -1 (slow) .. 1 (fast). */
  throttle: number;
  boost: boolean;
  breathing: boolean;
}

const CRUISE_SPEED = 58;
const MIN_SPEED = 30;
const MAX_SPEED = 150;
const MIN_CLEARANCE = 9;
const CEILING = 620;
const TURN_BACK_START = WORLD_RADIUS - 520;
const NECK_SEGMENTS = 9;
const NECK_LENGTH = 10.5;

const SCALE = new THREE.Color(0x4a0f0c);
const SCALE_DARK = new THREE.Color(0x1d0706);
const BONE = new THREE.Color(0xc9b58a);

function scaleMaterial(color: THREE.Color): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, flatShading: true });
}

/** One span of wing membrane between two finger joints, in the joint's local space (x outward, z back). */
function membrane(length: number, lead0: number, trail0: number, lead1: number, trail1: number): THREE.BufferGeometry {
  const mid = length / 2;
  const scallop = (trail0 + trail1) / 2 - Math.min(trail0, trail1 + 1.5) * 0.22;
  const positions = [
    0, 0, -lead0, length, 0, -lead1, mid, 0, scallop,
    0, 0, -lead0, mid, 0, scallop, 0, 0, trail0,
    length, 0, -lead1, length, 0, trail1, mid, 0, scallop,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

interface Wing {
  root: THREE.Group;
  joints: THREE.Group[];
}

function createWing(side: 1 | -1, skin: THREE.Material, bone: THREE.Material): Wing {
  const root = new THREE.Group();
  root.position.set(side * 1.5, 0.5, -2.2);
  root.scale.x = side;
  const spans = [
    { length: 5.2, lead: [1.6, 2.6], trail: [5.4, 6.4] },
    { length: 5.6, lead: [2.6, 1.6], trail: [6.4, 5.4] },
    { length: 5.2, lead: [1.6, -1.2], trail: [5.4, 2.2] },
  ];
  const joints: THREE.Group[] = [];
  let parent: THREE.Object3D = root;
  for (const span of spans) {
    const joint = new THREE.Group();
    joint.add(new THREE.Mesh(membrane(span.length, span.lead[0], span.trail[0], span.lead[1], span.trail[1]), skin));

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, span.length, 5), bone);
    arm.rotation.z = Math.PI / 2;
    arm.rotation.y = Math.atan2(span.lead[1] - span.lead[0], span.length);
    arm.position.set(span.length / 2, 0.05, -(span.lead[0] + span.lead[1]) / 2);
    joint.add(arm);

    const fingerLength = span.lead[1] + span.trail[1];
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.13, fingerLength, 4), bone);
    finger.rotation.x = Math.PI / 2;
    finger.position.set(span.length, 0.04, (span.trail[1] - span.lead[1]) / 2);
    joint.add(finger);

    parent.add(joint);
    if (parent !== root) joint.position.x = spans[joints.length - 1].length;
    joints.push(joint);
    parent = joint;
  }
  return { root, joints };
}

function createHead(scales: THREE.Material, dark: THREE.Material, bone: THREE.Material): { head: THREE.Group; jaw: THREE.Group } {
  const head = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 2.0), scales);
  head.add(skull);

  const snoutGeometry = new THREE.CylinderGeometry(0.42, 0.78, 2.6, 5);
  snoutGeometry.rotateX(-Math.PI / 2);
  const snout = new THREE.Mesh(snoutGeometry, scales);
  snout.position.set(0, -0.08, -2.1);
  snout.scale.set(1.15, 0.75, 1);
  head.add(snout);

  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.24, 2.8, 5), bone);
    horn.position.set(side * 0.62, 0.95, 1.5);
    horn.rotation.set(-1.15, 0, side * -0.28);
    head.add(horn);

    const spur = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.3, 4), bone);
    spur.position.set(side * 0.95, 0.25, 1.25);
    spur.rotation.set(-1.35, 0, side * -0.7);
    head.add(spur);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 1.0), dark);
    brow.position.set(side * 0.66, 0.62, -0.55);
    brow.rotation.z = side * -0.25;
    head.add(brow);

    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.6, 0.3) }));
    eye.position.set(side * 0.82, 0.3, -0.7);
    head.add(eye);

    const frill = new THREE.Mesh(membrane(1.5, 0.1, 1.4, -0.2, 0.3), dark);
    frill.position.set(side * 0.8, 0.1, 0.5);
    frill.rotation.set(0, 0, side * 0.5);
    frill.scale.x = side;
    head.add(frill);

    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.13, 5, 4), dark);
    nostril.position.set(side * 0.24, 0.24, -3.1);
    head.add(nostril);
  }

  const jaw = new THREE.Group();
  jaw.position.set(0, -0.45, 0.4);
  const jawGeometry = new THREE.CylinderGeometry(0.34, 0.66, 3.4, 5);
  jawGeometry.rotateX(-Math.PI / 2);
  const jawMesh = new THREE.Mesh(jawGeometry, dark);
  jawMesh.position.set(0, -0.1, -1.9);
  jawMesh.scale.set(1.1, 0.42, 1);
  jaw.add(jawMesh);
  for (const side of [-1, 1]) {
    for (let tooth = 0; tooth < 4; tooth += 1) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.36, 4), bone);
      fang.position.set(side * (0.42 - tooth * 0.06), 0.16, -1.2 - tooth * 0.55);
      jaw.add(fang);
    }
  }
  head.add(jaw);
  return { head, jaw };
}

export class Dragon {
  /** World transform of the dragon; the camera rides on it. */
  readonly rig = new THREE.Group();
  readonly velocity = new THREE.Vector3();
  readonly mouth = new THREE.Vector3();
  speed = CRUISE_SPEED;
  yaw = 0;
  pitch = 0;
  roll = 0;
  /** Wingbeat phase in radians; the downstroke is the first half of each cycle. */
  wingPhase = 0;
  /** 0 gliding .. 1 flapping hard; the audio follows it. */
  flapPower = 1;

  private readonly body = new THREE.Group();
  private readonly neck: THREE.Mesh[] = [];
  private readonly spikes: THREE.Mesh[] = [];
  private readonly neckPoints: THREE.Vector3[] = [];
  private readonly head: THREE.Group;
  private readonly jaw: THREE.Group;
  private readonly wings: Wing[];
  private readonly reins: THREE.Line[] = [];
  private readonly forward = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private sway = 0;
  private nod = 0;
  private jawOpen = 0;

  constructor() {
    this.rig.rotation.order = 'YXZ';
    this.rig.add(this.body);
    const scales = scaleMaterial(SCALE);
    const dark = scaleMaterial(SCALE_DARK);
    const bone = new THREE.MeshStandardMaterial({ color: BONE, roughness: 0.5, flatShading: true });
    const skin = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x5a130f),
      emissive: new THREE.Color(0x240603),
      roughness: 0.75,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), scales);
    torso.scale.set(2.3, 1.5, 5);
    torso.position.set(0, -0.7, 1.4);
    this.body.add(torso);

    const leather = new THREE.MeshStandardMaterial({ color: 0x3b2414, roughness: 0.85, flatShading: true });
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 2.2), leather);
    saddle.position.set(0, 0.86, 1.1);
    this.body.add(saddle);
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.7, 6), leather);
    pommel.position.set(0, 1.25, 0.15);
    pommel.rotation.x = -0.35;
    this.body.add(pommel);

    for (let index = 0; index < NECK_SEGMENTS; index += 1) {
      const taper = 1 - index / (NECK_SEGMENTS * 1.5);
      const geometry = new THREE.CylinderGeometry(0.82 * taper, 0.95 * taper, NECK_LENGTH / NECK_SEGMENTS + 0.35, 7);
      geometry.rotateX(Math.PI / 2);
      const segment = new THREE.Mesh(geometry, index % 2 === 0 ? scales : dark);
      this.body.add(segment);
      this.neck.push(segment);

      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.2 * taper, 1.25 * taper, 4), bone);
      spike.position.set(0, 0.95 * taper, 0);
      spike.rotation.x = -0.5;
      segment.add(spike);
      this.spikes.push(spike);
    }
    for (let index = 0; index <= NECK_SEGMENTS; index += 1) this.neckPoints.push(new THREE.Vector3());

    const parts = createHead(scales, dark, bone);
    this.head = parts.head;
    this.jaw = parts.jaw;
    this.body.add(this.head);

    this.wings = [createWing(1, skin, bone), createWing(-1, skin, bone)];
    for (const wing of this.wings) this.body.add(wing.root);

    const reinMaterial = new THREE.LineBasicMaterial({ color: 0x1b120b });
    for (let index = 0; index < 2; index += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const line = new THREE.Line(geometry, reinMaterial);
      line.frustumCulled = false;
      this.body.add(line);
      this.reins.push(line);
    }

    this.rig.position.set(0, 150, 860);
    this.update(0, { steerX: 0, steerY: 0, throttle: 0, boost: false, breathing: false });
  }

  /** Unit vector the fire leaves the mouth along, aimed at a point ahead of the rider's crosshair. */
  aim(target: THREE.Vector3): THREE.Vector3 {
    return this.forward.copy(target).sub(this.mouth).normalize();
  }

  update(dt: number, input: FlightInput): void {
    const rollTarget = -input.steerX * 1.12;
    const pitchTarget = input.steerY * 0.82;
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 3.0);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 2.4);
    this.yaw += (Math.sin(this.roll) * 1.05 - input.steerX * 0.25) * dt;

    const position = this.rig.position;
    const radius = Math.hypot(position.x, position.z);
    if (radius > TURN_BACK_START) {
      // Past the mountains the dragon is turned gently back toward the realm.
      const home = Math.atan2(position.x, position.z);
      const error = Math.atan2(Math.sin(home - this.yaw), Math.cos(home - this.yaw));
      const urgency = Math.min(1, (radius - TURN_BACK_START) / 260);
      this.yaw += Math.sign(error) * Math.min(Math.abs(error), 1) * urgency * 1.6 * dt;
    }

    const floor = Math.max(terrainHeight(position.x, position.z), WATER_LEVEL) + MIN_CLEARANCE;
    const clearance = position.y - floor;
    if (clearance < 40 && this.pitch < 0.35) this.pitch += (1 - clearance / 40) * 2.6 * dt;
    if (position.y > CEILING && this.pitch > -0.2) this.pitch -= ((position.y - CEILING) / 80) * dt * 2;

    const target = CRUISE_SPEED + input.throttle * 24 + (input.boost ? 48 : 0);
    this.speed += (-Math.sin(this.pitch) * 34 + (target - this.speed) * 0.7) * dt;
    this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, this.speed));

    this.rig.rotation.set(this.pitch, this.yaw, this.roll);
    this.velocity.set(0, 0, -1).applyEuler(this.rig.rotation).multiplyScalar(this.speed);
    position.addScaledVector(this.velocity, dt);
    if (position.y < floor) position.y = floor;

    this.animate(dt, input);
  }

  private animate(dt: number, input: FlightInput): void {
    const climbing = Math.max(0, this.pitch);
    const diving = Math.max(0, -this.pitch);
    const power = THREE.MathUtils.clamp(0.75 + climbing * 0.9 - diving * 1.6 + (input.boost ? 0.3 : 0), 0.12, 1.3);
    this.flapPower += (power - this.flapPower) * Math.min(1, dt * 2);
    this.wingPhase += dt * Math.PI * 2 * (0.62 + this.flapPower * 0.42);

    const beat = Math.sin(this.wingPhase);
    for (const wing of this.wings) {
      const amplitude = 0.2 + this.flapPower * 0.42;
      wing.joints[0].rotation.z = 0.12 + beat * amplitude;
      wing.joints[1].rotation.z = Math.sin(this.wingPhase - 0.9) * amplitude * 0.75 - 0.05;
      wing.joints[2].rotation.z = Math.sin(this.wingPhase - 1.7) * amplitude * 0.7 - 0.08;
      // Swept back in a dive.
      wing.joints[0].rotation.y = -diving * 0.5;
      wing.joints[1].rotation.y = -diving * 0.55;
    }
    this.body.position.y = -beat * 0.32 * this.flapPower;

    this.sway += (-this.roll * 2.3 - this.sway) * Math.min(1, dt * 3.5);
    this.nod += (-this.pitch * 1.6 - this.nod) * Math.min(1, dt * 3);
    const lag = Math.sin(this.wingPhase - 0.6) * 0.25 * this.flapPower;
    for (let index = 0; index <= NECK_SEGMENTS; index += 1) {
      const along = index / NECK_SEGMENTS;
      this.neckPoints[index].set(
        this.sway * along * along,
        0.35 + Math.sin(along * Math.PI) * 0.95 - along * 0.55 + (this.nod + lag) * along * along,
        -1.0 - NECK_LENGTH * along,
      );
    }
    for (const [index, segment] of this.neck.entries()) {
      const from = this.neckPoints[index];
      const to = this.neckPoints[index + 1];
      segment.position.copy(from).add(to).multiplyScalar(0.5);
      segment.quaternion.setFromRotationMatrix(this.basis.lookAt(to, from, THREE.Object3D.DEFAULT_UP));
    }

    const tip = this.neckPoints[NECK_SEGMENTS];
    const before = this.neckPoints[NECK_SEGMENTS - 1];
    this.head.position.copy(tip).addScaledVector(this.scratch.copy(tip).sub(before).normalize(), 0.9);
    this.head.rotation.set(-this.nod * 0.12 - 0.08, -this.sway * 0.1, this.roll * -0.25, 'YXZ');

    this.jawOpen += ((input.breathing ? 0.55 : 0.04) - this.jawOpen) * Math.min(1, dt * 12);
    this.jaw.rotation.x = -this.jawOpen;

    this.rig.updateMatrixWorld(true);
    this.mouth.set(0, -0.35, -3.3).applyMatrix4(this.head.matrixWorld);

    for (const [index, line] of this.reins.entries()) {
      const side = index === 0 ? -1 : 1;
      const attribute = line.geometry.attributes.position as THREE.BufferAttribute;
      const start = this.scratch.set(side * 0.28, 1.5, 0.1);
      const end = new THREE.Vector3(side * 0.7, -0.1, -1.6).applyMatrix4(this.head.matrix);
      for (let point = 0; point < 8; point += 1) {
        const along = point / 7;
        attribute.setXYZ(
          point,
          start.x + (end.x - start.x) * along,
          start.y + (end.y - start.y) * along - Math.sin(along * Math.PI) * 0.7,
          start.z + (end.z - start.z) * along,
        );
      }
      attribute.needsUpdate = true;
    }
  }
}
