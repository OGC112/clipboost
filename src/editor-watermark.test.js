import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const watermarkSource = source.slice(source.indexOf('  let watermarkUploadRevision='), source.indexOf('    function invalidateRenderedPreviews('));

function setup() {
  const state = { watermarkUrl: '/existing.png', watermarkName: 'Existing' };
  const requests = [], notices = [];
  let saves = 0;
  const context = vm.createContext({
    state, FormData: class { append() {} }, render() {},
    persistEditorPrefs: () => saves++, showNotice: notice => notices.push(notice),
    readJsonResponse: async response => response,
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
  });
  vm.runInContext(watermarkSource, context);
  return { state, requests, notices, context, saves: () => saves };
}

for (const olderOutcome of ['success', 'failure']) {
  test(`latest watermark selection wins over an older upload ${olderOutcome}`, async () => {
    const c = setup();
    const first = c.context.uploadWatermark({ name: 'first.png' });
    const second = c.context.uploadWatermark({ name: 'second.png' });
    c.requests[1].resolve({ url: '/second.png' });
    await second;
    if (olderOutcome === 'success') c.requests[0].resolve({ url: '/first.png' });
    else c.requests[0].reject(new Error('Old upload failed'));
    await first;
    assert.equal(c.state.watermarkUrl, '/second.png');
    assert.equal(c.state.watermarkName, 'second.png');
    assert.equal(c.saves(), 1);
    assert.equal(c.notices.length, 0);
  });
}

test('removing the watermark prevents a pending upload from restoring it', async () => {
  const c = setup();
  const pending = c.context.uploadWatermark({ name: 'pending.png' });
  c.context.removeWatermark();
  c.requests[0].resolve({ url: '/pending.png' });
  await pending;
  assert.equal(c.state.watermarkUrl, '');
  assert.equal(c.state.watermarkName, '');
  assert.equal(c.saves(), 1);
  assert.match(source, /removeWatermarkBtn\.onclick=removeWatermark/);
});

test('latest upload failure keeps the existing watermark and allows retry', async () => {
  const c = setup();
  const failed = c.context.uploadWatermark({ name: 'bad.png' });
  c.requests[0].reject(new Error('Image upload failed'));
  await failed;
  assert.equal(c.state.watermarkUrl, '/existing.png');
  assert.equal(c.notices[0].message, 'Image upload failed');
  const retry = c.context.uploadWatermark({ name: 'retry.png' });
  c.requests[1].resolve({ url: '/retry.png', originalName: 'Retry image' });
  await retry;
  assert.equal(c.state.watermarkName, 'Retry image');
  assert.equal(c.state.watermarkScale, .18);
  assert.equal(c.saves(), 1);
});
