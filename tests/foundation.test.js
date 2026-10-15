import { afterAll, expect, test } from 'bun:test';
import { initializeEngine } from '../src/engine.js';

// Toolchain smoke only: this is NOT the HTTP implementation or isolation test.
// Initialize DOM before dynamically importing the actual official Mermaid.
const { mermaid, dom } = await initializeEngine();
afterAll(() => dom.window.close());

test('pinned Bun can parse Mermaid using jsdom', async () => {
  expect(Bun.version).toBe('1.4.3');
  const result = await mermaid.parse('flowchart TD\n  A --> B');
  expect(result.diagramType).toBe('flowchart-v2');
});

test('official parser rejects an unknown diagram type', async () => {
  await expect(mermaid.parse('not-a-mermaid-diagram')).rejects.toThrow();
});
