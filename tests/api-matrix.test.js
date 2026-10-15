import { afterAll, beforeAll, expect, test } from 'bun:test';
import { startServer, createHandler, BODY_MAX_BYTES, SOURCE_MAX_UTF16, SOURCE_MAX_UTF8_BYTES } from '../src/server.js';

let service;
beforeAll(() => { service = startServer({hostname: '127.0.0.1', port: 0}); });
afterAll(async () => { await service.close(); });
const routes = ['/validate', '/validate/detailed'];
async function send(path, body, headers = {'Content-Type': 'application/json'}) {
  const response = await fetch(new URL(path, service.server.url), {method: 'POST', headers, body});
  expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(response.headers.get('cache-control')).toBe('no-store');
  return {status: response.status, body: await response.json()};
}

const diagrams = [
  ['flowchart', 'flowchart TD\n A["Привет 👋"] --> B["世界"]'],
  ['sequence', 'sequenceDiagram\n participant A as Алиса\n participant B as Боб\n A->>B: Привет 🌍'],
  ['class', 'classDiagram\n Animal <|-- Duck\n Animal : +int age'],
  ['state', 'stateDiagram-v2\n [*] --> Active\n Active --> [*]'],
  ['ER', 'erDiagram\n CUSTOMER ||--o{ ORDER : places'],
  ['pie', 'pie title Languages\n "Русский" : 40\n "中文" : 60'],
];
for (const path of routes) {
  test(`${path}: diagram families with real Mermaid/jsdom over HTTP`, async () => {
    for (const [name, source] of diagrams) {
      const result = await send(path, JSON.stringify({source}));
      expect(result.status, name).toBe(200);
      expect(result.body, name).toEqual(path === '/validate' ? {valid: true} : {valid: true, error: null});
    }
  }, 20000);

  test(`${path}: detailed input schema, absent body, malformed encoding and media`, async () => {
    expect(await send(path, undefined)).toMatchObject({status: 400, body: {error: {code: 'INVALID_JSON'}}});
    for (const source of [null, true, false, 0, [], {}, ['flowchart TD']]) {
      expect(await send(path, JSON.stringify({source}))).toMatchObject({status: 400, body: {error: {code: 'INVALID_INPUT'}}});
    }
    for (const body of ['true', 'false', '"source"', '{"source":"x",}', '{"source":NaN}',
      new Uint8Array([0xc3, 0x28]), new Uint8Array([0xe2, 0x82])]) {
      expect(await send(path, body)).toMatchObject({status: 400});
    }
    for (const media of ['text/plain', 'application/json; charset=latin1', 'application/json; boundary=x', 'application/problem+json']) {
      expect(await send(path, '{}', {'Content-Type': media})).toMatchObject({status: 415, body: {error: {code: 'UNSUPPORTED_MEDIA_TYPE'}}});
    }
    expect(await send(path, '{"source":"flowchart TD"}', {'Content-Type': 'application/json; charset="UTF-8"',
      'Content-Encoding': 'identity'})).toMatchObject({status: 200, body: {valid: true}});
  }, 10000);

  test(`${path}: errors and init directives do not contaminate subsequent/parallel parsing`, async () => {
    const baseline = 'flowchart TD\n A --> B --> C';
    const baselineResult = await send(path, JSON.stringify({source: baseline}));
    for (const source of ['unknown diagram', 'sequenceDiagram\n Alice->>Bob Hello',
      '---\ntitle: [broken\n---\nflowchart TD\n A-->B',
      '%%{init: {"maxTextSize":1,"maxEdges":0,"secure":[]}}%%\n' + baseline]) {
      const result = await send(path, JSON.stringify({source}));
      expect(result.status).toBe(200);
      if (source.startsWith('%%')) expect(result.body.valid).toBe(true);
      else {
        expect(result.body.valid).toBe(false);
        if (path.endsWith('detailed')) {
          expect(result.body.error.message.length).toBeGreaterThan(0);
          expect(result.body.error.message).not.toContain(' at ');
        } else expect(result.body).toEqual({valid: false});
      }
      expect(await send(path, JSON.stringify({source: baseline}))).toEqual(baselineResult);
    }
    for (let round = 0; round < 2; round++) {
      const [valid, invalid] = await Promise.all([
        send(path, JSON.stringify({source: baseline})),
        send(path, JSON.stringify({source: 'flowchart TD\n A --> )'})),
      ]);
      expect(valid).toEqual(baselineResult);
      expect(invalid.status).toBe(200);
      expect(invalid.body.valid).toBe(false);
    }
    expect(service.validator.active).toBe(0);
  }, 20000);
}

test('HTTP accepts exact UTF-16 and UTF-8 source limits with real parser', async () => {
  const prefix = 'flowchart TD\n A["';
  const suffix = '"]';
  const ascii = prefix + 'a'.repeat(SOURCE_MAX_UTF16 - prefix.length - suffix.length) + suffix;
  // 25,000 CJK chars plus 25,000 ASCII chars total 100,000 bytes, exactly
  // 50,000 UTF-16 units; punctuation is included in the ASCII part.
  const unicode = prefix + '漢'.repeat(25000) + 'a'.repeat(25000 - prefix.length - suffix.length) + suffix;
  expect(ascii.length).toBe(SOURCE_MAX_UTF16);
  expect(unicode.length).toBe(SOURCE_MAX_UTF16);
  expect(new TextEncoder().encode(unicode).byteLength).toBe(SOURCE_MAX_UTF8_BYTES);
  for (const path of routes) {
    for (const source of [ascii, unicode]) {
      expect(await send(path, JSON.stringify({source}))).toMatchObject({status: 200, body: {valid: true}});
    }
  }
}, 15000);

test('exact body boundary, escaped JSON overhead, no-body and stream read failures', async () => {
  const calls = [];
  const handler = createHandler({validate(source) { calls.push(source); return {valid: true, error: null}; }});
  const request = body => new Request('http://local/validate/detailed', {method: 'POST',
    headers: {'Content-Type': 'application/json'}, body});
  const json = '{"source":"flowchart TD"}';
  expect((await handler(request(json + ' '.repeat(BODY_MAX_BYTES - json.length)))).status).toBe(200);
  expect((await handler(request(json + ' '.repeat(BODY_MAX_BYTES - json.length + 1)))).status).toBe(413);
  const escaped = '{"source":"' + '\\u0061'.repeat(22000) + '"}';
  expect((await handler(request(escaped))).status).toBe(413);
  expect((await handler(request(undefined))).status).toBe(400);
  const stream = new ReadableStream({start(controller) {controller.error(new Error('private stream failure'));}});
  const broken = await handler(request(stream));
  expect(broken.status).toBe(500);
  expect(await broken.json()).toEqual({error: {code: 'INTERNAL_ERROR', message: 'Validation service failed.'}});
  expect(calls).toEqual(['flowchart TD']);
});
