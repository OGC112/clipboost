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

test('hook edits discard baked final previews and invalidate pending render responses', async () => {
  const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const start = source.indexOf('    const updateHookTitlePreview=');
  const invalidateStart = source.indexOf('    function invalidateRenderedPreviews()');
  const candidate = { start: 0, end: 10, previewUrl: '/old-hook.mp4', previewMeta: {} };
  const state = { ...enabled, previewFinalMode: true, candidatePreviewRequestId: 7,
    video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [candidate] } };
  const displayed = [], requests = [];
  const hook = { style: {} };
  const context = vm.createContext({ state, isPreviewHookVisible,
    document: { getElementById: () => hook },
    render: () => displayed.push(candidate.previewUrl),
    currentRenderOptions: () => ({}), readJsonResponse: async response => response,
    fetch: () => new Promise(resolve => requests.push(resolve)),
  });
  vm.runInContext(source.slice(invalidateStart, source.indexOf('\n', invalidateStart)) + '\n' +
    source.slice(source.indexOf('  async function prepareCandidatePreview('), source.indexOf('  function selectCandidatePreview(')) + '\n' +
    source.slice(start, source.indexOf('    const hookTitleEnabledSelect=', start)) +
    '\nglobalThis.update = updateHookTitlePreview;', context);
  const pending = context.prepareCandidatePreview(0, { force: true });
  state.hookTitleText = 'Changed title';
  context.update();
  assert.equal(state.previewFinalMode, false);
  assert.equal(candidate.previewUrl, null);
  assert.equal(candidate.previewMeta, null);
  assert.equal(state.candidatePreviewLoading, false);
  assert.equal(displayed.at(-1), null, 'remove the video with the old title');
  const renders = displayed.length;
  requests[0]({ url: '/stale-final.mp4' });
  await pending;
  assert.equal(candidate.previewUrl, null, 'late final render must not restore the old title');
  assert.equal(displayed.length, renders);
  context.update();
  assert.equal(hook.textContent, 'CHANGED TITLE');
  assert.equal(displayed.length, renders, 'editable hook updates stay live');
});
