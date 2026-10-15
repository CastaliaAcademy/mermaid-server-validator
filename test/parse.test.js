import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMermaid } from '../src/index.js';
test('parses real Mermaid Cyrillic flowchart without mutating host globals', async () => {
  const snapshot = () => Object.fromEntries(['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'DOMParser', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const globals = snapshot();
  assert.deepEqual(await validateMermaid('flowchart TD\n A["Начало"] --> B["Конец"]'), {valid: true, diagramType: 'flowchart-v2'});
  assert.deepEqual(snapshot(), globals);
});
