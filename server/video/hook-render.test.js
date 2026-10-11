import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRenderTitleOverlay, shouldRenderAssOverlay, shouldIncludeEditedCaptions } from './hook-render.js';

test('requested Hook renders in export even with no captions or transcript', () => {
  const options={hookTitleEnabled:true,hookTitleText:'WAIT FOR IT',captions:false};
  assert.equal(shouldRenderTitleOverlay(options),true);
  assert.equal(shouldRenderAssOverlay(options,null),true);
  assert.equal(shouldRenderAssOverlay(options,{captions:[]}),true);
});
test('captions alone still render without Hook',()=>{
  const options={hookTitleEnabled:false,hookTitleText:'',captions:true};
  assert.equal(shouldRenderAssOverlay(options,{captions:[{text:'Hello'}]}),true);
  assert.equal(shouldRenderAssOverlay(options,{captions:[]}),false);
});
test('disabled or empty Hook does not create an overlay',()=>{
  assert.equal(shouldRenderAssOverlay({hookTitleEnabled:false,hookTitleText:'Not shown',captions:false},null),false);
  assert.equal(shouldRenderAssOverlay({hookTitleEnabled:true,hookTitleText:'  ',captions:false},null),false);
});

test('Captions Off never writes transcription captions even with Hook enabled',()=>{
  assert.equal(shouldIncludeEditedCaptions({captions:false,captionPreference:'off'}),false);
  assert.equal(shouldIncludeEditedCaptions({captions:true,captionPreference:'off'}),false);
  assert.equal(shouldRenderAssOverlay({captions:false,hookTitleEnabled:true,hookTitleText:'LACY'}, {captions:[{text:'Speech'}]}),true);
});
test('captions remain available for Auto and On when enabled',()=>{
  assert.equal(shouldIncludeEditedCaptions({captions:true,captionPreference:'auto'}),true);
  assert.equal(shouldIncludeEditedCaptions({captions:true,captionPreference:'on'}),true);
  assert.equal(shouldIncludeEditedCaptions({captions:false,captionPreference:'on'}),false);
});
