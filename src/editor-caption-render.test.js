import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const start = source.indexOf('    if(shortVideo&&liveCaption){');
const captionSource = source.slice(start, source.indexOf('    const manualTrimStart=', start));

function setup(effect = 'active-word', rows = [{ start: 0, end: 2, text: 'Hello world' }]) {
  let writes = 0, markup = '';
  let wordScans = 0;
  let keywordChecks = 0;
  const words = [{ start: 0, end: .8, word: 'Hello' }, { start: 1, end: 2, word: 'world' }];
  words.filter = predicate => { wordScans++; return Array.prototype.filter.call(words, predicate); };
  const listeners = {};
  const shortVideo = { currentTime: .2, paused: true, addEventListener: (name, fn) => { listeners[name] = fn; } };
  const liveCaption = { style: {}, set innerHTML(value) { writes++; markup = value; } };
  const hook = { style: {} };
  const state = { video: { candidates: [{ start: 0, end: 4 }] }, captionEffect: effect, hookTitleEnabled: true, hookTitleText: 'Hook', hookTitleDuration: '1' };
  const frames = new Map();
  let frameId = 0;
  const context = vm.createContext({
    disposePreviewCaptionClock: null,
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    shortVideo, liveCaption, state,
    document: { getElementById: () => hook },
    previewCaptionRowsForCandidate: () => rows,
    previewCaptionWordsForCandidate: () => words,
    captionWordImportant: word => { keywordChecks++; return word === 'Hello'; },
  });
  vm.runInContext(captionSource, context);
  return { state, shortVideo, liveCaption, hook, context, frames, listeners, sync: () => listeners.timeupdate(), writes: () => writes, markup: () => markup, wordScans: () => wordScans, keywordChecks: () => keywordChecks };
}

test('unchanged playback skips caption markup construction while hook and visibility stay current', () => {
  const c = setup('keyword-color');
  const initialChecks = c.keywordChecks();
  assert.ok(initialChecks > 0);
  for (let i = 0; i < 120; i++) c.sync();
  assert.equal(c.keywordChecks(), initialChecks);
  c.state.hookTitleEnabled = false;
  c.state.captionPreference = 'off'; c.sync();
  assert.equal(c.hook.style.visibility, 'hidden');
  assert.equal(c.liveCaption.style.visibility, 'hidden');
  c.state.captionPreference = 'auto'; c.sync();
  assert.equal(c.liveCaption.style.visibility, 'visible');
  assert.equal(c.keywordChecks(), initialChecks);
  c.state.captionColor = 'cyan'; c.sync();
  assert.equal(c.keywordChecks(), initialChecks * 2);
  assert.match(c.markup(), /#35e7ff/);
  c.shortVideo.currentTime = 3; c.sync();
  assert.equal(c.markup(), '');
  c.shortVideo.currentTime = .2; c.sync();
  assert.equal(c.keywordChecks(), initialChecks * 3);
  assert.match(c.markup(), /Hello/);
});

test('playback reuses phrase membership across ticks, word transitions and style changes', () => {
  const c = setup();
  for (let i = 0; i < 120; i++) c.sync();
  c.shortVideo.currentTime = 1.2; c.sync();
  assert.match(c.markup(), /scale\(1.08\)[^>]*>world/);
  c.state.captionEffect = 'word-pop'; c.sync();
  assert.match(c.markup(), />world<\/span>/);
  c.state.captionColor = 'cyan'; c.sync();
  assert.match(c.markup(), /#35e7ff/);
  assert.equal(c.wordScans(), 1);
});

test('phrase changes and backwards seeks recompute membership without retaining old words', () => {
  const c = setup('active-word', [{ start: 0, end: .8, text: 'Hello' }, { start: 1, end: 2, text: 'world' }]);
  assert.match(c.markup(), />Hello<\/span>/);
  assert.doesNotMatch(c.markup(), /world/);
  c.shortVideo.currentTime = 1.2; c.sync(); c.sync();
  assert.match(c.markup(), />world<\/span>/);
  assert.doesNotMatch(c.markup(), /Hello/);
  assert.equal(c.wordScans(), 2);
  c.shortVideo.currentTime = .2; c.sync();
  assert.match(c.markup(), />Hello<\/span>/);
  assert.doesNotMatch(c.markup(), /world/);
  assert.equal(c.wordScans(), 3);
});

for (const effect of ['active-word', 'word-pop', 'karaoke', 'keyword-color', 'clean-bold']) {
  test(`${effect}: repeated playback updates preserve identical caption DOM`, () => {
    const c = setup(effect);
    const initial = c.markup();
    for (let i = 0; i < 120; i++) { c.shortVideo.currentTime = .2 + i / 1000; c.sync(); }
    assert.equal(c.writes(), 1);
    assert.equal(c.markup(), initial);
    c.state.captionColor = 'cyan'; c.sync();
    assert.equal(c.writes(), 2);
    assert.match(c.markup(), /#35e7ff/);
  });
}

test('word transitions, silence, backwards seeking and caption toggles stay current', () => {
  const c = setup();
  const first = c.markup();
  c.shortVideo.currentTime = 1.2; c.sync();
  assert.equal(c.writes(), 2);
  assert.notEqual(c.markup(), first);
  assert.equal(c.hook.style.visibility, 'hidden');
  c.shortVideo.currentTime = 3; c.sync(); c.sync();
  assert.equal(c.writes(), 3);
  assert.equal(c.markup(), '');
  assert.equal(c.liveCaption.style.visibility, 'hidden');
  c.shortVideo.currentTime = .2; c.sync();
  assert.equal(c.writes(), 4);
  assert.equal(c.markup(), first);
  assert.equal(c.hook.style.visibility, 'visible');
  c.state.captionPreference = 'off'; c.sync();
  assert.equal(c.liveCaption.style.visibility, 'hidden');
  c.state.captionPreference = 'auto'; c.sync();
  assert.equal(c.liveCaption.style.visibility, 'visible');
  assert.equal(c.writes(), 4);
  c.state.captionEffect = 'word-pop'; c.sync();
  assert.equal(c.writes(), 5);
});

test('render cancels the old preview frame before replacing DOM, even without a pause event', () => {
  const c = setup();
  c.shortVideo.paused = false;
  c.listeners.play();
  assert.equal(c.frames.size, 1);
  const pendingTick = [...c.frames.values()][0];
  c.state.page = 'home';
  const blank = () => '';
  for (const name of ['home', 'campaignDiscover', 'studio', 'campaigns', 'campaignEditor', 'analytics', 'library', 'projects', 'publish', 'settings', 'side', 'top', 'campaignAssetBrowserMarkup', 'modalMarkup', 'bind']) c.context[name] = blank;
  let replacements = 0;
  c.context.document = { getElementById: () => ({ set innerHTML(value) {
    assert.equal(c.frames.size, 0, 'clock must stop before DOM replacement');
    replacements++;
  } }) };
  const renderStart = source.indexOf('  function render(){');
  vm.runInContext(source.slice(renderStart, source.indexOf('  function bind(){', renderStart)), c.context);
  c.context.render();
  assert.equal(replacements, 1);
  assert.equal(c.context.disposePreviewCaptionClock, null);
  // Late media events and a callback already dispatched must not revive the loop.
  const writes = c.writes();
  c.shortVideo.currentTime = 1.2;
  c.listeners.play();
  pendingTick();
  assert.equal(c.frames.size, 0);
  assert.equal(c.writes(), writes);
  c.context.render();
  assert.equal(replacements, 2);
});

test('pause stops the preview frame and playback can start it again', () => {
  const c = setup();
  c.shortVideo.paused = false;
  c.listeners.play();
  c.listeners.play();
  assert.equal(c.frames.size, 1);
  c.shortVideo.paused = true;
  c.listeners.pause();
  assert.equal(c.frames.size, 0);
  c.shortVideo.paused = false;
  c.listeners.play();
  assert.equal(c.frames.size, 1);
});

test('buffering suspends caption frames until playback resumes without a new play event', () => {
  const c = setup();
  c.shortVideo.paused = false;
  c.listeners.play();
  assert.equal(c.frames.size, 1);
  c.listeners.waiting();
  c.listeners.waiting();
  assert.equal(c.shortVideo.paused, false);
  assert.equal(c.frames.size, 0);

  // Seeks and style edits still update captions while the frame loop is idle.
  c.shortVideo.currentTime = 1.2;
  c.listeners.seeked();
  assert.match(c.markup(), /scale\(1.08\)[^>]*>world/);
  c.state.captionColor = 'cyan';
  c.sync();
  assert.match(c.markup(), /#35e7ff/);
  assert.equal(c.frames.size, 0);

  c.listeners.playing();
  c.listeners.playing();
  assert.equal(c.frames.size, 1, 'resuming must not create duplicate loops');
  c.listeners.waiting();
  c.context.disposePreviewCaptionClock();
  c.listeners.playing();
  assert.equal(c.frames.size, 0, 'a detached preview must stay stopped');
});
