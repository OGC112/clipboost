import test from 'node:test';
import assert from 'node:assert/strict';
import { sortLibraryItems } from './library-sort.js';

const ids = items => items.map(item => item.id);

test('date sorting prefers publication date and falls back to creation date', () => {
  const items = [
    { id: 'published', publishedAt: '2026-01-02', createdAt: '2026-01-05' },
    { id: 'created', createdAt: '2026-01-03' },
    { id: 'missing' },
    { id: 'invalid', publishedAt: 'invalid' },
  ];
  assert.deepEqual(ids(sortLibraryItems(items, 'oldest')), ['missing', 'invalid', 'published', 'created']);
  for (const sort of ['newest', undefined, 'unknown']) {
    assert.deepEqual(ids(sortLibraryItems(items, sort)), ['created', 'published', 'missing', 'invalid']);
  }
});

test('view sorting accepts numeric strings and keeps ties in source order', () => {
  const items = [
    { id: 'ten', viewCount: '10' },
    { id: 'missing' },
    { id: 'two', viewCount: 2 },
    { id: 'zero', viewCount: 0 },
  ];
  assert.deepEqual(ids(sortLibraryItems(items, 'views-desc')), ['ten', 'two', 'missing', 'zero']);
  assert.deepEqual(ids(sortLibraryItems(items, 'views-asc')), ['missing', 'zero', 'two', 'ten']);
});

test('every sort preserves cached array order and media object identity', () => {
  const items = Object.freeze([
    Object.freeze({ id: 'first', publishedAt: '2026-01-01', viewCount: 1 }),
    Object.freeze({ id: 'second', publishedAt: '2026-01-02', viewCount: 2 }),
  ]);
  for (const sort of ['newest', 'oldest', 'views-asc', 'views-desc']) {
    const sorted = sortLibraryItems(items, sort);
    assert.notEqual(sorted, items);
    assert.deepEqual(ids(items), ['first', 'second']);
    for (const item of sorted) assert.equal(item, items.find(source => source.id === item.id));
    assert.deepEqual(sortLibraryItems([], sort), []);
  }
});
