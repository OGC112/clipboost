import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewCaptionMarkup, captionWordImportant } from './preview-caption-markup.js';

const words = [{ word: 'Secret', start: 0 }, { word: 'here', start: 1 }];
const render = (effect, extra = {}) => buildPreviewCaptionMarkup({
  words, activeSpeechWord: words[1], text: 'Secret here', effect, accent: '#35e7ff', ...extra,
});

test('word effects preserve active-word and cumulative highlight boundaries', () => {
  assert.equal(render('word-pop'), '<span style="display:inline-block;color:#35e7ff;transform:scale(1.12);font-weight:900">here</span>');
  assert.equal(render('active-word'), '<span style="color:#fff;display:inline-block;">Secret</span> <span style="color:#35e7ff;display:inline-block;transform:scale(1.08);">here</span>');
  assert.equal(render('karaoke'), '<span style="color:#35e7ff;display:inline-block">Secret</span> <span style="color:#35e7ff;display:inline-block">here</span>');
  assert.equal(render('keyword-color'), '<span style="color:#35e7ff;display:inline-block;transform:scale(1.08);">Secret</span> <span style="color:#fff;display:inline-block;">here</span>');
});

test('static and unknown effects retain phrase text and missing-text fallback', () => {
  for (const effect of ['clean-bold', 'unknown']) {
    assert.equal(render(effect), '<span style="color:#35e7ff">Secret here</span>');
    assert.equal(render(effect, { text: '' }), '<span style="color:#35e7ff">here</span>');
  }
});

test('every effect escapes transcript text before it reaches preview HTML', () => {
  const word = { word: `<b>&"'`, start: 0 };
  for (const effect of ['word-pop', 'active-word', 'karaoke', 'keyword-color', 'clean-bold']) {
    const markup = render(effect, { words: [word], activeSpeechWord: word, text: word.word });
    assert.ok(markup.includes('&lt;b&gt;&amp;&quot;&#39;'), effect);
    assert.ok(!markup.includes(word.word), effect);
  }
});

test('active-word matching keeps the existing timestamp tolerance and first-word fallback', () => {
  assert.equal(render('word-pop', { activeSpeechWord: { start: 1.01 } }), render('word-pop'));
  assert.match(render('word-pop', { activeSpeechWord: { start: 5 } }), />Secret<\/span>/);
});

test('keyword emphasis preserves numbers, long words and French and English keywords', () => {
  for (const word of ['42%', 'something', 'SECRET!', 'vérité', 'résultat', 'best']) {
    assert.equal(captionWordImportant(word), true, word);
  }
  for (const word of ['', 'hello', 'here', '...']) assert.equal(captionWordImportant(word), false, word);
});
