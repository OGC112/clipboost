import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSilences, parseScenes } from './analysis.js';

test('FFmpeg silence parser returns ranges', () => {
  const rows=parseSilences('[silencedetect] silence_start: 1.25\n[silencedetect] silence_end: 2.75 | silence_duration: 1.5');
  assert.deepEqual(rows,[{start:1.25,end:2.75}]);
});

test('FFmpeg scene parser returns unique timestamps', () => {
  const rows=parseScenes('showinfo pts_time:1.20 x\nshowinfo pts_time:2.50 x\nshowinfo pts_time:2.50 x');
  assert.deepEqual(rows,[1.2,2.5]);
});
