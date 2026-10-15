import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../src/index.js';
test('bounds source UTF-16 units and UTF-8 bytes independently', async () => {
  for (const source of ['x'.repeat(50_001), '😀'.repeat(25_000) + 'a', '界'.repeat(33_334)]) {
    const result = await validateMermaid(source);
    assert.equal(result.error?.kind, 'input', JSON.stringify(result));
  }
});
test('rejects invalid or arbitrary caller options', async () => {
  for (const options of [null, [], 1, {timeoutMs: 0}, {timeoutMs: NaN}, {timeoutMs: null}, {timeoutMs: 30_001}, {timeoutMs: 1.1}, {config: {}}, {securityLevel: 'loose'}]) {
    const result = await validateMermaid('flowchart TD\nA-->B', options);
    assert.equal(result.error?.kind, 'input', JSON.stringify(result));
  }
});
