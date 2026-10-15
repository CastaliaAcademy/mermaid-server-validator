// Instrument only our source, including real subprocesses and Node workers.
// Bun's native coverage does not collect child-process or branch coverage.
import { cp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createInstrumenter } from 'istanbul-lib-instrument';
import coverage from 'istanbul-lib-coverage';
import report from 'istanbul-lib-report';
const { createCoverageMap } = coverage;
const { createContext } = report;
import reports from 'istanbul-reports';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'coverage');
const sandbox = join(output, 'instrumented');
const raw = join(output, 'raw');
await rm(output, {recursive: true, force: true});
await mkdir(raw, {recursive: true});
await mkdir(sandbox, {recursive: true});
for (const name of ['src', 'tests', 'test', 'scripts', 'package.json', 'bunfig.toml', 'tsconfig.json']) {
  await cp(join(root, name), join(sandbox, name), {recursive: true});
}
await symlink(join(root, 'node_modules'), join(sandbox, 'node_modules'), 'dir');
const map = createCoverageMap({});
const instrumenter = createInstrumenter({esModules: true, compact: false});
// Register before top-level await or worker work, and keep stdout protocol clean.
// Unique IDs prevent worker threads and Bun test realms overwriting snapshots.
const collector = `
import { writeFileSync as __coverageWrite } from 'node:fs';
import { randomUUID as __coverageId } from 'node:crypto';
if (!globalThis[Symbol.for('castalia.coverage.collector')]) {
  globalThis[Symbol.for('castalia.coverage.collector')] = true;
  process.on('exit', () => __coverageWrite(
    ${JSON.stringify(raw)} + '/' + process.pid + '-' + __coverageId() + '.json',
    JSON.stringify(globalThis.__coverage__ || {})));
}
`;
for (const name of await readdir(join(root, 'src'))) {
  if (!name.endsWith('.js')) continue;
  const path = join(root, 'src', name);
  const source = await readFile(path, 'utf8');
  const instrumented = instrumenter.instrumentSync(source, path);
  map.addFileCoverage(instrumenter.lastFileCoverage());
  // Keep the CLI hashbang on the first line.
  const split = instrumented.startsWith('#!') ? instrumented.indexOf('\n') + 1 : 0;
  await writeFile(join(sandbox, 'src', name), instrumented.slice(0, split) + collector + instrumented.slice(split));
}
// Bun's test runner can finish without a normal process exit event.
for (const name of await readdir(join(sandbox, 'tests'))) {
  if (!name.endsWith('.test.js')) continue;
  const path = join(sandbox, 'tests', name);
  const source = await readFile(path, 'utf8');
  await writeFile(path, `import { afterAll as __coverageAfter } from 'bun:test';
import { writeFileSync as __coverageWrite } from 'node:fs';
import { randomUUID as __coverageId } from 'node:crypto';
__coverageAfter(() => __coverageWrite(${JSON.stringify(raw)} + '/' + __coverageId() + '.json',
  JSON.stringify(globalThis.__coverage__ || {})));
` + source);
}
const bun = process.env.BUN_EXECUTABLE || 'bun';
const runs = [
  [bun, ['test', './tests']],
  [process.execPath, ['--test', '--test-concurrency=1', ...
    (await readdir(join(sandbox, 'test'))).filter(n => n.endsWith('.test.js')).map(n => `test/${n}`)]],
];
let failed = false;
for (const [command, args] of runs) {
  const result = spawnSync(command, args, {cwd: sandbox, stdio: 'inherit', env: process.env});
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failed = true;
}
for (const name of await readdir(raw)) map.merge(JSON.parse(await readFile(join(raw, name), 'utf8')));
const context = createContext({dir: output, coverageMap: map});
for (const name of ['text', 'lcovonly', 'html', 'json-summary', 'json']) reports.create(name).execute(context);
const summary = map.getCoverageSummary().toJSON();
console.log('Coverage includes every src/*.js file; excludes dependencies, tests and scripts.');
if (summary.lines.pct < 85 || summary.branches.pct < 80) {
  console.error(`Coverage below target: lines ${summary.lines.pct}% (85%), branches ${summary.branches.pct}% (80%).`);
  failed = true;
}
process.exitCode = failed ? 1 : 0;
