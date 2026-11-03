import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const previewSource = source.slice(source.indexOf('  async function prepareCandidatePreview('), source.indexOf('  let disposePreviewCaptionClock='));

function setup() {
  const requests = [];
  let renders = 0;
  const state = {
    video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [
      { start: 0, end: 10 }, { start: 10, end: 20, previewUrl: '/cached.mp4' },
    ] },
    selectedCandidate: 0, candidatePreviewRequestId: 0,
  };
  const context = vm.createContext({
    state, render: () => renders++, currentRenderOptions: () => ({}),
    readJsonResponse: async response => response,
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  });
  vm.runInContext(previewSource, context);
  return { state, requests, context, renders: () => renders };
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
