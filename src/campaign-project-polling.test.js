import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForCampaignProject } from './campaign-project-polling.js';

function setup(responses) {
  let elapsed = 0;
  const projects = [], progress = [], delays = [];
  let reads = 0;
  const options = {
    readProject: async () => { reads++; return responses.shift(); },
    onProject: data => projects.push(data),
    onProgress: data => progress.push(data),
    now: () => elapsed,
    sleep: async ms => { delays.push(ms); elapsed += ms; },
  };
  return { options, projects, progress, delays, reads: () => reads };
}

for (const status of ['ready', 'degraded']) {
  test(`ingestion and analysis settle with the original ${status} project`, async () => {
    const ingesting = { status: 'ingesting' }, analyzing = { status: 'analyzing' };
    // Terminal status wins over stale error metadata, as in the editor's original loop.
    const settled = { status, analysis: { stage: 'error', error: 'Previous attempt' } };
    const c = setup([ingesting, analyzing, settled]);
    assert.equal(await waitForCampaignProject(c.options), settled);
    assert.deepEqual(c.projects, [ingesting, analyzing, settled]);
    assert.deepEqual(c.progress, [ingesting, analyzing]);
    assert.deepEqual(c.delays, [1500, 1500]);
    assert.equal(c.reads(), 3);
  });
}

for (const [data, message] of [
  [{ status: 'failed' }, 'Campaign video processing failed.'],
  [{ analysis: { stage: 'ERROR', error: ' Analysis stopped ' } }, 'Analysis stopped'],
  [{ ingestion: { stage: 'ERROR' } }, 'Campaign video processing failed.'],
  [{ ingestion: { error: ' Download stopped ' } }, 'Download stopped'],
  [{ status: 'failed', analysis: { error: 'AI error' }, ingestion: { error: 'Download error' } }, 'AI error'],
]) {
  test(`processing failure preserves error policy: ${JSON.stringify(data)}`, async () => {
    const c = setup([data]);
    await assert.rejects(waitForCampaignProject(c.options), { message });
    assert.deepEqual(c.projects, [data]);
    assert.deepEqual(c.progress, []);
    assert.deepEqual(c.delays, []);
  });
}

test('analysis error text alone does not interrupt a still-running project', async () => {
  const pending = { status: 'analyzing', analysis: { error: 'Previous attempt' } };
  const settled = { status: 'ready' };
  const c = setup([pending, settled]);
  assert.equal(await waitForCampaignProject(c.options), settled);
  assert.deepEqual(c.progress, [pending]);
});

test('transport failure propagates unchanged without scheduling another read', async () => {
  const c = setup([]), error = new Error('Offline');
  c.options.readProject = async () => { throw error; };
  await assert.rejects(waitForCampaignProject(c.options), value => value === error);
  assert.deepEqual(c.projects, []);
  assert.deepEqual(c.delays, []);
});

test('polling stops at the existing thirty-minute deadline', async () => {
  const c = setup([]);
  c.options.readProject = async () => ({ status: 'analyzing' });
  await assert.rejects(waitForCampaignProject(c.options), { message: 'Campaign video processing timed out.' });
  assert.equal(c.projects.length, 1200);
  assert.equal(c.delays.length, 1200);
  assert.ok(c.delays.every(ms => ms === 1500));
});
