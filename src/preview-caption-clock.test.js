import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the clock and media event handlers from the legacy editor IIFE.
const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const start = source.indexOf('      const stopCaptionClock=');
const end = source.indexOf('      if(state.candidatePreviewAutoplay)', start);
assert.ok(start >= 0 && end > start, 'caption clock source is present');

function createClock() {
  const frames = new Map();
  const listeners = new Map();
  const video = { isConnected: true, paused: true, ended: false, currentTime: 2,
    addEventListener(name, callback) { listeners.set(name, callback); } };
  let nextId = 0;
  let syncs = 0;
  vm.runInNewContext(`let captionRaf=0;\n${source.slice(start, end)}`, {
    shortVideo: video,
    syncCaption() { syncs++; },
    requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  return { video, frames, get syncs() { return syncs; },
    emit(name) { listeners.get(name)(); },
    tick() {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback();
    },
  };
}

test('detached playing preview stops its queued clock before syncing captions', () => {
  const clock = createClock();
  clock.video.paused = false;
  clock.emit('play');
  clock.tick();
  assert.equal(clock.frames.size, 1);
  const syncs = clock.syncs;
  clock.video.isConnected = false;
  clock.tick();
  assert.equal(clock.frames.size, 0);
  assert.equal(clock.syncs, syncs);
  clock.emit('play');
  assert.equal(clock.frames.size, 0);
});

test('pause cancels polling, seeking still syncs, and resume restarts one clock', () => {
  const clock = createClock();
  assert.equal(clock.frames.size, 0);
  clock.video.paused = false;
  clock.emit('play');
  clock.video.paused = true;
  clock.emit('pause');
  assert.equal(clock.frames.size, 0);
  const syncs = clock.syncs;
  clock.emit('seeked');
  assert.equal(clock.syncs, syncs + 1);
  assert.equal(clock.frames.size, 0);
  clock.video.paused = false;
  clock.emit('play');
  clock.emit('play');
  assert.equal(clock.frames.size, 1);
  clock.tick();
  assert.equal(clock.frames.size, 1);
  clock.video.ended = true;
  clock.emit('ended');
  assert.equal(clock.frames.size, 0);
  assert.equal(clock.video.currentTime, 0);
});
