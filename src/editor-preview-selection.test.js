import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const previewSource = source.slice(source.indexOf('  async function prepareCandidatePreview('), source.indexOf('  let disposePreviewCaptionClock='));

function setup(renderOptions = {}) {
  const requests = [];
  let renders = 0;
  const state = {
    video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [
      { start: 0, end: 10 }, { start: 10, end: 20, previewUrl: '/cached.mp4' },
    ] },
    selectedCandidate: 0, candidatePreviewRequestId: 0,
  };
  const context = vm.createContext({
    state, render: () => renders++, currentRenderOptions: () => renderOptions,
    readJsonResponse: async response => response,
    fetch: (url, init) => new Promise((resolve, reject) => requests.push({ resolve, reject, body: JSON.parse(init.body) })),
  });
  vm.runInContext(previewSource, context);
  return { state, requests, context, renders: () => renders };
}

for (const data of [{}, null, { url: '' }, { url: '   ' }, { url: 42 }]) {
  test(`invalid preview response ${JSON.stringify(data)} shows a recoverable error`, async () => {
    const c = setup();
    const pending = c.context.prepareCandidatePreview(0, { autoplay: true });
    c.requests[0].resolve(data);
    await pending;
    assert.equal(c.state.candidatePreviewLoading, false);
    assert.equal(c.state.candidatePreviewAutoplay, false);
    assert.equal(c.state.video.candidates[0].previewUrl, undefined);
    assert.match(c.state.candidatePreviewError, /no playable preview.*Retry preview/);

    const retry = c.context.prepareCandidatePreview(0, { force: true });
    assert.equal(c.requests.length, 2);
    assert.equal(c.state.candidatePreviewError, '');
    c.requests[1].resolve({ url: '/recovered.mp4', edited: true });
    await retry;
    assert.equal(c.state.video.candidates[0].previewUrl, '/recovered.mp4');
    assert.equal(c.state.candidatePreviewLoading, false);
    assert.equal(c.state.candidatePreviewError, '');
  });
}

test('invalid response from a superseded preview cannot show an error on a cached clip', async () => {
  const c = setup();
  const pending = c.context.prepareCandidatePreview(0);
  c.context.selectCandidatePreview(1);
  const renders = c.renders();
  c.requests[0].resolve(null);
  await pending;
  assert.equal(c.renders(), renders);
  assert.equal(c.state.candidatePreviewError, '');
  assert.equal(c.state.video.candidates[1].previewUrl, '/cached.mp4');
});

for (const finalMode of [false, true]) {
  test(`${finalMode ? 'final' : 'editable'} preview renders hook, captions and watermark in the intended layer`, async () => {
    const options = {
      hookTitleEnabled: true, hookTitleText: 'Original hook', hookTitleX: .3,
      captionPreference: 'on', captions: true, watermarkUrl: '/watermark.png',
    };
    const c = setup(options);
    c.state.previewFinalMode = finalMode;
    const pending = c.context.prepareCandidatePreview(0);
    const sent = c.requests[0].body.options;
    assert.equal(sent.hookTitleEnabled, finalMode, 'editable preview must not retain a baked hook after moving or disabling its live overlay');
    assert.equal(sent.captionPreference, finalMode ? 'on' : 'off');
    assert.equal(sent.captions, finalMode);
    assert.equal(sent.watermarkUrl, finalMode ? '/watermark.png' : '');
    assert.equal(sent.hookTitleText, options.hookTitleText);
    assert.equal(sent.hookTitleX, options.hookTitleX);
    assert.equal(options.hookTitleEnabled, true, 'preview override must not disable the hook for export');
    c.requests[0].resolve({ url: '/preview.mp4', edited: true });
    await pending;
  });
}

for (const outcome of ['success', 'failure']) {
  test(`cached selection supersedes pending preview ${outcome}`, async () => {
    const c = setup();
    const pending = c.context.prepareCandidatePreview(0, { autoplay: true });
    assert.equal(c.state.candidatePreviewLoading, true);
    c.context.selectCandidatePreview(1, { autoplay: false });
    assert.equal(c.state.selectedCandidate, 1);
    assert.equal(c.state.timelineSeek, 10);
    assert.equal(c.state.candidatePreviewLoading, false);
    assert.equal(c.state.candidatePreviewLoadingIndex, -1);
    const renders = c.renders();
    if (outcome === 'success') c.requests[0].resolve({ url: '/late.mp4', edited: true });
    else c.requests[0].reject(new Error('Old preview failed'));
    await pending;
    assert.equal(c.renders(), renders, 'late response must not replace the selected player');
    assert.equal(c.state.candidatePreviewAutoplay, false);
    assert.equal(c.state.candidatePreviewError, '');
    assert.equal(c.state.video.candidates[1].previewUrl, '/cached.mp4');
    // Returning to the uncached clip still starts a fresh render normally.
    c.context.selectCandidatePreview(0, { autoplay: true });
    assert.equal(c.requests.length, 2);
    assert.equal(c.state.candidatePreviewLoading, true);
    c.requests[1].resolve({ url: '/fresh.mp4', edited: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(c.state.video.candidates[0].previewUrl, '/fresh.mp4');
    assert.equal(c.state.candidatePreviewAutoplay, true);
    assert.equal(c.state.candidatePreviewLoading, false);
  });
}

test('cached selection keeps the requested autoplay behavior without another render request', () => {
  const c = setup();
  c.context.selectCandidatePreview(1, { autoplay: true });
  assert.equal(c.requests.length, 0);
  assert.equal(c.state.candidatePreviewAutoplay, true);
  assert.equal(c.state.video.candidates[1].previewUrl, '/cached.mp4');
});

for (const outcome of ['success', 'failure']) {
  for (const startNewPreview of [false, true]) {
    test(`project switch ignores old preview ${outcome}, new request: ${startNewPreview}`, async () => {
      const c = setup();
      const pending = c.context.prepareCandidatePreview(0, { autoplay: true });
      c.state.video = { id: 'video-2', sourceUrl: '/second.mp4', candidates: [{ start: 0, end: 8 }] };
      let next;
      if (startNewPreview) {
        next = c.context.prepareCandidatePreview(0);
        assert.equal(c.requests.length, 2, 'another project must not share the loading guard');
        assert.equal(c.state.candidatePreviewVideoId, 'video-2');
        // Finish the new preview first, then deliver the old project's response.
        c.requests[1].resolve({ url: '/second-preview.mp4', edited: true });
        await next;
      }
      const renders = c.renders();
      if (outcome === 'success') c.requests[0].resolve({ url: '/old-preview.mp4', edited: true });
      else c.requests[0].reject(new Error('Old project failed'));
      await pending;
      assert.equal(c.renders(), renders);
      assert.equal(c.state.candidatePreviewError, '');
      assert.equal(c.state.candidatePreviewAutoplay, false);
      assert.equal(c.state.video.candidates[0].previewUrl, startNewPreview ? '/second-preview.mp4' : undefined);
    });
  }
}

test('repeated requests for the same project and clip still share the loading guard', async () => {
  const c = setup();
  const pending = c.context.prepareCandidatePreview(0);
  await c.context.prepareCandidatePreview(0);
  assert.equal(c.requests.length, 1);
  c.requests[0].resolve({ url: '/preview.mp4' });
  await pending;
});

test('selecting a clip during automatic preview rendering plays it when ready', async () => {
  const c = setup();
  const pending = c.context.prepareCandidatePreview(0, { autoplay: false });
  c.context.selectCandidatePreview(0, { autoplay: true });
  assert.equal(c.requests.length, 1);
  assert.equal(c.state.candidatePreviewAutoplay, false, 'do not play before the render is ready');
  c.requests[0].resolve({ url: '/preview.mp4' });
  await pending;
  assert.equal(c.state.candidatePreviewAutoplay, true);
});

test('the latest playback choice wins while sharing a pending preview', async () => {
  const c = setup();
  const pending = c.context.prepareCandidatePreview(0, { autoplay: true });
  c.context.selectCandidatePreview(0, { autoplay: false });
  assert.equal(c.requests.length, 1);
  c.requests[0].resolve({ url: '/preview.mp4' });
  await pending;
  assert.equal(c.state.candidatePreviewAutoplay, false);
});
