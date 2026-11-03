import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildRenderOptions } from './editor-render-options.js';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('  function hasCustomCaptionY('), source.indexOf('  function liveCaptionClass('));

function setup(captionPosition, captionY) {
  const state = { captionPosition, captionY };
  const context = vm.createContext({ state });
  vm.runInContext(helpers, context);
  return { state, context };
}

for (const [position, expected] of [['top', .18], ['center', .5], ['bottom', .82]]) {
  test(`${position} preset survives saving and restoring without a custom position`, () => {
    const { state, context } = setup(position, null);
    const persist = source.slice(source.indexOf('  function persistEditorPrefs('), source.indexOf('\n', source.indexOf('  function persistEditorPrefs(')));
    let saved;
    context.isCampaign = false;
    context.localStorage = { setItem: (key, value) => { saved = JSON.parse(value); } };
    vm.runInContext(persist, context);
    context.persistEditorPrefs();
    assert.equal(saved.captionY, null);
    // Execute the actual preference initialization expression on the saved value.
    context.editorPrefs = saved;
    state.captionY = vm.runInContext(source.match(/captionY:(hasCustomCaptionY\(editorPrefs.captionY\)\?Number\(editorPrefs.captionY\):null)/)[1], context);
    assert.equal(context.hasCustomCaptionY(state.captionY), false);
    assert.equal(context.currentCaptionY(), expected);
    assert.equal(buildRenderOptions(state, context.currentCaptionY()).captionY, expected);
    const select = source.match(/<select id="captionPositionSelect">([\s\S]*?)<\/select>/)[1];
    const markup = vm.runInContext('`' + select + '`', context);
    assert.match(markup, new RegExp(`value="${position}" selected`));
    assert.doesNotMatch(markup, /value="custom"/);
  });
}

test('dragged caption positions override presets and remain clamped', () => {
  const { state, context } = setup('bottom', .37);
  for (const [value, expected] of [[.37, .37], ['0.63', .63], [0, .12], [1, .88]]) {
    state.captionY = value;
    assert.equal(context.hasCustomCaptionY(state.captionY), true);
    assert.equal(context.currentCaptionY(), expected);
  }
});

test('missing or invalid custom positions fall back to the selected preset', () => {
  const { state, context } = setup('bottom', null);
  for (const value of [null, undefined, '', ' ', 'invalid', NaN, Infinity]) {
    state.captionY = value;
    assert.equal(context.hasCustomCaptionY(state.captionY), false);
    assert.equal(context.currentCaptionY(), .82);
  }
});
