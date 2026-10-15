import test from 'node:test';
import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import { setImmediate } from 'node:timers/promises';
import { validateMermaid } from '../src/index.js';
const source = 'flowchart TD\n A[Hello]-->B[World]';
test('hard deadline terminates workers and allows subsequent requests', async () => {
  const started = performance.now();
  for (let i = 0; i < 4; i++) {
    const result = await validateMermaid(source, {timeoutMs: 1});
    assert.equal(result.error?.kind, 'timeout', JSON.stringify(result));
  }
  assert.ok(performance.now() - started < 3000);
  assert.equal((await validateMermaid(source)).valid, true);
});
test('at most two parallel workers, busy overflow, no worker leaks on all paths', async () => {
  const workers = new Set();
  let peak = 0;
  const hook = createHook({init(id, type) {
    if (type === 'WORKER') { workers.add(id); peak = Math.max(peak, workers.size); }
  }, destroy(id) { workers.delete(id); }}).enable();
  try {
    const results = await Promise.all(Array.from({length: 8}, () => validateMermaid(source)));
    assert.equal(results.filter(r => r.valid).length, 2, JSON.stringify(results));
    assert.equal(results.filter(r => r.error?.kind === 'busy').length, 6);
    await validateMermaid('invalid');
    await validateMermaid(source, {timeoutMs: 1});
    await setImmediate(); await setImmediate();
    assert.ok(peak <= 2, `peak=${peak}`);
    assert.equal(workers.size, 0);
    assert.ok(!process.getActiveResourcesInfo().includes('MessagePort'));
  } finally { hook.disable(); }
});
