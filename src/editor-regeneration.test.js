import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const handlerSource = source.slice(source.indexOf('    const generateVariationsBtn='), source.indexOf('    const autoIngest='));

function setup() {
  const original = { id: 'project-1', status: 'ready', analysis: { stage: 'complete', progress: 100 }, candidates: [{ start: 1, end: 8 }] };
  const state = { video: original, selectedCandidate: 2 };
  const button = {}, requests = [], notices = [], polls = [];
  let renders = 0;
  const context = vm.createContext({
    state, document: { getElementById: () => button },
    fetch: () => new Promise((resolve, reject) => requests.push({ resolve, reject })),
    readJsonResponse: async response => { if (response.error) throw new Error(response.error); return response; },
    showNotice: notice => notices.push(notice), render: () => renders++,
    pollProjectUntilSettled: id => polls.push(id),
  });
  vm.runInContext(handlerSource, context);
  return { state, original, requests, notices, polls, renders: () => renders, run: () => button.onclick() };
}

for (const failure of ['network', 'server']) {
  test(`generation ${failure} failure restores the editor and permits retry`, async () => {
    const c = setup();
    const active = c.run();
    assert.equal(c.state.video.status, 'analyzing');
    await c.run();
    assert.equal(c.requests.length, 1);
    if (failure === 'network') c.requests[0].reject(new Error('Offline'));
    else c.requests[0].resolve({ error: 'Analysis unavailable' });
    await active;
    assert.equal(c.state.video, c.original);
    assert.equal(c.state.selectedCandidate, 2);
    assert.equal(c.state.regenerating, false);
    assert.equal(c.renders(), 1);
    assert.equal(c.notices[0].title, 'Generation failed');
    assert.deepEqual(c.polls, []);
    const retry = c.run();
    assert.equal(c.requests.length, 2);
    c.requests[1].resolve({ id: 'project-1', status: 'analyzing' });
    await retry;
    assert.equal(c.state.selectedCandidate, 0);
    assert.deepEqual(c.polls, ['project-1']);
  });
}

test('generation failure preserves a project opened while the request was pending', async () => {
  const c = setup();
  const active = c.run();
  const other = { id: 'project-2', status: 'ready' };
  c.state.video = other;
  c.requests[0].reject(new Error('Offline'));
  await active;
  assert.equal(c.state.video, other);
  assert.equal(c.state.regenerating, false);
});

test('generation failure preserves newer project status received while pending', async () => {
  const c = setup();
  const active = c.run();
  const refreshed = { ...c.original, status: 'degraded' };
  c.state.video = refreshed;
  c.requests[0].reject(new Error('Connection lost'));
  await active;
  assert.equal(c.state.video, refreshed);
});

for (const change of ['another project', 'closed project', 'same project refresh']) {
  test(`generation success preserves ${change} received while pending`, async () => {
    const c = setup();
    const active = c.run();
    const replacement = change === 'closed project' ? null : {
      id: change === 'another project' ? 'project-2' : 'project-1',
      status: 'ready', candidates: [{ start: 10, end: 20 }],
    };
    c.state.video = replacement;
    c.state.selectedCandidate = 1;
    c.requests[0].resolve({ id: 'project-1', status: 'analyzing' });
    await active;
    assert.equal(c.state.video, replacement);
    assert.equal(c.state.selectedCandidate, 1);
    assert.equal(c.state.regenerating, false);
    assert.deepEqual(c.polls, [], 'stale completion must not replace the active polling loop');
    assert.deepEqual(c.notices, []);
    assert.equal(c.renders(), 1);
  });
}

test('active generation applies its response and continues polling', async () => {
  const c = setup();
  const active = c.run();
  const response = { id: 'project-1', status: 'analyzing' };
  c.requests[0].resolve(response);
  await active;
  assert.equal(c.state.video, response);
  assert.equal(c.state.selectedCandidate, 0);
  assert.equal(c.state.regenerating, false);
  assert.deepEqual(c.polls, ['project-1']);
  assert.equal(c.renders(), 0, 'polling owns the next settled render');
});
