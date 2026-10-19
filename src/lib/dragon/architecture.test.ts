import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blueprint, lastStage } from './architecture.ts';
import { generateTown, type Building } from './layout.ts';
import { TOWNS } from './terrain.ts';

const buildings: Building[] = TOWNS.flatMap((site, index) => generateTown(site, index).buildings);

test('the same building always gets the same parts', () => {
  for (const building of buildings.slice(0, 40)) {
    assert.deepEqual(blueprint(building), blueprint(building));
  }
});

test('every kind is built from several parts, with a foundation that stays and parts that fall', () => {
  for (const building of buildings) {
    const parts = blueprint(building);
    assert.ok(parts.length >= 6, `${building.kind} has only ${parts.length} parts`);
    assert.ok(parts.some((part) => part.stage === -1), `${building.kind} has no foundation`);
    assert.ok(lastStage(parts) >= 1, `${building.kind} falls in a single step`);
  }
});

test('roofs and spires go first; the walls under them fall later', () => {
  for (const building of buildings.filter((candidate) => candidate.kind === 'house' || candidate.kind === 'tower')) {
    const parts = blueprint(building);
    const firstToFall = parts.filter((part) => part.material === 'roof' || part.material === 'spire');
    assert.ok(firstToFall.length > 0);
    for (const part of firstToFall) assert.equal(part.stage, 0);
    const walls = parts.filter((part) => (part.material === 'plaster' || part.material === 'stone') && part.stage > 0);
    assert.ok(walls.length >= 4, `${building.kind} has ${walls.length} falling wall parts`);
  }
});

test('parts stay within the footprint, roof overhang included, and above the footing', () => {
  for (const building of buildings) {
    const reach = Math.hypot(building.width, building.depth) / 2 + 2;
    for (const part of blueprint(building)) {
      assert.ok(Math.hypot(part.x, part.z) <= reach, `${building.kind} part ${part.material} sticks out to ${Math.hypot(part.x, part.z).toFixed(1)}`);
      assert.ok(part.y - part.height / 2 >= -1.6, `${building.kind} part ${part.material} is buried`);
      assert.ok(part.y + part.height / 2 <= building.height + building.roof + 3.5, `${building.kind} part ${part.material} floats above the roof`);
      for (const value of [part.x, part.y, part.z, part.width, part.height, part.depth, part.yaw, part.pitch, part.roll]) {
        assert.ok(Number.isFinite(value));
      }
      assert.ok(part.width > 0 && part.height > 0 && part.depth > 0);
    }
  }
});

test('the three towns stay within an instance budget the GPU can draw every frame', () => {
  const total = buildings.reduce((sum, building) => sum + blueprint(building).length, 0);
  assert.ok(total < 20_000, `${total} parts`);
  assert.ok(total > 5000, `${total} parts is barely more than one box per building`);
});
