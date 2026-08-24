import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectRepos, type Repo } from './github.ts';

const repo = (name: string, overrides: Partial<Repo> = {}): Repo => ({
  name,
  html_url: `https://github.com/rwaterman/${name}`,
  description: null,
  language: null,
  homepage: null,
  pushed_at: '2026-01-01T00:00:00Z',
  fork: false,
  archived: false,
  ...overrides,
});

test('drops forks, archived, and hidden repos', () => {
  const repos = [repo('keep'), repo('fork', { fork: true }), repo('old', { archived: true }), repo('profile')];
  const names = selectRepos(repos, { pinned: [], hidden: ['profile'] }).map((r) => r.name);
  assert.deepEqual(names, ['keep']);
});

test('pinned first in pinned order, then most recently pushed, null pushed_at last', () => {
  const repos = [
    repo('older', { pushed_at: '2025-01-01T00:00:00Z' }),
    repo('empty', { pushed_at: null }),
    repo('newer', { pushed_at: '2026-06-01T00:00:00Z' }),
    repo('pin-b', { pushed_at: '2020-01-01T00:00:00Z' }),
    repo('pin-a', { pushed_at: '2019-01-01T00:00:00Z' }),
  ];
  const names = selectRepos(repos, { pinned: ['pin-a', 'pin-b'], hidden: [] }).map((r) => r.name);
  assert.deepEqual(names, ['pin-a', 'pin-b', 'newer', 'older', 'empty']);
});
