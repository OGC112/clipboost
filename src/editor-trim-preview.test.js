import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const trimSource = source.slice(source.indexOf('  let trimSaveQueue='), source.indexOf('  async function prepareCandidatePreview('));

function setup() {
  const requests = [], timers = [], previews = [], notices = [];
  let renders = 0;
  const state = {
    video: { id: 'video-1', details: { duration: 50 }, candidates: [
      { start: 2, end: 12, previewUrl: '/old-a.mp4' },
      { start: 20, end: 30, previewUrl: '/b.mp4' },
    ] },
    selectedCandidate: 0, candidatePreviewRequestId: 0, timelineSeek: 2,
  };
  const context = vm.createContext({
    state, render: () => renders++, showNotice: notice => notices.push(notice),
    setTimeout: callback => timers.push(callback),
    prepareCandidatePreview: index => previews.push(index),
    readJsonResponse: async response => response,
    fetch: (url, init) => new Promise(resolve => requests.push({ url, body: JSON.parse(init.body), resolve })),
  });
  vm.runInContext(trimSource, context);
  return { state, requests, timers, previews, notices, context, renders: () => renders };
}

async function startTrim(c) {
  const pending = c.context.saveManualCandidateTrim(0, 3, 11);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(c.requests[0].url, '/api/videos/video-1/candidates/0/trim');
  assert.deepEqual(c.requests[0].body, { start: 3, end: 11, reset: false, keepFullSource: false });
  return { pending };
}

test('a completed trim preserves the newly selected clip and its pending preview', async () => {
  const c = setup();
  const { pending } = await startTrim(c);
  c.state.selectedCandidate = 1;
  c.state.timelineSeek = 20;
  c.state.candidatePreviewLoading = true;
  c.state.candidatePreviewLoadingIndex = 1;
  c.state.candidatePreviewRequestId++;
  c.state.campaignCompliance = { passed: true };
  const requestId = c.state.candidatePreviewRequestId;
  c.requests[0].resolve({ candidate: { start: 3, end: 11, duration: 8 } });
  await pending;
  assert.equal(c.state.video.candidates[0].start, 3, 'save still updates the trimmed clip');
  assert.equal(c.state.video.candidates[0].previewUrl, null, 'old trimmed preview is invalidated');
  assert.equal(c.state.video.candidates[1].previewUrl, '/b.mp4');
  assert.equal(c.state.timelineSeek, 20);
  assert.equal(c.state.candidatePreviewLoading, true);
  assert.equal(c.state.candidatePreviewRequestId, requestId);
  assert.equal(c.state.campaignCompliance.passed, true);
  assert.equal(c.renders(), 0, 'the selected player must not be replaced');
  assert.equal(c.timers.length, 0);
  assert.equal(c.notices.length, 0);
});

test('a trim on the selected clip updates the timeline and refreshes its preview', async () => {
  const c = setup();
  const { pending } = await startTrim(c);
  c.requests[0].resolve({ candidate: { start: 3, end: 11 } });
  await pending;
  assert.equal(c.state.timelineSeek, 3);
  assert.equal(c.renders(), 1);
  assert.equal(c.state.manualTrimUndo.start, 2);
  assert.equal(c.timers.length, 1);
  c.timers[0]();
  assert.deepEqual(c.previews, [0]);
});

for (const change of ['selection', 'project', 'newer trim']) {
  test(`scheduled trim preview is discarded after a ${change} change`, async () => {
    const c = setup();
    const { pending } = await startTrim(c);
    c.requests[0].resolve({ candidate: { start: 3, end: 11 } });
    await pending;
    let next;
    if (change === 'selection') c.state.selectedCandidate = 1;
    if (change === 'project') c.state.video = { id: 'video-2' };
    if (change === 'newer trim') next = c.context.saveManualCandidateTrim(0, 4, 10);
    c.timers[0]();
    assert.deepEqual(c.previews, []);
    if (next) {
      await new Promise(resolve => setImmediate(resolve));
      c.requests[1].resolve({ candidate: { start: 4, end: 10 } });
      await next;
      c.timers[1]();
      assert.deepEqual(c.previews, [0], 'the newest trim still receives a preview');
    }
  });
}
