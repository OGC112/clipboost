import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const searchSource = source.slice(source.indexOf('  let creatorSearchRevision='), source.indexOf('  async function removeCreator('));

function setup() {
  const state = { addCreatorOpen: true, creatorPlatform: 'youtube' };
  const requests = [], timers = [];
  let renders = 0, focuses = 0;
  const context = vm.createContext({
    state, window: {}, clearTimeout() {}, setTimeout: fn => timers.push(fn),
    render: () => renders++,
    document: { getElementById: () => ({ value: 'query', focus: () => focuses++, setSelectionRange() {} }) },
    fetch: url => new Promise((resolve, reject) => requests.push({ url, resolve, reject })),
    readJsonResponse: async response => response,
  });
  vm.runInContext(searchSource, context);
  return { state, requests, timers, context, renders: () => renders, focuses: () => focuses };
}

for (const outcome of ['success', 'failure']) {
  test(`older search ${outcome} cannot replace results or finish a newer search`, async () => {
    const c = setup();
    const first = c.context.searchCreators('first');
    const second = c.context.searchCreators('second');
    if (outcome === 'success') c.requests[0].resolve({ results: [{ id: 'old' }] });
    else c.requests[0].reject(new Error('Old failure'));
    await first;
    assert.equal(c.state.creatorSearchLoading, true);
    assert.equal(c.state.creatorSearchResults.length, 0);
    assert.equal(c.state.libraryError, '');
    assert.equal(c.renders(), 2);
    c.requests[1].resolve({ results: [{ id: 'new' }] });
    await second;
    assert.equal(c.state.creatorSearchResults[0].id, 'new');
    assert.equal(c.state.creatorSearchLoading, false);
  });
}

for (const action of ['edit input', 'switch platform', 'close dialog', 'clear query']) {
  test(`${action} invalidates pending creator results`, async () => {
    const c = setup();
    const pending = c.context.searchCreators('creator');
    if (action === 'clear query') await c.context.searchCreators('');
    else {
      c.context.resetCreatorSearch();
      if (action === 'switch platform') c.state.creatorPlatform = 'twitch';
      if (action === 'close dialog') c.state.addCreatorOpen = false;
    }
    const renders = c.renders();
    c.requests[0].resolve({ results: [{ id: 'stale' }] });
    await pending;
    assert.equal(c.state.creatorSearchResults.length, 0);
    assert.equal(c.state.creatorSearchLoading, false);
    assert.equal(c.renders(), renders);
    assert.equal(c.timers.length, 0);
  });
}

test('queued focus restoration cannot steal focus after search is reset', async () => {
  const c = setup();
  const pending = c.context.searchCreators('creator');
  c.requests[0].resolve({ results: [] });
  await pending;
  c.context.resetCreatorSearch();
  c.timers.forEach(fn => fn());
  assert.equal(c.focuses(), 0);
});

test('creator dialog interactions invalidate requests before changing context', () => {
  assert.match(source, /const open=\(\)=>\{resetCreatorSearch\(\);state.addCreatorOpen=true/);
  assert.match(source, /const close=\(\)=>\{resetCreatorSearch\(\);state.addCreatorOpen=false/);
  assert.match(source, /input.oninput=e=>\{resetCreatorSearch\(\);/);
  assert.match(source, /resetCreatorSearch\(\);state.creatorPlatform=el.dataset.creatorPlatform/);
});
