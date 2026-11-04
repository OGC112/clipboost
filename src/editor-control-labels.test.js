import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./app.js', import.meta.url), 'utf8');

// These controls have adjacent visual text rather than wrapping <label> elements.
// Check the actual editor template so their names also exist before any binding.
for (const [id, tag, name] of [
  ['captionPreferenceSelect', 'select', 'Captions'],
  ['captionScaleRange', 'input', 'Caption size (percent)'],
  ['hookTitleEnabledSelect', 'select', 'Show hook title'],
  ['hookTitleDurationSelect', 'select', 'Hook title duration'],
  ['hookTitleScaleRange', 'input', 'Hook title size (percent)'],
  ['sourceSubtitleModeSelect', 'select', 'Remove Twitch / source captions'],
  ['sourceSubtitleBottomRange', 'input', 'Source subtitle bottom area (percent)'],
]) {
  test(`${id} has a descriptive accessible name`, () => {
    const controls = [...source.matchAll(new RegExp(`<${tag}\\b[^>]*\\bid="${id}"[^>]*>`, 'g'))];
    assert.equal(controls.length, 1);
    assert.ok(controls[0][0].includes(`aria-label="${name}"`));
    if (tag === 'input') assert.ok(controls[0][0].includes('type="range"'));
  });
}
