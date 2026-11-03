import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const edge = process.env.CLIPBOOST_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

test('precision timeline window selector stays inside the shrinking review sidebar', { skip: !existsSync(edge) }, (t) => {
  // Keep all browser state outside the worktree. Load the production cascade.
  const dir = mkdtempSync(join(tmpdir(), 'clipboost-timeline-'));
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = [...index.matchAll(/href="\.\/([^\"]+\.css)"/g)]
    .map(([, path]) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')).join('\n');
  const html = `<!doctype html><style>${css}</style>
    <div class="mint-shorts-preview-side-v220" style="width:260px">
      <div class="mint-manual-trim"><div class="mint-precision-trim-tools">
        <div class="mint-cut-zoom"><div class="mint-cut-zoom-head">
          <b>Zoomed Cut Timeline</b><label>Window <select id="precisionWindow">
            <option>±2s</option><option selected>±5s</option><option>±10s</option>
          </select></label>
        </div></div>
      </div></div>
    </div><script>
      const results = [260, 220, 500, 220, 260].map(width => {
        document.querySelector('.mint-shorts-preview-side-v220').style.width = width + 'px';
        const head = document.querySelector('.mint-cut-zoom-head').getBoundingClientRect();
        const children = [...document.querySelectorAll('.mint-cut-zoom-head > *, select')];
        return { width, fits: children.every(child => {
          const rect = child.getBoundingClientRect();
          return rect.left >= head.left - 1 && rect.right <= head.right + 1;
        }) };
      });
      document.body.innerHTML = '<pre id="results">' + JSON.stringify(results) + '</pre>';
    </script>`;
  const fixture = join(dir, 'timeline.html');
  writeFileSync(fixture, html);
  const result = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run',
    `--user-data-dir=${join(dir, 'profile')}`, '--dump-dom', pathToFileURL(fixture).href],
  { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (result.error || result.status !== 0) {
    t.skip(`Browser could not run in this environment (${result.error?.code || result.status})`);
    return;
  }
  const data = result.stdout.match(/<pre id="results">([^<]+)<\/pre>/);
  assert.ok(data, 'browser must return layout measurements');
  for (const measurement of JSON.parse(data[1])) {
    assert.ok(measurement.fits, `timeline header overflows at sidebar width ${measurement.width}px`);
  }
});
