import test from 'node:test';
import assert from 'node:assert/strict';
import { compactPreviewCaptions, previewCaptionRowsForCandidate, previewCaptionWordsForCandidate, previewPlaybackWords } from './preview-caption-timeline.js';
import { compactCaptionRows, compactCaptionWords } from '../server/video/captions.js';

test('preview and export preserve distinct accented words and merge accented duplicates alike', () => {
  for (const tokens of [['a', 'à'], ['ou', 'où'], ['à', 'À,'], ['été', 'ÉTÉ!'], ['你好', '你好']]) {
    const words = tokens.map((word, index) => ({ word, start: index * .25, end: index * .25 + .2 }));
    const transcript = { words };
    const before = structuredClone(transcript);
    const preview = previewCaptionWordsForCandidate({ start: 0, end: 2 }, transcript);
    const exported = compactCaptionWords(words, { minWords: 1 }).flatMap(row => row.words);
    assert.deepEqual(preview, exported, tokens.join(' / '));
    assert.deepEqual(preview.map(word => word.word), tokens[0] === 'a' || tokens[0] === 'ou' ? tokens : [tokens[0]]);
    assert.deepEqual(transcript, before);
  }
});

test('row-only preview supplies playback words within each caption window, preserving pauses', () => {
  const candidate = { start: 10, end: 16 };
  const transcript = { captions: [
    { start: 10, end: 12, text: 'Hello there.' },
    { start: 14, end: 16, text: 'Welcome back' },
  ] };
  const rows = previewCaptionRowsForCandidate(candidate, transcript);
  const before = structuredClone(rows);
  const words = previewPlaybackWords(rows, previewCaptionWordsForCandidate(candidate, transcript));
  assert.deepEqual(words, [
    { word: 'Hello', start: 0, end: 1 },
    { word: 'there.', start: 1, end: 2 },
    { word: 'Welcome', start: 4, end: 5 },
    { word: 'back', start: 5, end: 6 },
  ]);
  assert.equal(words.some(word => word.start <= 3 && word.end >= 3), false);
  assert.deepEqual(rows, before);
});

test('playback retains exact word timestamps and supports legacy caption rows', () => {
  const exact = [{ word: 'Hello', start: .2, end: .4 }];
  assert.equal(previewPlaybackWords([{ text: 'Different', start: 0, end: 1 }], exact), exact);
  const candidate = { start: 10, end: 12, captions: [{ text: 'Legacy captions', start: 0, end: 2 }] };
  assert.deepEqual(previewPlaybackWords(previewCaptionRowsForCandidate(candidate), []), [
    { word: 'Legacy', start: 0, end: 1 }, { word: 'captions', start: 1, end: 2 },
  ]);
  assert.deepEqual(previewPlaybackWords([], []), []);
  assert.deepEqual(previewPlaybackWords([
    { text: '', start: 0, end: 1 }, { text: 'Invalid', start: 2, end: 1 },
    { text: 'Invalid', start: NaN, end: 1 },
  ], []), []);
});

test('preview phrases match export word grouping across pauses and sentence boundaries', () => {
  const candidate = { start: 10, end: 16 };
  const transcript = {
    captions: [{ start: 10, end: 16, text: 'Hello there. Later we go' }],
    words: [
      { start: 10, end: 10.3, word: 'Hello' },
      { start: 10.32, end: 10.7, word: 'there.' },
      { start: 12, end: 12.3, word: 'Later' },
      { start: 14, end: 14.2, word: 'we' },
      { start: 14.25, end: 14.6, word: 'go' },
    ],
  };
  const before = structuredClone(transcript);
  const rows = previewCaptionRowsForCandidate(candidate, transcript);
  assert.deepEqual(rows.map(row => row.text), ['Hello there.', 'Later', 'we go']);
  assert.equal(rows[1].start, 2);
  assert.equal(rows[1].end, 2.3);
  assert.deepEqual(rows, compactCaptionWords(transcript.words.map(word => ({
    ...word, start: word.start - 10, end: word.end - 10,
  })), { maxWords: 4, maxChars: 22, minWords: 1, maxGap: .14 }));
  assert.deepEqual(transcript, before);
});

test('word-only transcripts produce preview phrases clipped to the selected video range', () => {
  const rows = previewCaptionRowsForCandidate({ start: 10, end: 12 }, { rawWords: [
    { start: 9.8, end: 10.2, word: 'Hello' },
    { start: 11.5, end: 12.5, word: 'world' },
    { start: 13, end: 14, word: 'Outside' },
  ] });
  assert.deepEqual(rows.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 0, end: .2, text: 'Hello' },
    { start: 1.5, end: 2, text: 'world' },
  ]);
});

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


test('row-only preview matches export without interpolating speech across silence', () => {
  const candidate = { start: 10, end: 16 };
  const transcript = { captions: [
    { start: 10, end: 11, text: 'Hello' },
    { start: 14, end: 16, text: 'world again' },
  ] };
  const before = structuredClone(transcript);
  const rows = previewCaptionRowsForCandidate(candidate, transcript);
  assert.deepEqual(rows, [
    { start: 0, end: 1, text: 'Hello' },
    { start: 4, end: 6, text: 'world again' },
  ]);
  assert.deepEqual(rows, compactCaptionRows(transcript.captions.map(row => ({
    ...row, start: row.start - 10, end: row.end - 10,
  })), { maxWords: 4, maxChars: 22, minWords: 2, maxGap: .14 }));
  const words = previewPlaybackWords(rows, []);
  assert.equal(words.some(word => word.start < 4 && word.end > 1), false);
  assert.equal(words.find(word => word.word === 'world').start, 4);
  assert.deepEqual(transcript, before);
  assert.deepEqual(previewCaptionRowsForCandidate({ ...candidate, captions: rows }), rows);
});

test('row-only grouping preserves sentence ends and the export silence threshold', () => {
  assert.deepEqual(compactPreviewCaptions([
    { start: 0, end: .5, text: 'Stop.' },
    { start: .5, end: 1, text: 'Next' },
    { start: 1.15, end: 2, text: 'Later' },
  ]).map(row => row.text), ['Stop.', 'Next', 'Later']);
});
