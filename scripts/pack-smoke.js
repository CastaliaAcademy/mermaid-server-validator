import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = await mkdtemp(join(tmpdir(), 'mermaid-pack-'));
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: dir, encoding: 'utf8', timeout: 180000, ...options });
  process.stdout.write(`$ ${command} ${args.join(' ')}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  assert.equal(result.status, 0, result.error?.message ?? `exit ${result.status}`);
  return result.stdout;
}
try {
  await mkdir(join(dir, 'npm')); await mkdir(join(dir, 'pnpm'));
  run('npm', ['pack', '--json', '--pack-destination', join(dir, 'npm')], {cwd: root});
  run('pnpm', ['pack', '--pack-destination', join(dir, 'pnpm')], {cwd: root});
  const tarball = join(dir, 'pnpm', 'castalia-mermaid-validator-0.1.0.tgz');
  await writeFile(join(dir, 'package.json'), JSON.stringify({name: 'clean-consumer', private: true, type: 'module'}));
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball]);
  const installed = JSON.parse(await readFile(join(dir, 'node_modules/@castalia/mermaid-validator/package.json'), 'utf8'));
  assert.deepEqual(installed.dependencies, {mermaid: '12.1.0', jsdom: '30.1.3'});
  await writeFile(join(dir, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { validateMermaid } from '@castalia/mermaid-validator';
assert.deepEqual(await validateMermaid('flowchart TD\\nA["Привет"]-->B'), {valid: true, diagramType: 'flowchart-v2'});
assert.equal((await validateMermaid('flowchart TD\\nA[')).error.kind, 'syntax');
console.log('clean ESM import: success + syntax verified');
`);
  run(process.execPath, ['consumer.mjs']);
  const typeSource = await readFile(join(root, 'test/types.ts'), 'utf8');
  await writeFile(join(dir, 'consumer.mts'), typeSource);
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'consumer.mts']);
  const output = run(join(dir, 'node_modules/.bin/castalia-mermaid-validate'), [], {input: 'sequenceDiagram\nA->>B: Привет'});
  assert.deepEqual(JSON.parse(output), {valid: true, diagramType: 'sequence'});
  console.log('PASS: npm pack, pnpm pack, clean npm install, ESM API, declarations, installed CLI');
} finally {
  await rm(dir, {recursive: true, force: true});
}
