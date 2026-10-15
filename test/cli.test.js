import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const cli = new URL('../src/cli.js', import.meta.url);
function run(args = [], input = '') {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli.pathname, ...args], {stdio: ['pipe', 'pipe', 'pipe']});
    const timer = setTimeout(() => {child.kill(); reject(Error('CLI hung'));}, 12000);
    let stdout = '', stderr = '';
    child.stdout.on('data', d => {stdout += d;}); child.stderr.on('data', d => {stderr += d;});
    child.stdin.on('error', () => {}); child.stdin.end(input);
    child.on('error', reject);
    child.on('close', code => {clearTimeout(timer); resolve({code, stdout, stderr});});
  });
}
test('CLI validates stdin and a UTF-8 file, emitting exactly one JSON result', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mermaid-cli-'));
  try {
    const file = join(dir, 'source.mmd');
    await writeFile(file, 'flowchart TD\nA["Привет"]-->B');
    for (const [args, input] of [[[], 'sequenceDiagram\nA->>B: Привет'], [[file], ''], [['-'], 'pie\n"Yes" : 1']]) {
      const result = await run(args, input);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).valid, true);
      assert.equal(result.stderr, '');
    }
  } finally {await rm(dir, {recursive: true, force: true});}
});
test('CLI differentiates syntax/input/timeout and bounds bytes', async () => {
  for (const [args, input, code, kind] of [
    [[], 'flowchart TD\nA[', 1, 'syntax'],
    [[], '', 2, 'input'],
    [['missing-file.mmd'], '', 2, 'input'],
    [['--wat'], '', 2, 'input'],
    [['--timeout-ms', '0'], '', 2, 'input'],
    [[], '界'.repeat(33_334), 2, 'input'],
    [[], Buffer.from([0xff]), 2, 'input'],
    [['--timeout-ms', '1'], 'flowchart TD\nA-->B', 3, 'timeout'],
  ]) {
    const result = await run(args, input);
    assert.equal(result.code, code, result.stderr + result.stdout);
    assert.equal(JSON.parse(result.stdout).error.kind, kind);
    assert.equal(result.stderr, '');
  }
});
