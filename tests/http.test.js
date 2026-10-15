import { afterAll, beforeAll, expect, test } from 'bun:test';
import { startServer, createHandler, serverConfig } from '../src/server.js';
import { createValidator } from '../src/http-validator.js';

let service;
let base;
beforeAll(() => {
  service = startServer({hostname: '127.0.0.1', port: 0});
  base = service.server.url;
});
afterAll(async () => { await service.close(); });
async function post(path, body, headers = {'Content-Type': 'application/json'}) {
  return fetch(new URL(path, base), {method: 'POST', headers,
    body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body)});
}
async function result(path, source) {
  const response = await post(path, {source});
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  return response.json();
}

test('both routes: exact success and syntax-error shapes with actual Mermaid', async () => {
  expect(await result('/validate', 'flowchart TD\n A[Привет 👋] --> B')).toEqual({valid: true});
  expect(await result('/validate', 'flowchart TD\n A --> )')).toEqual({valid: false});
  expect(await result('/validate/detailed', 'sequenceDiagram\n Alice->>Bob: Hello')).toEqual({valid: true, error: null});
  const invalid = await result('/validate/detailed', 'flowchart TD\n A --> )');
  expect(Object.keys(invalid)).toEqual(['valid', 'error']);
  expect(invalid.valid).toBe(false);
  expect(invalid.error.message).toStartWith('Lexical error on line 2.');
  expect(invalid.error.position).toEqual({line: 2, column: null});
  expect(Object.keys(invalid.error)).toEqual(['message', 'position']);
}, 15000);

test('diagnostic provenance: CRLF and CR, transformed text, unknown and synthetic EOF', async () => {
  for (const newline of ['\r\n', '\r']) {
    const body = await result('/validate/detailed', `flowchart TD${newline} A --> )`);
    expect(body.error.position).toEqual({line: 2, column: null});
  }
  for (const source of ['unknown diagram', '\nflowchart TD\n A --> )',
    '%% comment\nflowchart TD\n A --> )', 'flowchart TD\n A -->',
    '---\ntitle: Example\n---\nflowchart TD\n A --> )']) {
    const body = await result('/validate/detailed', source);
    expect(body.valid).toBe(false);
    expect(body.error.message.length).toBeGreaterThan(0);
    expect(body.error.position).toBeNull();
  }
}, 15000);

test('Langium syntax failure is not an internal error', async () => {
  const body = await result('/validate/detailed', 'pie\n???');
  expect(body.valid).toBe(false);
  expect(body.error.position).toBeNull();
});

test('routing precedence, media type and response headers', async () => {
  const unknown = await fetch(new URL('/missing', base));
  expect(unknown.status).toBe(404);
  const method = await fetch(new URL('/validate', base));
  expect(method.status).toBe(405);
  expect(method.headers.get('allow')).toBe('POST');
  expect((await post('/validate/', {})).status).toBe(404);
  expect((await post('/validate', {}, {})).status).toBe(415);
  expect((await post('/validate', {}, {'Content-Type': 'application/json', 'Content-Encoding': 'gzip'})).status).toBe(415);
  const response = await post('/validate?ignored=true', {source: 'flowchart TD\n A-->B'}, {'Content-Type': 'Application/JSON; charset=UTF-8'});
  expect(await response.json()).toEqual({valid: true});
});

test('invalid JSON, UTF-8, schema and sizes are safe client errors', async () => {
  for (const path of ['/validate', '/validate/detailed']) {
    for (const body of ['', '{', new Uint8Array([0xff])]) {
      const response = await post(path, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('INVALID_JSON');
    }
    for (const value of [null, [], '', 1, {}, {source: 1}, {source: ''}, {source: ' \n '}, {source: 'x', extra: true}]) {
      const response = await post(path, JSON.stringify(value));
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(Object.keys(body)).toEqual(['error']);
      expect(body.error.code).toBe('INVALID_INPUT');
    }
    for (const body of [' '.repeat(131073), JSON.stringify({source: 'x'.repeat(50001)}), JSON.stringify({source: '漢'.repeat(33334)})]) {
      const response = await post(path, body);
      expect(response.status).toBe(413);
      expect((await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
    }
  }
  expect(await result('/validate', 'flowchart TD\n A-->B')).toEqual({valid: true});
});

test('streaming byte limit applies without Content-Length', async () => {
  const handler = createHandler({validate() {throw new Error('must not parse oversized input');}});
  const body = new ReadableStream({start(controller) {
    controller.enqueue(new Uint8Array(70000));
    controller.enqueue(new Uint8Array(70000));
    controller.close();
  }});
  const response = await handler(new Request('http://local/validate', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body,
  }));
  expect(response.status).toBe(413);
  expect((await response.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
});

test('parallel admission has two independent workers and rejects overflow', async () => {
  const validator = createValidator();
  try {
    const first = validator.validate('flowchart TD\n A-->B');
    const second = validator.validate('sequenceDiagram\n Alice->>Bob: Hello');
    expect(validator.active).toBe(2);
    await expect(validator.validate('unknown')).rejects.toMatchObject({code: 'BUSY'});
    expect((await Promise.all([first, second])).map(item => item.valid)).toEqual([true, true]);
    expect(validator.active).toBe(0);
    expect((await validator.validate('flowchart TD\n A --> )')).valid).toBe(false);
    expect((await validator.validate('flowchart TD\n A --> B')).valid).toBe(true);
  } finally { await validator.close(); }
}, 15000);

test('directives and frontmatter cannot poison later requests', async () => {
  for (const source of [
    '%%{init: {"securityLevel":"loose","secure":[],"flowchart":{"defaultRenderer":"bogus"}}}%%\nflowchart TD\n A["<b>Hello</b>"] --> B',
    '---\nconfig:\n  securityLevel: loose\n  secure: []\n  flowchart:\n    defaultRenderer: bogus\n---\nflowchart TD\n A --> B',
  ]) {
    expect(await result('/validate', source)).toEqual({valid: true});
    expect(await result('/validate', 'flowchart TD\n A --> B')).toEqual({valid: true});
  }
}, 15000);

test('runtime exceptions have safe 500 envelopes', async () => {
  const handler = createHandler({validate() {throw new Error('secret /private/path\n at stack');}});
  const response = await handler(new Request('http://local/validate/detailed', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({source: 'flowchart TD'})}));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({error: {code: 'INTERNAL_ERROR', message: 'Validation service failed.'}});
});

test('startup configuration rejects invalid ports and empty hosts', () => {
  expect(serverConfig({})).toEqual({hostname: '0.0.0.0', port: 3000});
  for (const PORT of ['', '0', '65536', '-1', '3.5', '3x', ' 3000', '1e3']) {
    expect(() => serverConfig({PORT})).toThrow();
  }
  expect(() => serverConfig({HOST: ' '})).toThrow();
});
