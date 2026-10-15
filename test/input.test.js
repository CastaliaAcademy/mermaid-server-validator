import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../src/index.js';
test('rejects nonstrings and empty sources before allocating workers', async () => {
  for (const source of [null, undefined, 123, {}, [], '', '  \n\t']) {
    const result = await validateMermaid(source);
    assert.equal(result?.valid, false);
    assert.equal(result.error.kind, 'input');
  }
});
