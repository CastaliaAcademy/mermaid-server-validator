import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../src/http-validator.js';
import { createHandler } from '../src/server.js';

test('deadline terminates actual CPU-bound child and frees both slots', async () => {
  const validator = createValidator({timeoutMs: 100,
    worker: fileURLToPath(new URL('./fixtures/http-hang.js', import.meta.url))});
  const handler = createHandler(validator);
  try {
    const send = () => handler(new Request('http://local/validate', {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: '{"source":"flowchart TD"}'}));
    const first = send();
    const second = send();
    const overflow = await send();
    expect(overflow.status).toBe(503);
    expect((await overflow.json()).error.code).toBe('BUSY');
    for (const response of await Promise.all([first, second])) {
      expect(response.status).toBe(504);
      expect((await response.json()).error.code).toBe('VALIDATION_TIMEOUT');
    }
    expect(validator.active).toBe(0);
    expect((await send()).status).toBe(504);
    expect(validator.active).toBe(0);
  } finally { await validator.close(); }
});

test('missing worker is internal failure, not a syntax error', async () => {
  const validator = createValidator({worker: '/nonexistent-mermaid-worker.js'});
  try {
    await expect(validator.validate('flowchart TD')).rejects.toMatchObject({code: 'INTERNAL_ERROR'});
    expect(validator.active).toBe(0);
  } finally { await validator.close(); }
});
