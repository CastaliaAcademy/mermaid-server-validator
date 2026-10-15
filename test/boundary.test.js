import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../src/index.js';
test('accepts exactly 50000 UTF-16 units and exactly 100000 UTF-8 bytes', async () => {
  const prefix = 'flowchart TD\nA["';
  const suffix = '"]';
  const ascii = prefix + 'a'.repeat(50000 - prefix.length - suffix.length) + suffix;
  assert.equal(ascii.length, 50000);
  assert.equal((await validateMermaid(ascii)).valid, true);
  const unicode = prefix + '界'.repeat(33320);
  const source = unicode + 'a'.repeat(100000 - Buffer.byteLength(unicode + suffix)) + suffix;
  assert.equal(Buffer.byteLength(source), 100000);
  assert.ok(source.length < 50000);
  assert.equal((await validateMermaid(source)).valid, true);
});
