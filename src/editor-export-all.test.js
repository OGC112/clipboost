import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const exportSource = source.slice(source.indexOf('  async function exportAll('), source.indexOf('  function chart('));

function setup(openFolder, result = { count: 2, exportDir: 'C:\\Exports' }) {
  const notices = [], requests = [];
  const state = { video: { id: 'video-1', sourceUrl: '/source.mp4', candidates: [{}] } };
  const context = vm.createContext({
    state, window: { clipboostDesktop: { openExportsFolder: openFolder } },
    render() {}, currentRenderOptions: () => ({ captionPreference: 'off' }),
    showNotice: notice => notices.push(notice),
    fetch: async (url, options) => { requests.push({ url, options }); return result; },
    readJsonResponse: async response => response,
  });
  vm.runInContext(exportSource, context);
  return { state, notices, requests, run: () => context.exportAll() };
}

for (const failure of ['rejection', 'error string', 'synchronous throw']) {
  test(`batch export preserves success after folder ${failure}`, async () => {
    const c = setup(() => {
      if (failure === 'rejection') return Promise.reject(new Error('Folder unavailable'));
      if (failure === 'synchronous throw') throw new Error('Folder unavailable');
      return Promise.resolve('Folder unavailable');
    });
    await c.run();
    assert.equal(c.notices[0].title, 'Export complete');
    assert.equal(c.notices[1].kind, 'warning');
    assert.match(c.notices[1].message, /2 exported clips are saved.*Folder unavailable/);
    assert.equal(c.notices[1].detail, 'C:\\Exports');
    assert.equal(c.state.exportAllBusy, false);
    assert.equal(c.requests.length, 1, 'opening a folder must not rerender clips');
  });
}

test('batch export waits for folder opening and guards duplicate requests', async () => {
  let finish;
  const c = setup(() => new Promise(resolve => { finish = resolve; }));
  const pending = c.run();
  await new Promise(resolve => setImmediate(resolve));
  await c.run();
  assert.equal(c.requests.length, 1);
  assert.equal(c.state.exportAllBusy, true);
  finish('');
  await pending;
  assert.equal(c.state.exportAllBusy, false);
  assert.equal(c.notices.length, 1);
  assert.equal(c.requests[0].url, '/api/videos/video-1/export-all');
  assert.deepEqual(JSON.parse(c.requests[0].options.body), { options: { captionPreference: 'off' } });
});

test('blocked batches and browser exports do not attempt to open a folder', async () => {
  const blocked = setup(() => assert.fail('No files to open'), { count: 0, blockedCount: 2 });
  await blocked.run();
  assert.equal(blocked.notices.length, 1);
  assert.equal(blocked.notices[0].kind, 'warning');
  const browser = setup(undefined);
  await browser.run();
  assert.equal(browser.notices.length, 1);
  assert.equal(browser.state.exportAllBusy, false);
});

test('render failures still report export failure and release the guard', async () => {
  const c = setup(() => assert.fail('No export folder should open'));
  Object.defineProperty(c.state.video, 'id', { get() { throw new Error('Render unavailable'); } });
  await c.run();
  assert.equal(c.notices.length, 1);
  assert.equal(c.notices[0].title, 'Export failed');
  assert.equal(c.notices[0].message, 'Render unavailable');
  assert.equal(c.state.exportAllBusy, false);
});
