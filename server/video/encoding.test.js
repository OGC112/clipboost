import test from 'node:test';
import assert from 'node:assert/strict';
import { videoEncodingArgs } from './encoding.js';
test('final exports prioritize detail and retain compatible H264 AAC',()=>{
 const a=videoEncodingArgs({preview:false,hasAudio:true});
 assert.deepEqual(a.slice(0,8),['-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p']);
 assert.ok(a.includes('192k'));
});
test('previews remain fast',()=>{
 const a=videoEncodingArgs({preview:true,hasAudio:true});
 assert.ok(a.includes('ultrafast'));assert.ok(a.includes('28'));assert.ok(a.includes('96k'));
});
test('silent sources do not synthesize audio',()=>{
 const a=videoEncodingArgs({hasAudio:false});assert.ok(a.includes('-an'));assert.ok(!a.includes('-c:a'));
});
