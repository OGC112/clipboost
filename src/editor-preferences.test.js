import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildEditorPreferences } from './editor-preferences.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const persistSource = source.split('\n').find(line => line.includes('function persistEditorPrefs()'));

test('actual persistence writes settings without an ambient campaign variable', () => {
  const writes = [];
  const state = { captionPreference: 'off', captionColor: 'yellow', hookTitleText: 'Saved hook', studioMode: 'long' };
  const context = vm.createContext({ state, buildEditorPreferences,
    localStorage: { setItem: (key, value) => writes.push([key, JSON.parse(value)]) },
  });
  vm.runInContext(persistSource, context);
  context.persistEditorPrefs();
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0], 'clipboost:editorPrefs');
  assert.deepEqual(writes[0][1], JSON.parse(JSON.stringify(buildEditorPreferences(state))));
  assert.equal(writes[0][1].hookTitleText, 'Saved hook');
  context.localStorage.setItem = () => { throw new Error('Storage unavailable'); };
  assert.doesNotThrow(() => context.persistEditorPrefs());
});

for (const campaign of [{}, { campaign: { id: 'campaign-1' } }, { campaignId: 'campaign-1' }]) {
  test(`full-source preference derives context from ${JSON.stringify(campaign)}`, () => {
    const state = { video: { ...campaign, candidates: [{ keepFullSource: false }, { keepFullSource: true }] }, selectedCandidate: 1 };
    const snapshot = buildEditorPreferences(state);
    assert.equal(snapshot.keepFullSource, !campaign.campaign && !campaign.campaignId);
    assert.equal(state.video.candidates[1].keepFullSource, true);
    state.selectedCandidate = 0;
    assert.equal(buildEditorPreferences(state).keepFullSource, false);
  });
}

test('snapshot retains defaults, numeric conversions and custom caption semantics', () => {
  const defaults = buildEditorPreferences({});
  assert.equal(defaults.captionY, null);
  assert.equal(defaults.hookTitleX, .5);
  assert.equal(defaults.watermarkOpacity, .9);
  assert.equal(defaults.sourceSubtitleMode, 'keep');
  for (const value of [null, undefined, '', '  ', 'invalid', Infinity]) {
    assert.equal(buildEditorPreferences({ captionY: value }).captionY, null);
  }
  for (const value of [0, '0.37', 1]) {
    assert.equal(buildEditorPreferences({ captionY: value }).captionY, Number(value));
  }
  const state = { hookTitleDuration: 7, captionScale: '1.2', watermarkName: 'Logo', sourceSubtitleMode: 'crop' };
  const snapshot = buildEditorPreferences(state);
  assert.equal(snapshot.hookTitleDuration, '7');
  assert.equal(snapshot.captionScale, 1.2);
  assert.equal(snapshot.sourceSubtitleMode, 'crop');
  state.watermarkName = 'Later';
  assert.equal(snapshot.watermarkName, 'Logo');
});
