import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const exportSource = source.slice(source.indexOf('  async function exportCurrent('), source.indexOf('  async function exportAll('));

function setup({ campaign = false, openFolder } = {}) {
  const requests = [], notices = [], navigations = [];
  const state = { page: 'studio', video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [{ start: 2, end: 12 }] } };
  if (campaign) state.video.campaign = { id: 'campaign-1' };
  let renderOptions = { captionPreference: 'off' };
  const context = vm.createContext({
    state, document: { getElementById: () => null }, window: { clipboostDesktop: { openExportsFolder: openFolder } },
    render() {}, currentRenderOptions: () => ({ ...renderOptions }),
    showNotice: notice => notices.push(notice), navigate: page => navigations.push(page),
    readJsonResponse: async response => response,
    fetch: (url, options) => new Promise((resolve, reject) => requests.push({ url, options, resolve, reject })),
  });
  vm.runInContext(exportSource, context);
  return { state, requests, notices, navigations, setOptions: options => { renderOptions = options; }, run: mode => context.exportCurrent(mode) };
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

for (const failure of ['rejection', 'error string', 'synchronous throw']) {
  test(`single-clip download preserves the saved export after folder ${failure}`, async () => {
    const c = setup({ openFolder: () => {
      if (failure === 'rejection') return Promise.reject(new Error('Folder unavailable'));
      if (failure === 'synchronous throw') throw new Error('Folder unavailable');
      return Promise.resolve('Folder unavailable');
    } });
    const active = c.run('download');
    c.requests[0].resolve({ filename: 'saved.mp4', url: '/saved.mp4' });
    await active;
    assert.equal(c.requests.length, 1);
    assert.equal(c.state.lastExport.filename, 'saved.mp4');
    assert.equal(c.state.lastExport.projectId, 'video-1');
    assert.equal(c.state.exportBusy, false);
    assert.deepEqual(c.navigations, []);
    assert.equal(c.notices.length, 1);
    assert.equal(c.notices[0].kind, 'warning');
    assert.equal(c.notices[0].title, 'Clip exported; folder could not open');
    assert.match(c.notices[0].message, /saved\.mp4 is saved.*Folder unavailable/);
  });
}

test('single-clip download waits for the folder and guards repeated actions', async () => {
  let finish;
  const c = setup({ openFolder: () => new Promise(resolve => { finish = resolve; }) });
  const active = c.run('download');
  c.requests[0].resolve({ filename: 'saved.mp4' });
  await new Promise(resolve => setImmediate(resolve));
  await c.run('download');
  assert.equal(c.requests.length, 1);
  assert.equal(c.state.exportBusy, true);
  finish('');
  await active;
  assert.equal(c.state.exportBusy, false);
  assert.equal(c.notices.length, 1);
  assert.equal(c.notices[0].title, 'Files ready');
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

for (const change of ['page', 'project', 'closed project']) {
  test(`publish export preserves navigation after a ${change} change`, async () => {
    const { state, requests, notices, navigations, run } = setup();
    const active = run();
    if (change === 'page') state.page = 'projects';
    else if (change === 'project') state.video = { id: 'video-2' };
    else state.video = null;
    requests[0].resolve({ filename: 'original.mp4', url: '/original.mp4' });
    await active;
    assert.deepEqual(navigations, []);
    assert.equal(state.page, change === 'page' ? 'projects' : 'studio');
    assert.equal(state.lastExport.projectId, 'video-1');
    assert.equal(state.lastExport.url, '/original.mp4');
    assert.equal(state.exportBusy, false);
    assert.equal(notices[0].kind, 'success');
    assert.match(notices[0].message, /original\.mp4/);
  });
}


test('campaign export preserves settings while the check is pending; next export uses later edits', async () => {
  const { requests, run, setOptions } = setup({ campaign: true });
  const original = { captionPreference: 'on', sourceSubtitleMode: 'crop', sourceSubtitleBottom: .2,
    watermarkUrl: '/watermark.png', hookTitleEnabled: true, hookTitleText: 'Original hook' };
  setOptions(original);
  const active = run();
  assert.equal(requests[0].url, '/api/videos/video-1/campaign-check');
  const checked = JSON.parse(requests[0].options.body);
  setOptions({ captionPreference: 'off', sourceSubtitleMode: 'keep', hookTitleText: 'Later edit' });
  requests[0].resolve({ passed: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].url, '/api/videos/video-1/export');
  assert.deepEqual(JSON.parse(requests[1].options.body), checked);
  assert.deepEqual(checked.options, original);
  requests[1].resolve({ filename: 'original.mp4' });
  await active;
  const next = run();
  assert.equal(JSON.parse(requests[2].options.body).options.captionPreference, 'off');
  requests[2].resolve({ passed: true });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(JSON.parse(requests[3].options.body).options.hookTitleText, 'Later edit');
  requests[3].resolve({ filename: 'later.mp4' });
  await next;
});

test('failed campaign checks prevent rendering and release the export guard', async () => {
  const { state, requests, notices, run } = setup({ campaign: true });
  const active = run();
  requests[0].resolve({ passed: false, checks: [{ ok: false, label: 'Duration' }] });
  await active;
  assert.equal(requests.length, 1);
  assert.equal(state.exportBusy, false);
  assert.equal(notices[0].kind, 'warning');
  const retry = run();
  requests[1].resolve({ passed: true });
  await new Promise(resolve => setImmediate(resolve));
  requests[2].resolve({ filename: 'retry.mp4' });
  await retry;
  assert.equal(state.exportBusy, false);
});
