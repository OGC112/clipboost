import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCaptionRows } from './captions.js';

test('compactCaptionRows keeps short captions unchanged',()=>{
  const rows=compactCaptionRows([{start:0,end:1,text:'Short caption'}]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].text,'Short caption');
});

test('compactCaptionRows splits long captions into short timed chunks',()=>{
  const rows=compactCaptionRows([{start:0,end:4,text:'one two three four five six seven eight nine ten eleven'}],{maxWords:5,maxChars:40});
  assert.equal(rows.length,3);
  assert.ok(rows.every(x=>x.text.split(/\s+/).length<=5));
  assert.equal(rows[0].start,0);
  assert.equal(rows.at(-1).end,4);
});
