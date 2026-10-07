import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSilences, parseScenes, transcriptPauseRanges } from './analysis.js';

test('FFmpeg silence parser returns ranges', () => {
  const rows=parseSilences('[silencedetect] silence_start: 1.25\n[silencedetect] silence_end: 2.75 | silence_duration: 1.5');
  assert.deepEqual(rows,[{start:1.25,end:2.75}]);
});

test('FFmpeg scene parser returns unique timestamps', () => {
  const rows=parseScenes('showinfo pts_time:1.20 x\nshowinfo pts_time:2.50 x\nshowinfo pts_time:2.50 x');
  assert.deepEqual(rows,[1.2,2.5]);
});


test('transcript pause detector finds speech gaps when FFmpeg silence is unavailable', () => {
  const transcript={rawWords:[
    {word:'one',start:0.00,end:0.28},
    {word:'two',start:0.35,end:0.62},
    {word:'three',start:1.22,end:1.48},
    {word:'four',start:1.56,end:1.80}
  ]};
  const rows=transcriptPauseRanges(transcript,0,2,.48,3.5);
  assert.deepEqual(rows,[{start:.62,end:1.22,duration:.6,source:'transcript'}]);
});

test('transcript pause detector ignores normal word spacing and excessively long gaps', () => {
  const transcript={words:[
    {word:'one',start:0,end:.2},
    {word:'two',start:.35,end:.55},
    {word:'three',start:5,end:5.2}
  ]};
  assert.deepEqual(transcriptPauseRanges(transcript,0,6,.48,3.5),[]);
});
