import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const settingsStart = source.indexOf('    const saveLiveCaptionSettings=');
const settings = source.slice(settingsStart, source.indexOf('    const rerenderSourceSubtitlePreview=', settingsStart));
const invalidateStart = source.indexOf('    function invalidateRenderedPreviews()');
const invalidate = source.slice(invalidateStart, source.indexOf('\n', invalidateStart));
const preview = source.slice(source.indexOf('  async function prepareCandidatePreview('), source.indexOf('  function selectCandidatePreview('));
const schedulingStart = source.indexOf("    if((state.page==='studio'||state.page==='campaigns'||state.page==='campaign-editor')");
const scheduling = source.slice(schedulingStart, source.indexOf('    const publishBtn=', schedulingStart));

function setup(finalMode) {
  const candidate = { start: 2, end: 12, previewUrl: '/baked.mp4', previewMeta: { editApplied: { captions: true } } };
  const state = { page: 'studio', previewFinalMode: finalMode, candidatePreviewRequestId: 0,
    candidatePreviewVideoId: 'video-1', video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [candidate] } };
  const select = {}, timers = [], requests = [], displayed = [];
  let refreshes = 0, saves = 0, context;
  context = vm.createContext({ state, document: { getElementById: () => select },
    persistEditorPrefs: () => saves++, refreshLiveCaptionPreview: () => refreshes++,
    render: () => { displayed.push(candidate.previewUrl); vm.runInContext(scheduling, context); },
    setTimeout: callback => timers.push(callback),
    currentRenderOptions: () => ({ captionPreference: state.captionPreference, hookTitleEnabled: true, watermarkUrl: '/logo.png' }),
    readJsonResponse: async response => response,
    fetch: (url, init) => new Promise(resolve => requests.push({ url, body: JSON.parse(init.body), resolve })),
  });
  vm.runInContext(invalidate + '\n' + preview + '\n' + settings, context);
  return { state, candidate, select, timers, requests, displayed, refreshes: () => refreshes, saves: () => saves };
}

for (const preference of ['off', 'on', 'auto']) {
  test(`caption preference ${preference} replaces a baked final preview with an editable video`, async () => {
    const c = setup(true);
    c.select.onchange({ target: { value: preference } });
    assert.equal(c.state.previewFinalMode, false);
    assert.equal(c.state.captionPreference, preference);
    assert.equal(c.saves(), 1);
    assert.deepEqual(c.displayed, [null], 'the stale baked video must leave the screen');
    assert.equal(c.refreshes(), 0, 'the detached final-preview overlays must not be updated');
    assert.equal(c.timers.length, 1);
    const pending = c.timers.shift()();
    assert.equal(c.requests.length, 1);
    assert.equal(c.requests[0].url, '/api/videos/video-1/preview');
    assert.deepEqual(c.requests[0].body.options, { captionPreference: 'off', captions: false, hookTitleEnabled: false, watermarkUrl: '' });
    c.requests[0].resolve({ url: '/editable.mp4', render: { editApplied: { captions: false } } });
    await pending;
    assert.equal(c.candidate.previewUrl, '/editable.mp4');
    assert.equal(c.displayed.at(-1), '/editable.mp4');
    assert.equal(c.timers.length, 0, 'clean preview must not schedule another render');
    assert.equal(c.state.captionPreference, preference, 'overlay/export preference is retained');
  });
}

test('ordinary editable caption changes stay live without replacing the player', () => {
  const c = setup(false);
  c.select.onchange({ target: { value: 'off' } });
  assert.equal(c.refreshes(), 1);
  assert.equal(c.saves(), 1);
  assert.equal(c.state.captionPreference, 'off');
  assert.deepEqual(c.displayed, []);
  assert.equal(c.requests.length, 0);
  assert.equal(c.timers.length, 0);
});
