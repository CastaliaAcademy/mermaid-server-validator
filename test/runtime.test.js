import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { engineError } from '../src/errors.js';

test('real bare-Node DOMPurify engine failure is internal, never syntax', async () => {
  // This process has no jsdom globals; use official Mermaid, not a mock.
  const { default: mermaid } = await import('mermaid');
  let caught;
  try {await mermaid.parse('flowchart TD\n A[Hello]-->B[World]');} catch(error) {caught = error;}
  assert.ok(caught instanceof TypeError);
  assert.match(caught.message, /DOMPurify\.addHook/);
  assert.equal(engineError(caught).error.kind, 'internal');
});
test('broken Mermaid installation returns internal through API and CLI, no injection API', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mermaid-broken-'));
  try {
    await cp(new URL('../src', import.meta.url), join(dir, 'src'), {recursive: true});
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await mkdir(join(dir, 'node_modules'));
    await symlink(new URL('../node_modules/jsdom', import.meta.url).pathname, join(dir, 'node_modules/jsdom'));
    const {validateMermaid} = await import(pathToFileURL(join(dir, 'src/index.js')));
    const result = await validateMermaid('flowchart TD\nA-->B');
    assert.equal(result.error.kind, 'internal');
    assert.match(result.error.message, /mermaid/i);
    const cli = spawnSync(process.execPath, [join(dir, 'src/cli.js')], {
      input: 'flowchart TD\nA-->B', encoding: 'utf8', timeout: 10000,
    });
    assert.equal(cli.status, 4, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).error.kind, 'internal');
  } finally { await rm(dir, {recursive: true, force: true}); }
});
test('unexpected worker exit is internal and releases capacity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mermaid-exit-'));
  try {
    await cp(new URL('../src', import.meta.url), join(dir, 'src'), {recursive: true});
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    await writeFile(join(dir, 'src/worker.js'), 'process.exit(0);');
    const {validateMermaid} = await import(pathToFileURL(join(dir, 'src/index.js')));
    for (let i = 0; i < 3; i++) {
      const result = await validateMermaid('flowchart TD\nA-->B');
      assert.equal(result.error.kind, 'internal');
      assert.match(result.error.message, /without a result/);
    }
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('deadline actually terminates a synchronously blocked worker, not Promise.race only', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mermaid-blocked-'));
  try {
    await cp(new URL('../src', import.meta.url), join(dir, 'src'), {recursive: true});
    await writeFile(join(dir, 'package.json'), '{"type":"module"}');
    // Fault injection in an isolated copy, never a public API hook.
    await writeFile(join(dir, 'src/worker.js'), 'while (true) {}');
    const {validateMermaid} = await import(pathToFileURL(join(dir, 'src/index.js')));
    const start = performance.now();
    for (let i = 0; i < 3; i++) {
      const result = await validateMermaid('flowchart TD\nA-->B', {timeoutMs: 100});
      assert.equal(result.error.kind, 'timeout');
    }
    assert.ok(performance.now() - start < 3000);
  } finally { await rm(dir, {recursive: true, force: true}); }
});
