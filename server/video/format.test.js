import test from 'node:test';
import assert from 'node:assert/strict';
import { renderDimensions } from './format.js';

test('shorts format is vertical 9:16',()=>{
  assert.deepEqual(renderDimensions({details:{width:1920,height:1080}},{outputFormat:'shorts-9x16'},{preview:false}),{width:1080,height:1920,format:'shorts-9x16',aspect:'9:16'});
  assert.deepEqual(renderDimensions({}, {outputFormat:'shorts-9x16'},{preview:true}),{width:540,height:960,format:'shorts-9x16',aspect:'9:16'});
});

test('source format preserves landscape aspect',()=>{
  assert.deepEqual(renderDimensions({details:{width:1920,height:1080}},{outputFormat:'source'},{preview:false}),{width:1920,height:1080,format:'source',aspect:'source'});
  assert.deepEqual(renderDimensions({details:{width:1920,height:1080}},{outputFormat:'source'},{preview:true}),{width:960,height:540,format:'source',aspect:'source'});
});
