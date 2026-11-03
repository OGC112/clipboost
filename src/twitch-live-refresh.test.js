import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const refreshSource = source.slice(source.indexOf('  let twitchLiveLastAttempt='), source.indexOf('  async function refreshTwitchClips('));

function setup() {
  let now = 100000, sequence = 0, renders = 0;
  const timers = new Map(), requests = [];
  const state = { page: 'library', libraryPlatform: 'twitch', librarySection: 'live' };
  const context = vm.createContext({
    state, window: {}, Date: { now: () => now },
    setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    readJsonResponse: async response => response,
    render() { renders++; context.scheduleTwitchLiveRefresh(); },
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
    c.context.scheduleTwitchLiveRefresh();
    assert.equal(c.timers.size, 1);
    assert.equal([...c.timers.values()][0].at, 100080);
    const pending = c.fire();
    if (outcome === 'success') c.requests[0].resolve({ library: { creators: [] } });
    else c.requests[0].reject(new Error('Offline'));
    await pending;
    assert.equal(c.renders(), 1);
    assert.equal(c.timers.size, 1);
    assert.equal([...c.timers.values()][0].at, 160080);
    c.advance(1000);
    c.context.scheduleTwitchLiveRefresh();
    assert.equal(c.timers.size, 1);
    assert.equal([...c.timers.values()][0].at, 160080, 'renders do not postpone the next refresh');
  });
}

test('repeated renders retain one catch-up timer and navigation cancels it', () => {
  const c = setup();
  c.context.scheduleTwitchLiveRefresh();
  c.context.scheduleTwitchLiveRefresh();
  assert.equal(c.timers.size, 1);
  c.state.page = 'studio';
  c.context.scheduleTwitchLiveRefresh();
  assert.equal(c.timers.size, 0);
});

test('queued refresh cannot fetch after leaving the live section', async () => {
  const c = setup();
  c.context.scheduleTwitchLiveRefresh();
  c.state.librarySection = 'clips';
  await c.fire();
  assert.equal(c.requests.length, 0);
  assert.equal(c.timers.size, 0);
});

test('manual refresh remains immediate during the automatic cooldown', async () => {
  const c = setup();
  for (let i = 0; i < 2; i++) {
    const pending = c.context.refreshTwitchLive({ silent: false });
    assert.equal(c.requests.length, i + 1);
    c.requests[i].resolve({ library: {} });
    await pending;
  }
  assert.equal(c.timers.size, 1);
});

test('pending refresh neither duplicates requests nor reschedules after navigation', async () => {
  const c = setup();
  const pending = c.context.refreshTwitchLive({ silent: true });
  c.context.scheduleTwitchLiveRefresh();
  await c.context.refreshTwitchLive({ silent: true });
  assert.equal(c.requests.length, 1);
  assert.equal(c.timers.size, 0);
  c.state.page = 'studio';
  c.requests[0].reject(new Error('Offline'));
  await pending;
  assert.equal(c.timers.size, 0);
});

for (const outcome of ['success', 'failure']) {
  for (const destination of ['studio', 'platform', 'section']) {
    test(`pending refresh ${outcome} avoids rendering after leaving via ${destination}`, async () => {
      const c = setup();
      const pending = c.context.refreshTwitchLive({ silent: true });
      if (destination === 'studio') c.state.page = 'studio';
      else if (destination === 'platform') c.state.libraryPlatform = 'youtube';
      else c.state.librarySection = 'vods';
      const library = { creators: [{ id: 'updated' }] };
      if (outcome === 'success') c.requests[0].resolve({ library });
      else c.requests[0].reject(new Error('Offline'));
      await pending;
      assert.equal(c.renders(), 0, 'completion must not replace unrelated page DOM');
      assert.equal(c.state.twitchLiveRefreshing, false);
      assert.equal(c.timers.size, 0);
      if (outcome === 'success') assert.equal(c.state.library, library, 'keep fresh data for the next Library visit');
      c.state.page = 'library';
      c.state.libraryPlatform = 'twitch';
      c.state.librarySection = 'live';
      c.context.scheduleTwitchLiveRefresh();
      assert.equal(c.timers.size, 1, 'refresh scheduling resumes on return');
    });
  }
}
