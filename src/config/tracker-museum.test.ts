import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credit, eras, exhibits, yearLabel, type Exhibit } from './tracker-museum.ts';

test('eras run in order without gaps or overlap, and only the last is open-ended', () => {
  for (const [index, era] of eras.entries()) {
    const next = eras[index + 1];
    if (!next) {
      assert.equal(era.to, undefined, `${era.id} is the last era and should be open-ended`);
      continue;
    }
    assert.ok(era.to !== undefined && era.from <= era.to, `${era.id} needs a closed range`);
    assert.equal(next.from, era.to + 1, `${next.id} should start the year after ${era.id} ends`);
  }
});

test('every exhibit sits in the era its year belongs to, and every era has exhibits', () => {
  for (const exhibit of exhibits) {
    const era = eras.find((candidate) => candidate.id === exhibit.era);
    assert.ok(era, `${exhibit.title}: unknown era ${exhibit.era}`);
    assert.ok(exhibit.year >= era.from && exhibit.year <= (era.to ?? Infinity), `${exhibit.title} (${exhibit.year}) is outside ${era.id}`);
  }
  for (const era of eras) assert.ok(exhibits.some((exhibit) => exhibit.era === era.id), `${era.id} has no exhibits`);
});

test('exhibits are listed oldest first and no module appears twice', () => {
  const years = exhibits.map((exhibit) => exhibit.year);
  assert.deepEqual(years, [...years].sort((a, b) => a - b));
  const ids = exhibits.map((exhibit) => exhibit.modarchiveId);
  assert.equal(new Set(ids).size, ids.length);
});

test('every exhibit carries a credit, an origin, and a reason to be here', () => {
  for (const exhibit of exhibits) {
    assert.ok(Number.isInteger(exhibit.modarchiveId) && exhibit.modarchiveId > 0, `${exhibit.title}: module id`);
    for (const key of ['title', 'artist', 'format', 'origin', 'blurb'] as const) {
      assert.ok(exhibit[key].trim(), `${exhibit.title}: ${key} is empty`);
    }
  }
});

test('credit and yearLabel format the placard lines', () => {
  const base: Exhibit = { modarchiveId: 1, title: 'T', artist: 'Handle', year: 1990, era: 'amiga-golden', format: 'MOD', origin: 'o', blurb: 'b' };
  assert.equal(credit(base), 'Handle');
  assert.equal(credit({ ...base, artistName: 'Real Name', group: 'Crew' }), 'Handle (Real Name) · Crew');
  assert.equal(yearLabel(base), '1990');
  assert.equal(yearLabel({ ...base, circa: true }), 'c. 1990');
});
