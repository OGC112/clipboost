import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const watermarkSource = source.slice(source.indexOf('  let watermarkUploadRevision='), source.indexOf('    function invalidateRenderedPreviews('));
const invalidateStart = source.indexOf('    function invalidateRenderedPreviews(');
const invalidateSource = source.slice(invalidateStart, source.indexOf('\n', invalidateStart));

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
  vm.runInContext(invalidateSource + '\n' + watermarkSource, context);
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

for (const action of ['upload', 'remove']) {
  test(`${action} watermark leaves final mode and invalidates baked previews and pending requests`, async () => {
    const c = setup();
    const candidates = [0, 1].map(() => ({ previewUrl: '/baked.mp4', previewEdited: true, previewMeta: { watermark: {} } }));
    Object.assign(c.state, { previewFinalMode: true, video: { candidates }, candidatePreviewRequestId: 7,
      candidatePreviewLoading: true, candidatePreviewLoadingIndex: 0, candidatePreviewError: 'Old error' });
    const displayed = [];
    c.context.render = () => displayed.push(candidates[0].previewUrl);
    if (action === 'upload') {
      const pending = c.context.uploadWatermark({ name: 'new.png' });
      assert.equal(c.state.previewFinalMode, true, 'keep the current preview until upload succeeds');
      c.requests[0].resolve({ url: '/new.png' });
      await pending;
    } else c.context.removeWatermark();
    assert.equal(c.state.previewFinalMode, false);
    assert.equal(c.state.candidatePreviewRequestId, 8, 'pending baked render cannot restore the stale image');
    for (const candidate of candidates) {
      assert.equal(candidate.previewUrl, null);
      assert.equal(candidate.previewMeta, null);
      assert.equal(candidate.previewEdited, false);
    }
    assert.equal(c.state.candidatePreviewLoading, false);
    assert.equal(c.state.candidatePreviewError, '');
    assert.deepEqual(displayed, [null], 'remove baked pixels before showing updated branding');
    assert.equal(c.saves(), 1);
  });
}

test('removing an editable watermark retains the clean video cache', () => {
  const c = setup();
  const candidate = { previewUrl: '/clean.mp4' };
  Object.assign(c.state, { previewFinalMode: false, video: { candidates: [candidate] }, candidatePreviewRequestId: 4 });
  c.context.removeWatermark();
  assert.equal(candidate.previewUrl, '/clean.mp4');
  assert.equal(c.state.candidatePreviewRequestId, 4);
  assert.equal(c.state.watermarkUrl, '');
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

for (const response of [null, {}, { url: '' }, { url: '   ' }, { url: 42 }]) {
  test(`invalid watermark response ${JSON.stringify(response)} preserves settings and allows retry`, async () => {
    const c = setup();
    Object.assign(c.state, { watermarkX: .3, watermarkY: .7, watermarkScale: .25, watermarkOpacity: .5 });
    const original = { ...c.state };
    const pending = c.context.uploadWatermark({ name: 'replacement.png' });
    c.requests[0].resolve(response);
    await pending;
    assert.deepEqual(c.state, original);
    assert.equal(c.saves(), 0);
    assert.equal(c.notices.length, 1);
    assert.equal(c.notices[0].title, 'Watermark upload failed');
    assert.match(c.notices[0].message, /server did not return an image URL/);

    const retry = c.context.uploadWatermark({ name: 'retry.png' });
    c.requests[1].resolve({ url: '/retry.png' });
    await retry;
    assert.equal(c.state.watermarkUrl, '/retry.png');
    assert.equal(c.state.watermarkName, 'retry.png');
    assert.equal(c.saves(), 1);
  });
}

test('a superseded malformed upload does not report an error after a valid replacement', async () => {
  const c = setup();
  const first = c.context.uploadWatermark({ name: 'first.png' });
  const second = c.context.uploadWatermark({ name: 'second.png' });
  c.requests[1].resolve({ url: '/second.png' });
  await second;
  c.requests[0].resolve(null);
  await first;
  assert.equal(c.state.watermarkUrl, '/second.png');
  assert.equal(c.saves(), 1);
  assert.equal(c.notices.length, 0);
});
