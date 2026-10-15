import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { createValidator } from '../src/http-validator.js';

test('malformed worker protocol is internal and each failure releases capacity for recovery', async () => {
  const validator = createValidator({worker: fileURLToPath(new URL('./fixtures/http-protocol.js', import.meta.url))});
  try {
    for (const mode of ['exit', 'json', 'kind', 'boolean', 'success-error', 'missing-error', 'message']) {
      await expect(validator.validate(mode)).rejects.toMatchObject({code: 'INTERNAL_ERROR'});
      expect(validator.active).toBe(0);
      expect(await validator.validate('ok')).toEqual({valid: true, error: null});
    }
  } finally { await validator.close(); }
});

test('spawn failure is safe; shutdown kills active work and refuses future parsing', async () => {
  const missing = createValidator({executable: '/nonexistent-mermaid-bun'});
  try {
    await expect(missing.validate('flowchart TD')).rejects.toMatchObject({code: 'INTERNAL_ERROR'});
    expect(missing.active).toBe(0);
  } finally { await missing.close(); }
  const validator = createValidator({worker: fileURLToPath(new URL('./fixtures/http-hang.js', import.meta.url))});
  const pending = validator.validate('flowchart TD');
  const outcome = pending.catch(error => error);
  expect(validator.active).toBe(1);
  await validator.close();
  expect(await outcome).toMatchObject({code: 'INTERNAL_ERROR'});
  expect(validator.active).toBe(0);
  await expect(validator.validate('flowchart TD')).rejects.toMatchObject({code: 'INTERNAL_ERROR'});
  await validator.close();
});
