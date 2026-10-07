import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCaptionRows, compactCaptionWords } from './captions.js';

test('keeps a short natural caption intact',()=>{
  const rows=compactCaptionRows([{start:0,end:1,text:'Short caption'}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].text,'Short caption');
});

test('groups common phrases coherently',()=>{
  const rows=compactCaptionRows([{start:0,end:4,text:'Thank you so much you want to switch'}],{maxWords:4,maxChars:22});
  assert.deepEqual(rows.map(x=>x.text),['Thank you','so much','you want to','switch']);
  assert.equal(rows[0].start,0);
  assert.equal(rows.at(-1).end,4);
});

test('never produces oversized social bursts',()=>{
  const rows=compactCaptionRows([{start:0,end:5,text:'this is a deliberately long caption that should become several readable social bursts'}],{maxWords:4,maxChars:22});
  assert.ok(rows.length>1);
  assert.ok(rows.every(x=>x.text.split(/\s+/).length<=4));
  assert.ok(rows.every(x=>x.text.length<=22));
});

test('respects pauses between caption rows',()=>{
  const rows=compactCaptionRows([
    {start:0,end:1,text:'thank you'},
    {start:1.1,end:2,text:'so much'},
    {start:3,end:4,text:'you want to switch'}
  ],{maxWords:4,maxChars:22,maxGap:.42});
  assert.deepEqual(rows.map(x=>x.text),['thank you','so much','you want to','switch']);
  assert.ok(rows[2].start>=3);
});


test('uses exact word timing and splits visible captions across speech gaps',()=>{
  const rows=compactCaptionWords([
    {word:'Hello',start:.42,end:.73},
    {word:'there',start:.76,end:1.02},
    {word:'again',start:1.55,end:1.82}
  ],{maxWords:4,maxChars:22,maxGap:.14});
  assert.equal(rows.length,2);
  assert.equal(rows[0].start,.42);
  assert.equal(rows[0].end,1.02);
  assert.equal(rows[1].start,1.55);
  assert.equal(rows[1].end,1.82);
});

test('does not extend a caption before the first spoken word',()=>{
  const rows=compactCaptionWords([
    {word:'Start',start:1.2,end:1.46},
    {word:'now',start:1.49,end:1.7}
  ]);
  assert.equal(rows[0].start,1.2);
  assert.equal(rows[0].end,1.7);
});


test('deduplicates tightly repeated caption words',()=>{
  const rows=compactCaptionWords([
    {word:'trade',start:.10,end:.34},
    {word:'trade',start:.35,end:.56},
    {word:'bro',start:.58,end:.82}
  ],{maxWords:4,maxChars:22,maxGap:.14});
  assert.equal(rows.length,1);
  assert.equal(rows[0].text,'trade bro');
  assert.equal(rows[0].words.length,2);
});

test('keeps intentional repeated words separated by a pause',()=>{
  const rows=compactCaptionWords([
    {word:'go',start:.10,end:.28},
    {word:'go',start:.58,end:.76}
  ],{maxWords:4,maxChars:22,maxGap:.14});
  assert.deepEqual(rows.map(x=>x.text),['go','go']);
});
