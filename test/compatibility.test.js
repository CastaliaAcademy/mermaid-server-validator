import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMermaid } from '../src/index.js';
const fixtures = JSON.parse(await readFile(new URL('./fixtures/compatibility.json', import.meta.url), 'utf8'));
for (const fixture of fixtures) test(`real Mermaid compatibility: ${fixture.id}`, async () => {
  const result = await validateMermaid(fixture.source);
  assert.equal(result.valid, fixture.expected.valid, JSON.stringify(result));
  if (result.valid) assert.equal(result.diagramType, fixture.expected.diagramType);
  else assert.equal(result.error.kind, fixture.expected.kind, JSON.stringify(result));
});
