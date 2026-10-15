import { expect, test } from 'bun:test';
import fixtures from './fixtures/compatibility.json';
import { createValidator } from '../src/http-validator.js';

test('Bun isolated HTTP engine accepts the preserved real-parser corpus', async () => {
  const validator = createValidator();
  try {
    for (const fixture of fixtures) {
      const result = await validator.validate(fixture.source);
      expect(result.valid, fixture.id).toBe(fixture.expected.valid);
      if (result.valid) expect(result.error).toBeNull();
      else {
        expect(result.error.message.length).toBeGreaterThan(0);
        expect(result.error.message.length).toBeLessThanOrEqual(2000);
      }
    }
  } finally { await validator.close(); }
}, 30000);
