import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const checkSource = source.slice(source.indexOf('  let campaignCheckRevision='), source.indexOf('\n', source.indexOf('  async function runCampaignCheck(')));

function setup() {
  const requests = [];
  let renders = 0;
  const state = { video: { id: 'video-1', campaign: { id: 'campaign-1' }, candidates: [{ start: 2, end: 12 }, { start: 20, end: 30 }] }, selectedCandidate: 0, candidatePreviewRequestId: 0, campaignCompliance: null };
  const context = vm.createContext({ state, document: { getElementById: () => null }, currentRenderOptions: () => ({ captionPreference: 'off' }), render: () => renders++, readJsonResponse: async r => r,
    fetch: (url, init) => new Promise((resolve, reject) => requests.push({ url, body: JSON.parse(init.body), resolve, reject })) });
  vm.runInContext(checkSource, context);
  return { state, requests, run: () => context.runCampaignCheck(), renders: () => renders };
}

test('campaign check displays the response for the checked clip', async () => {
  const c = setup(), pending = c.run();
  assert.equal(c.requests[0].url, '/api/videos/video-1/campaign-check');
  assert.deepEqual(c.requests[0].body, { index: 0, start: 2, end: 12, options: { captionPreference: 'off' } });
  const check = { passed: true };
  c.requests[0].resolve(check);
  await pending;
  assert.equal(c.state.campaignCompliance, check);
  assert.equal(c.renders(), 1);
});

for (const change of ['project', 'selection', 'selection round trip', 'preview invalidation', 'candidate replacement']) {
  test(`pending check is discarded after ${change}`, async () => {
    const c = setup(), pending = c.run();
    if (change === 'project') c.state.video = { ...c.state.video };
    if (change === 'selection') c.state.selectedCandidate = 1;
    if (change === 'selection round trip' || change === 'preview invalidation') c.state.candidatePreviewRequestId++;
    if (change === 'candidate replacement') c.state.video.candidates[0] = { start: 3, end: 11 };
    c.requests[0].resolve({ passed: true });
    await pending;
    assert.equal(c.state.campaignCompliance, null);
    assert.equal(c.renders(), 0);
  });
}

test('an older campaign check cannot overwrite the latest result', async () => {
  const c = setup(), older = c.run(), newer = c.run();
  const latest = { passed: false };
  c.requests[1].resolve(latest);
  await newer;
  c.requests[0].resolve({ passed: true });
  await older;
  assert.equal(c.state.campaignCompliance, latest);
  assert.equal(c.renders(), 1);
});

test('request failures reach the existing button error handler and allow retry', async () => {
  const c = setup(), pending = c.run();
  c.requests[0].reject(new Error('Check unavailable'));
  await assert.rejects(pending, /Check unavailable/);
  const retry = c.run();
  c.requests[1].resolve({ passed: true });
  await retry;
  assert.equal(c.state.campaignCompliance.passed, true);
});
