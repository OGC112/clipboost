import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRenderTitleOverlay, shouldRenderAssOverlay } from './hook-render.js';

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
