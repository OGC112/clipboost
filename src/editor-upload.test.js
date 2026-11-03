import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const uploadSource = source.slice(source.indexOf('  async function uploadVideo('), source.indexOf('  function captionPresetY('));
const tick = () => new Promise(resolve => setImmediate(resolve));

function setup() {
  const preflights = [], uploads = [], analyses = [], notices = [], polls = [];
  const state = { uploadStatus: 'idle', video: { id: 'linked', status: 'linked' } };
  class FormData {
    fields = {};
    append(key, value) { this.fields[key] = value; }
  }
  class XMLHttpRequest {
    upload = {};
    open() {}
    send(body) { this.body = body; uploads.push(this); }
    complete(id) { this.status = 200; this.responseText = JSON.stringify({ id }); this.onload(); }
  }
  const context = vm.createContext({
    state, FormData, XMLHttpRequest, render() {},
    ensureStudioPreflight: () => new Promise((resolve, reject) => preflights.push({ resolve, reject })),
    fetch: (url, options) => new Promise((resolve, reject) => analyses.push({ url, options, resolve, reject })),
    readJsonResponse: async response => response,
    localStorage: { setItem() {} }, document: { querySelector: () => null },
    showNotice: notice => notices.push(notice), pollProjectUntilSettled: id => polls.push(id),
  });
  vm.runInContext(uploadSource, context);
  return { state, preflights, uploads, analyses, notices, polls, run: file => context.uploadVideo(file) };
}

test('file selections and drops cannot overlap preflight, upload or analysis', async () => {
  const c = setup(), file = { name: 'first.mp4' };
  const active = c.run(file);
  await c.run({ name: 'second.mp4' });
  assert.equal(c.preflights.length, 1);
  c.preflights[0].resolve(true);
  await tick();
  await c.run(file);
  assert.equal(c.uploads.length, 1);
  assert.equal(c.uploads[0].body.fields.video, file);
  assert.equal(c.uploads[0].body.fields.projectId, 'linked');
  c.uploads[0].complete('uploaded');
  await tick();
  await c.run(file);
  assert.equal(c.analyses.length, 1);
  assert.equal(c.analyses[0].url, '/api/videos/uploaded/analyze');
  c.analyses[0].resolve({ id: 'uploaded', candidates: [] });
  await active;
  assert.equal(c.state.uploadBusy, false);
  assert.equal(c.state.uploadStatus, 'idle');
  assert.deepEqual(c.polls, ['uploaded']);
  const next = c.run(file);
  assert.equal(c.preflights.length, 2);
  c.preflights[1].resolve(false);
  await next;
});

for (const failure of ['declined preflight', 'failed preflight', 'upload', 'analysis']) {
  test(`${failure} releases the import guard for retry`, async () => {
    const c = setup(), file = { name: 'retry.mp4' };
    const active = c.run(file);
    if (failure === 'declined preflight') c.preflights[0].resolve(false);
    else if (failure === 'failed preflight') c.preflights[0].reject(new Error('Health check failed'));
    else {
      c.preflights[0].resolve(true);
      await tick();
      if (failure === 'upload') c.uploads[0].onerror();
      else {
        c.uploads[0].complete('uploaded');
        await tick();
        c.analyses[0].reject(new Error('Analysis failed'));
      }
    }
    await active;
    assert.equal(c.state.uploadBusy, false);
    assert.equal(c.state.uploadStatus, 'idle');
    assert.equal(c.notices.length, failure === 'declined preflight' ? 0 : 1);
    const retry = c.run(file);
    assert.equal(c.preflights.length, 2);
    c.preflights[1].resolve(false);
    await retry;
  });
}
