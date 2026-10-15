import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../src/index.js';
for (const [name, source] of [
  ['flowchart', 'flowchart TD\n A[unclosed'],
  ['sequence', 'sequenceDiagram\n A->>B'],
  ['unknown', 'not-a-mermaid-diagram'],
  ['fenced Markdown', '\x60\x60\x60mermaid\nflowchart TD\nA-->B\n\x60\x60\x60'],
  ['frontmatter', '---\nconfig: [bad\n---\nflowchart TD\nA-->B'],
]) test(`reports ${name} syntax errors`, async () => {
  const result = await validateMermaid(source);
  assert.equal(result.valid, false);
  assert.equal(result.error.kind, 'syntax', JSON.stringify(result));
  assert.equal(typeof result.error.message, 'string');
});
