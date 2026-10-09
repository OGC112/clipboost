import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizePcmWaveform} from './audio-waveform.js';
test('silence renders a flat measured waveform',()=>{
 const b=Buffer.alloc(320);const result=summarizePcmWaveform(b,10,32);
 assert.equal(result.available,true);assert.ok(result.peaks.every(x=>x===0));assert.deepEqual(result.energyMoments,[]);
});
test('PCM spike creates a corresponding visual peak',()=>{
 const b=Buffer.alloc(320);for(let i=70;i<80;i++)b.writeInt16LE(25000,i*2);
 const w=summarizePcmWaveform(b,10,32);assert.ok(Math.max(...w.peaks)>.7);
});
test('empty sources have no invented energy',()=>assert.equal(summarizePcmWaveform(Buffer.alloc(0),10).available,false));
