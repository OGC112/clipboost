import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isPreviewHookVisible } from './preview-hook-visibility.js';

const enabled = { hookTitleEnabled: true, hookTitleText: 'A hook' };

test('disabled and blank hooks stay hidden', () => {
  for (const state of [{}, { ...enabled, hookTitleEnabled: false },
    { ...enabled, hookTitleText: ' \n ' }, { ...enabled, hookTitleText: null }]) {
    assert.equal(isPreviewHookVisible(state, 0, 10), false);
  }
});

test('timed hooks include the endpoint and stop at the clip duration', () => {
  const state = { ...enabled, hookTitleDuration: '3' };
  assert.equal(isPreviewHookVisible(state, 3, 10), true);
  assert.equal(isPreviewHookVisible(state, 3.001, 10), false);
  assert.equal(isPreviewHookVisible(state, 2, 2), true);
  assert.equal(isPreviewHookVisible(state, 2.001, 2), false);
});

test('full duration and missing duration retain their existing timing', () => {
  assert.equal(isPreviewHookVisible({ ...enabled, hookTitleDuration: 'full' }, 12, 12), true);
  assert.equal(isPreviewHookVisible({ ...enabled, hookTitleDuration: 'full' }, 12.001, 12), false);
  assert.equal(isPreviewHookVisible(enabled, 5, 12), true);
  assert.equal(isPreviewHookVisible(enabled, 5.001, 12), false);
});

test('live control updates use current title settings and playback time', () => {
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const start = source.indexOf('    const updateHookTitlePreview=');
  const hook = { style: {} };
  const video = { currentTime: 4 };
  const state = { ...enabled, hookTitleDuration: '3', video: { candidates: [{ start: 20, end: 30 }] } };
  const context = vm.createContext({ state, isPreviewHookVisible,
    document: { getElementById: id => id === 'liveHookTitle' ? hook : video } });
  vm.runInContext(source.slice(start, source.indexOf('    const hookTitleEnabledSelect=', start)) +
    '\nglobalThis.update = updateHookTitlePreview;', context);
  context.update();
  assert.equal(hook.style.visibility, 'hidden');
  state.hookTitleDuration = 'full';
  context.update();
  assert.equal(hook.style.visibility, 'visible');
  assert.equal(hook.textContent, 'A HOOK');
  state.hookTitleText = '   ';
  context.update();
  assert.equal(hook.style.visibility, 'hidden');
});
