import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonResponse } from './api-response.js';

function response(body, status = 200) {
  return { status, ok: status >= 200 && status < 300, text: async () => body };
}

test('returns successful JSON payloads and accepts empty responses', async () => {
  for (const value of [{ candidate: { start: 2, end: 8 } }, [1, 2], null, false]) {
    assert.deepEqual(await readJsonResponse(response(JSON.stringify(value))), value);
  }
  assert.deepEqual(await readJsonResponse(response('', 204)), {});
});

test('surfaces server error messages and falls back to contextual HTTP errors', async () => {
  await assert.rejects(readJsonResponse(response('{"error":"Source unavailable"}', 404), 'Preview failed'),
    { message: 'Source unavailable' });
  for (const body of ['', '{}', 'null', '{"error":""}']) {
    await assert.rejects(readJsonResponse(response(body, 503), 'Preview failed'),
      { message: 'Preview failed (HTTP 503)' });
  }
  await assert.rejects(readJsonResponse(response('{}', 500)),
    { message: 'Request failed (HTTP 500)' });
});

test('malformed responses include request context and HTTP status', async () => {
  for (const status of [200, 502]) {
    await assert.rejects(readJsonResponse(response('<html>Proxy error</html>', status), 'Export failed'),
      { message: `Export failed (server returned an invalid response, HTTP ${status})` });
  }
});

test('propagates body read failures and consumes the response only once', async () => {
  const failure = new Error('Connection interrupted');
  await assert.rejects(readJsonResponse({ text: async () => { throw failure; } }), error => error === failure);
  let reads = 0;
  const result = await readJsonResponse({ ok: true, status: 200, text: async () => { reads++; return '{"url":"/preview.mp4"}'; } });
  assert.equal(result.url, '/preview.mp4');
  assert.equal(reads, 1);
});
