import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const refreshSource = source.slice(source.indexOf('  let twitchClipsLastAttempt='), source.indexOf('  async function loadLibrary('));

function setup() {
  let now = 100000, sequence = 0, renders = 0;
  const timers = new Map(), requests = [];
  const state = { page: 'library', libraryPlatform: 'twitch', librarySection: 'clips' };
  const context = vm.createContext({
    state, window: {}, Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    readJsonResponse: async response => response,
    render() { renders++; context.scheduleTwitchClipsRefresh(); },
  });
  vm.runInContext(refreshSource, context);
  return {
    context, state, timers, requests, renders: () => renders,
    advance(ms) { now += ms; },
    async fire() {
      const [id, timer] = timers.entries().next().value;
      now = Math.max(now, timer.at);
      timers.delete(id);
      return timer.fn();
    },
  };
}

for (const outcome of ['success', 'failure']) {
  test(`${outcome} waits a full interval before the next automatic refresh`, async () => {
    const c = setup();
    c.context.scheduleTwitchClipsRefresh();
    assert.equal(c.timers.size, 1);
    assert.equal([...c.timers.values()][0].at, 100100);
    const pending = c.fire();
    if (outcome === 'success') c.requests[0].resolve({ library: { creators: [] } });
    else c.requests[0].reject(new Error('Offline'));
    await pending;
    assert.equal(c.renders(), 1);
    assert.equal(c.timers.size, 1);
    assert.equal([...c.timers.values()][0].at, 145100);
    c.advance(1000);
    c.context.scheduleTwitchClipsRefresh();
    assert.equal(c.timers.size, 1);
    assert.equal([...c.timers.values()][0].at, 145100, 'renders do not postpone the next refresh');
  });
}

test('repeated renders retain one catch-up timer and navigation cancels it', () => {
  const c = setup();
  c.context.scheduleTwitchClipsRefresh();
  c.context.scheduleTwitchClipsRefresh();
  assert.equal(c.timers.size, 1);
  c.state.page = 'studio';
  c.context.scheduleTwitchClipsRefresh();
  assert.equal(c.timers.size, 0);
});

test('queued refresh cannot fetch after leaving the clips section', async () => {
  const c = setup();
  c.context.scheduleTwitchClipsRefresh();
  c.state.librarySection = 'live';
  await c.fire();
  assert.equal(c.requests.length, 0);
  assert.equal(c.timers.size, 0);
});

test('manual refresh remains immediate during the automatic cooldown', async () => {
  const c = setup();
  for (let i = 0; i < 2; i++) {
    const pending = c.context.refreshTwitchClips({ silent: false });
    assert.equal(c.requests.length, i + 1);
    c.requests[i].resolve({ library: {} });
    await pending;
  }
  assert.equal(c.timers.size, 1);
});

test('pending refresh neither duplicates requests nor reschedules after navigation', async () => {
  const c = setup();
  const pending = c.context.refreshTwitchClips({ silent: true });
  c.context.scheduleTwitchClipsRefresh();
  await c.context.refreshTwitchClips({ silent: true });
  assert.equal(c.requests.length, 1);
  assert.equal(c.timers.size, 0);
  c.state.page = 'studio';
  c.requests[0].reject(new Error('Offline'));
  await pending;
  assert.equal(c.timers.size, 0);
});

test('changing creator filter bypasses the old automatic cooldown', async () => {
  const c = setup();
  const pending = c.context.refreshTwitchClips({ silent: true });
  c.requests[0].resolve({ library: {} });
  await pending;
  assert.equal([...c.timers.values()][0].at, 145000);

  const filter = {};
  c.context.document = { getElementById: () => filter };
  const handler = source.slice(source.indexOf("    const cf=document.getElementById('libraryCreatorFilter')"), source.indexOf('    scheduleTwitchLiveRefresh();', source.indexOf("    const cf=document.getElementById('libraryCreatorFilter')")));
  vm.runInContext(handler, c.context);
  filter.onchange({ target: { value: 'creator-2' } });
  assert.equal(c.state.libraryCreatorFilter, 'creator-2');
  assert.equal(c.timers.size, 1);
  assert.equal([...c.timers.values()][0].at, 100100);
});
