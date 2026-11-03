import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { campaignProgress } from './campaign-progress.js';
import { waitForCampaignProject } from './campaign-project-polling.js';

test('campaign progress uses analysis before ingestion, including a reported zero', () => {
  const data = { status: 'analyzing', analysis: { stage: 'speech-to-text', progress: 0 }, ingestion: { stage: 'download', progress: 80 } };
  const before = structuredClone(data);
  assert.deepEqual(campaignProgress(data), {
    title: 'Analyzing campaign video…', progressLabel: 'speech to text', progress: .35,
  });
  assert.deepEqual(data, before);
});

test('ingestion supplies missing analysis progress and stage', () => {
  assert.deepEqual(campaignProgress({ status: 'ingesting', ingestion: { stage: 'download-source', progress: '45' } }, 20), {
    title: 'Preparing campaign video…', progressLabel: 'download source', progress: 45,
  });
  assert.equal(campaignProgress({ status: 'uploaded' }).progressLabel, 'uploaded');
  assert.equal(campaignProgress({}).progressLabel, 'Working');
});

test('reported progress is bounded and cannot move the display backwards', () => {
  assert.equal(campaignProgress({ analysis: { progress: 150 } }).progress, 100);
  assert.equal(campaignProgress({ analysis: { progress: -20 } }).progress, .2);
  assert.equal(campaignProgress({ status: 'ingesting', ingestion: { progress: 10 } }, 96).progress, 96);
});

test('reassurance increments stop at stage caps without capping backend progress', () => {
  for (const [status, cap, step] of [['ingesting', 89, .2], ['analyzing', 94, .35]]) {
    assert.equal(campaignProgress({ status }, 50).progress, 50 + step);
    assert.equal(campaignProgress({ status }, cap - .1).progress, cap);
    assert.equal(campaignProgress({ status }, cap).progress, cap);
    assert.equal(campaignProgress({ status, analysis: { progress: 98 } }, cap).progress, 98);
  }
});

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pollingSource = source.slice(source.indexOf('  async function waitForCampaignProjectResult('), source.indexOf('  async function startCampaignCreating('));

for (const terminal of ['ready', 'degraded', 'failed']) {
  test(`campaign polling applies extracted progress before handling ${terminal}`, async () => {
    const snapshots = [];
    const responses = [
      { status: 'analyzing', analysis: { stage: 'speech-to-text', progress: 42 } },
      { status: terminal, analysis: { error: terminal === 'failed' ? 'Analysis stopped' : '' } },
    ];
    const context = vm.createContext({
      campaignProgress, state: { uiModal: { progress: 5 } },
      waitForCampaignProject: options => waitForCampaignProject({
        ...options, sleep: async delay => { assert.equal(delay, 1500); },
      }),
      document: { querySelector: () => null },
      fetch: async () => responses.shift(), readJsonResponse: async response => response,
      render() { snapshots.push({ ...context.state.uiModal }); },
      setTimeout(callback, delay) { assert.equal(delay, 1500); callback(); },
    });
    vm.runInContext(pollingSource, context);
    if (terminal === 'failed') await assert.rejects(context.waitForCampaignProjectResult('video-1'), /Analysis stopped/);
    else {
      assert.equal((await context.waitForCampaignProjectResult('video-1')).status, terminal);
      assert.equal(context.state.uiModal.progress, 100);
    }
    assert.deepEqual(snapshots, [{ title: 'Analyzing campaign video…', progressLabel: 'speech to text', progress: 42 }]);
    assert.equal(responses.length, 0);
  });
}
