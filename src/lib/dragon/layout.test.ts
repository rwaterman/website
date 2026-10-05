import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundingRadius, generateTown } from './layout.ts';
import { TOWNS } from './terrain.ts';

test('the same seed builds the same town', () => {
  assert.deepEqual(generateTown(TOWNS[0], 0), generateTown(TOWNS[0], 0));
  assert.notDeepEqual(generateTown(TOWNS[0], 0).buildings, generateTown({ ...TOWNS[0], seed: 7 }, 0).buildings);
});

for (const [index, site] of TOWNS.entries()) {
  const town = generateTown(site, index);
  const free = town.buildings.filter((building) => !building.ring);

  test(`town ${index} is populated with every landmark`, () => {
    const count = (kind: string): number => town.buildings.filter((building) => building.kind === kind).length;
    assert.ok(count('house') >= site.houses * 0.8, `only ${count('house')} of ${site.houses} houses placed`);
    assert.equal(count('keep'), 1);
    assert.equal(count('hall'), 1);
    assert.ok(count('powder') >= 1);
    assert.ok(count('wall') > 10);
  });

  test(`town ${index} keeps everything but the windmills inside the walls`, () => {
    for (const building of free) {
      const distance = Math.hypot(building.x - site.x, building.z - site.z);
      if (building.kind === 'windmill') assert.ok(distance > site.radius + 10);
      else assert.ok(distance + boundingRadius(building) < site.radius, `${building.kind} at ${distance} breaches the wall`);
    }
  });

  test(`town ${index} has no overlapping buildings`, () => {
    for (const [first, a] of free.entries()) {
      for (const b of free.slice(first + 1)) {
        // The bell tower stands against the nave it belongs to.
        if (a.kind === 'hall' && b.kind === 'tower') continue;
        const gap = Math.hypot(a.x - b.x, a.z - b.z) - boundingRadius(a) - boundingRadius(b);
        assert.ok(gap >= 0, `${a.kind} and ${b.kind} overlap by ${-gap}`);
      }
    }
  });
}
