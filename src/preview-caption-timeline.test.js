import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPreviewCaptions, previewCaptionRowsForCandidate, previewCaptionWordsForCandidate } from './preview-caption-timeline.js';

test('caption rows use the project transcript, clip to candidate time and leave inputs intact', () => {
  const candidate = { start: 10, end: 12, captions: [{ start: 0, end: 2, text: 'Legacy' }] };
  const transcript = { captions: [{ start: 9, end: 11, text: 'Hello' }, { start: 11, end: 13, text: 'world' }, { start: 15, end: 16, text: 'Outside' }] };
  const before = structuredClone({ candidate, transcript });
  assert.deepEqual(previewCaptionRowsForCandidate(candidate, transcript), [{ start: 0, end: 2, text: 'Hello world' }]);
  assert.deepEqual({ candidate, transcript }, before);
});

test('legacy candidate captions remain the fallback when no transcript rows overlap', () => {
  const candidate = { start: 10, end: 12, captions: [{ start: 0, end: 2, text: 'Legacy' }] };
  assert.deepEqual(previewCaptionRowsForCandidate(candidate), candidate.captions);
  assert.deepEqual(previewCaptionRowsForCandidate(candidate, { captions: [{ start: 20, end: 21, text: 'Outside' }] }), candidate.captions);
  assert.deepEqual(previewCaptionRowsForCandidate(null), []);
  assert.deepEqual(previewCaptionWordsForCandidate(null), []);
});

test('phrase grouping and word limits retain evenly distributed word timing', () => {
  assert.deepEqual(compactPreviewCaptions([{ start: 0, end: 4, text: 'Thank you very much' }], 2), [
    { start: 0, end: 2, text: 'Thank you' }, { start: 2, end: 4, text: 'very much' },
  ]);
  assert.deepEqual(compactPreviewCaptions([{ start: 0, end: 2, text: 'longword another' }], 4, 8), [
    { start: 0, end: 1, text: 'longword' }, { start: 1, end: 2, text: 'another' },
  ]);
});

test('word timeline sorts, clips, merges adjacent duplicates and preserves later repetitions', () => {
  const transcript = { rawWords: [
    { start: 11, end: 11.3, word: 'Hello' },
    { start: 9.8, end: 10.2, word: 'Hello,' },
    { start: 10.25, end: 10.5, word: 'hello' },
    { start: 11.5, end: 12.5, word: 'world' },
    { start: 13, end: 14, word: 'Outside' },
  ] };
  const before = structuredClone(transcript);
  assert.deepEqual(previewCaptionWordsForCandidate({ start: 10, end: 12 }, transcript), [
    { start: 0, end: .5, word: 'Hello,' },
    { start: 1, end: 11.3 - 10, word: 'Hello' },
    { start: 1.5, end: 2, word: 'world' },
  ]);
  assert.deepEqual(transcript, before);
});
