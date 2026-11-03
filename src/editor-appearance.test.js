import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEditorAppearance } from './editor-appearance.js';
import { buildEditorPreferences } from './editor-preferences.js';
import { buildRenderOptions } from './editor-render-options.js';

test('saved and rendered appearance share defaults and edited values', () => {
  for (const state of [{}, {
    captionColor: '#123456', captionStyle: 'minimal', captionFont: 'impact',
    captionEffect: 'word-pop', captionSize: 'large', captionScale: '1.2',
    captionPosition: 'top', hookTitleEnabled: true, hookTitleText: 'A hook',
    hookTitleDuration: 7, hookTitleScale: '1.4', hookTitleX: '.3', hookTitleY: '.4',
    sourceSubtitleBottom: '.2', watermarkUrl: '/logo.png', watermarkX: '.2',
    watermarkY: '.3', watermarkScale: '.25', watermarkOpacity: '.7',
  }]) {
    const appearance = buildEditorAppearance(state);
    const preferences = buildEditorPreferences(state);
    const request = buildRenderOptions(state, .24);
    for (const [key, value] of Object.entries(appearance)) {
      assert.equal(preferences[key], value, `saved ${key}`);
      assert.equal(request[key], value, `rendered ${key}`);
    }
    appearance.hookTitleText = 'Changed snapshot';
    assert.notEqual(preferences.hookTitleText, appearance.hookTitleText);
    assert.notEqual(request.hookTitleText, appearance.hookTitleText);
  }
});

test('existing numeric fallback semantics remain unchanged', () => {
  const defaults = buildEditorAppearance({});
  for (const key of ['hookTitleScale', 'hookTitleX', 'hookTitleY', 'captionScale',
    'sourceSubtitleBottom', 'watermarkX', 'watermarkY', 'watermarkScale', 'watermarkOpacity']) {
    for (const value of [undefined, null, '', false, 0]) {
      assert.equal(buildEditorAppearance({ [key]: value })[key], defaults[key], key);
    }
    assert.equal(buildEditorAppearance({ [key]: '0' })[key], 0, key);
  }
});

test('campaign policy and custom caption positioning remain specific to each caller', () => {
  const state = {
    video: { campaignId: 'campaign-1', candidates: [{ keepFullSource: true }] },
    studioMode: 'long', sourceSubtitleMode: 'crop', captionY: null,
    watermarkName: 'My logo',
  };
  const appearance = buildEditorAppearance(state);
  const preferences = buildEditorPreferences(state);
  const request = buildRenderOptions(state, .82);
  assert.equal(preferences.sourceSubtitleMode, 'crop');
  assert.equal(request.sourceSubtitleMode, 'keep');
  assert.equal(preferences.captionY, null);
  assert.equal(request.captionY, .82);
  assert.equal(preferences.captionPreference, undefined);
  assert.equal(request.captionPreference, 'auto');
  assert.equal(preferences.keepFullSource, false);
  assert.equal(request.outputFormat, 'shorts-9x16');
  for (const key of ['sourceSubtitleMode', 'captionY', 'captionPreference',
    'keepFullSource', 'outputFormat', 'watermarkName', 'studioMode']) {
    assert.equal(Object.hasOwn(appearance, key), false, key);
  }
});
