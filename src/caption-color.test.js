import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('changing a caption swatch does not reset typography or final preview mode',async()=>{
 const source=await fs.readFile(new URL('./app.js',import.meta.url),'utf8');
 const handler=source.split("document.querySelectorAll('[data-caption-color]').forEach(btn=>btn.onclick=")[1]?.split("document.querySelectorAll('[data-caption-preset]')")[0];
 assert.ok(handler,'caption swatch handler exists');
 assert.match(handler,/state\.captionColor=color/);
 assert.doesNotMatch(handler,/state\.caption(Font|Style|Effect)\s*=/);
 assert.doesNotMatch(handler,/saveLiveCaptionSettings\(/);
 assert.match(handler,/if\(state\.previewFinalMode\)/);
});
