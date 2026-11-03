import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const exportSource = source.slice(source.indexOf('  async function exportCurrent('), source.indexOf('  async function exportAll('));

function setup() {
  const requests = [], notices = [], navigations = [];
  const state = { video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [{ start: 2, end: 12 }] } };
  const context = vm.createContext({
    state, document: { getElementById: () => null }, window: {},
    render() {}, currentRenderOptions: () => ({ captionPreference: 'off' }),
    showNotice: notice => notices.push(notice), navigate: page => navigations.push(page),
    readJsonResponse: async response => response,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  });
  vm.runInContext(exportSource, context);
  return { state, requests, notices, navigations, run: mode => context.exportCurrent(mode) };
}

test('repeated publish and download actions share the active single-clip export', async () => {
  const { state, requests, navigations, run } = setup();
  const active = run();
  await run();
  await run('download');
  assert.equal(requests.length, 1);
  assert.equal(state.exportBusy, true);
  assert.equal(requests[0].url, '/api/videos/video-1/export');
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    index: 0, start: 2, end: 12, options: { captionPreference: 'off' },
  });
  requests[0].resolve({ filename: 'clip.mp4' });
  await active;
  assert.equal(state.exportBusy, false);
  assert.deepEqual(navigations, ['publish']);
  const next = run();
  assert.equal(requests.length, 2);
  requests[1].resolve({ filename: 'clip-2.mp4' });
  await next;
});

test('failed exports release the busy guard so the user can retry', async () => {
  const { state, requests, notices, run } = setup();
  const active = run();
  requests[0].reject(new Error('Render failed'));
  await active;
  assert.equal(state.exportBusy, false);
  assert.equal(notices[0].message, 'Render failed');
  const retry = run();
  assert.equal(requests.length, 2);
  requests[1].resolve({ filename: 'retry.mp4' });
  await retry;
  assert.equal(state.exportBusy, false);
});
