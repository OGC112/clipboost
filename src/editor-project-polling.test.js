import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const pollSource = source.slice(source.indexOf('  async function pollProjectUntilSettled('), source.indexOf('  async function startProjectIngestion('));

function setup() {
  const requests = [], timers = [], notices = [];
  const state = { video: { id: 'old', status: 'analyzing' }, selectedCandidate: 3 };
  let renders = 0, clears = 0;
  const window = {};
  const context = vm.createContext({
    state, window, console: { warn() {} },
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    readJsonResponse: async response => response,
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout: () => clears++,
    document: { querySelector: () => null, getElementById: () => null },
    render: () => renders++, showNotice: notice => notices.push(notice),
  });
  vm.runInContext(pollSource, context);
  return { state, window, requests, timers, notices, poll: context.pollProjectUntilSettled,
    renders: () => renders, clears: () => clears };
}

for (const outcome of ['ready', 'analyzing', 'failed', 'network error']) {
  for (const next of ['another project', 'closed project']) {
    test(`pending ${outcome} refresh preserves ${next}`, async () => {
      const c = setup();
      const pending = c.poll('old');
      const replacement = next === 'another project' ? { id: 'new', status: 'ready' } : null;
      c.state.video = replacement;
      if (outcome === 'network error') c.requests[0].reject(new Error('Offline'));
      else c.requests[0].resolve({ id: 'old', status: outcome });
      await pending;
      assert.equal(c.state.video, replacement);
      assert.equal(c.state.selectedCandidate, 3);
      assert.equal(c.renders(), 0);
      assert.equal(c.notices.length, 0);
      assert.equal(c.timers.length, 0);
    });
  }
}

test('queued refresh for an inactive project leaves the current polling loop intact', async () => {
  const c = setup();
  await c.poll('new');
  assert.equal(c.requests.length, 0);
  assert.equal(c.clears(), 0);
});

test('active project keeps polling and applies its settled result', async () => {
  const c = setup();
  const first = c.poll('old');
  c.requests[0].resolve({ id: 'old', status: 'analyzing' });
  await first;
  assert.equal(c.timers[0].delay, 1500);
  const second = c.timers[0].callback();
  c.requests[1].resolve({ id: 'old', status: 'ready' });
  await second;
  assert.equal(c.state.video.status, 'ready');
  assert.equal(c.state.selectedCandidate, 0);
  assert.equal(c.renders(), 1);
});

test('active project retries a network failure', async () => {
  const c = setup();
  const pending = c.poll('old');
  c.requests[0].reject(new Error('Offline'));
  await pending;
  assert.equal(c.timers[0].delay, 2500);
});
