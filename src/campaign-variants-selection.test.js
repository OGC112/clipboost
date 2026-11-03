import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const checkSource = source.slice(source.indexOf('  let campaignVariantsRevision='), source.indexOf('  function projects()'));

function setup() {
  const requests = [];
  let renders = 0;
  const state = { video: { id: 'video-1', campaign: { id: 'campaign-1' }, candidates: [{ start: 2, end: 12 }, { start: 20, end: 30 }] }, selectedCandidate: 0, candidatePreviewRequestId: 0, campaignVariants: null };
  const context = vm.createContext({ state, document: { getElementById: () => null }, currentRenderOptions: () => ({ captionPreference: 'off' }), render: () => renders++, readJsonResponse: async r => r,
    fetch: (url, init) => new Promise((resolve, reject) => requests.push({ url, body: JSON.parse(init.body), resolve, reject })) });
  vm.runInContext(checkSource, context);
  return { state, requests, run: () => context.generateCampaignVariants(), renders: () => renders };
}

test('hook variants displays the response for the requested clip', async () => {
  const c = setup(), pending = c.run();
  assert.equal(c.requests[0].url, '/api/videos/video-1/variants');
  assert.deepEqual(c.requests[0].body, { index: 0 });
  const check = [{ title: 'Tight hook' }];
  c.requests[0].resolve({ variants: check });
  await pending;
  assert.equal(c.state.campaignVariants, check);
  assert.equal(c.renders(), 1);
});

for (const change of ['project', 'selection', 'selection round trip', 'preview invalidation', 'candidate replacement']) {
  test(`pending variants is discarded after ${change}`, async () => {
    const c = setup(), pending = c.run();
    if (change === 'project') c.state.video = { ...c.state.video };
    if (change === 'selection') c.state.selectedCandidate = 1;
    if (change === 'selection round trip' || change === 'preview invalidation') c.state.candidatePreviewRequestId++;
    if (change === 'candidate replacement') c.state.video.candidates[0] = { start: 3, end: 11 };
    c.requests[0].resolve({ variants: [{ title: 'Hook' }] });
    await pending;
    assert.equal(c.state.campaignVariants, null);
    assert.equal(c.renders(), 0);
  });
}

test('an older hook variants cannot overwrite the latest result', async () => {
  const c = setup(), older = c.run(), newer = c.run();
  const latest = [{ title: 'Latest' }];
  c.requests[1].resolve({ variants: latest });
  await newer;
  c.requests[0].resolve({ variants: [{ title: 'Hook' }] });
  await older;
  assert.equal(c.state.campaignVariants, latest);
  assert.equal(c.renders(), 1);
});

test('request failures reach the existing button error handler and allow retry', async () => {
  const c = setup(), pending = c.run();
  c.requests[0].reject(new Error('Check unavailable'));
  await assert.rejects(pending, /Check unavailable/);
  const retry = c.run();
  c.requests[1].resolve({ variants: [{ title: 'Hook' }] });
  await retry;
  assert.equal(c.state.campaignVariants[0].title, 'Hook');
});

test('obsolete failures do not interrupt the newly selected clip', async () => {
  const c = setup(), pending = c.run();
  c.state.selectedCandidate = 1;
  c.requests[0].reject(new Error('Obsolete failure'));
  await pending;
  assert.equal(c.renders(), 0);
  assert.equal(c.state.campaignVariants, null);
});
