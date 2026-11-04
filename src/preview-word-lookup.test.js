import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewWordLookup } from './preview-word-lookup.js';

const original = (words, time) => words.findIndex(word =>
  time >= Number(word.start || 0) - .01 && time <= Number(word.end || 0) + .035);

test('lookup preserves boundaries, gaps, overlapping windows and backward seeks', () => {
  for (const words of [[],
    [{ start: 0, end: .5 }, { start: .5, end: 1 }, { start: 2, end: 3 }],
    [{ start: 0, end: 5 }, { start: 1, end: 2 }, { start: 3, end: 4 }],
    [{ start: 0, end: 1 }, { start: 0, end: 2 }, { start: 0, end: 3 }],
    [{ start: 2, end: 3 }, { start: 0, end: 1 }],
    [{ start: '0', end: '1' }, { start: 2, end: 'invalid' }, { start: 3, end: 4 }],
    [{ start: 'invalid', end: 1 }, { start: 2, end: 3 }],
  ]) {
    const before = structuredClone(words);
    const lookup = createPreviewWordLookup(words);
    const times = [-1, 0, .49, .5, .535, .536, 1.035, 1.036, 1.99, 2, 3, 5.035, 6, NaN];
    for (let index = 0; index <= 600; index++) times.push(index / 100);
    for (const time of [...times, ...times.reverse()]) {
      assert.equal(lookup(time), original(words, time), `time=${time}, words=${JSON.stringify(words)}`);
    }
    assert.deepEqual(words, before);
  }
});

test('playback queries do not reread the entire word timeline', () => {
  let reads = 0;
  const words = Array.from({ length: 10000 }, (_, index) => ({
    get start() { reads++; return index; },
    get end() { reads++; return index + .5; },
  }));
  const lookup = createPreviewWordLookup(words);
  assert.equal(reads, 20000);
  for (let index = 9999; index >= 0; index -= 13) {
    assert.equal(lookup(index + .25), index);
    assert.equal(lookup(index + .75), -1);
  }
  assert.equal(reads, 20000);
});
