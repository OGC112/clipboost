import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRenderOptions } from './editor-render-options.js';

test('empty editor retains the request defaults', () => {
  assert.deepEqual(buildRenderOptions({}, .82), {
    autoDirector: true, editorContext: 'general', outputFormat: 'shorts-9x16',
    captionPreference: 'auto', captionColor: 'auto', captionStyle: 'bold',
    captionFont: 'social', captionEffect: 'active-word',
    hookTitleEnabled: false, hookTitleText: '', hookTitleDuration: '5',
    hookTitleScale: 1, hookTitleX: .5, hookTitleY: .12,
    captionSize: 'medium', captionScale: 1, captionPosition: 'bottom', captionY: .82,
    sourceSubtitleMode: 'keep', sourceSubtitleBottom: .15,
    watermarkUrl: '', watermarkX: .86, watermarkY: .12,
    watermarkScale: .18, watermarkOpacity: .9,
  });
});

test('general long video uses source format and preserves subtitle crop', () => {
  const options = buildRenderOptions({ studioMode: 'long', sourceSubtitleMode: 'crop' }, .3);
  assert.equal(options.outputFormat, 'source');
  assert.equal(options.editorContext, 'general');
  assert.equal(options.sourceSubtitleMode, 'crop');
  assert.equal(options.captionY, .3);
});

for (const video of [{ campaign: { id: 'campaign-1' } }, { campaignId: 'campaign-1' }]) {
  test(`campaign ${Object.keys(video)[0]} forces shorts and keeps source subtitles`, () => {
    const state = { video, studioMode: 'long', sourceSubtitleMode: 'hide' };
    const options = buildRenderOptions(state, .5);
    assert.equal(options.outputFormat, 'shorts-9x16');
    assert.equal(options.editorContext, 'campaign');
    assert.equal(options.sourceSubtitleMode, 'keep');
    assert.equal(state.sourceSubtitleMode, 'hide');
  });
}

test('caption, hook and watermark edits reach a fresh request snapshot', () => {
  const state = {
    captionPreference: 'off', captionColor: '#123456', captionStyle: 'minimal',
    captionFont: 'impact', captionEffect: 'word-pop', captionSize: 'large',
    captionScale: '1.2', captionPosition: 'top', sourceSubtitleBottom: '.2',
    hookTitleEnabled: true, hookTitleText: 'A hook', hookTitleDuration: 7,
    hookTitleScale: '1.4', hookTitleX: '.3', hookTitleY: '.4',
    watermarkUrl: '/watermark.png', watermarkX: '.2', watermarkY: '.3',
    watermarkScale: '.25', watermarkOpacity: '.7',
  };
  const options = buildRenderOptions(state, .24);
  for (const key of Object.keys(state)) {
    const expected = key === 'hookTitleDuration' ? '7'
      : typeof options[key] === 'number' ? Number(state[key]) : state[key];
    assert.equal(options[key], expected, key);
  }
  state.hookTitleText = 'Later edit';
  assert.equal(options.hookTitleText, 'A hook');
  assert.equal(buildRenderOptions(state, .24).hookTitleText, 'Later edit');
});
