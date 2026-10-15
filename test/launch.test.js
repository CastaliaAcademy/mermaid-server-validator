import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('API also works when host starts with --input-type=module', () => {
  const moduleUrl = new URL('../src/index.js', import.meta.url).href;
  const code = `import {validateMermaid} from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(await validateMermaid('flowchart TD\\nA-->B')));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], {encoding:'utf8', timeout:10000});
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).valid, true, child.stdout);
});
