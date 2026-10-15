import { expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { once } from 'node:events';

const overrides = {
  secure: [], securityLevel: 'loose', startOnLoad: true, maxTextSize: 1, maxEdges: 0,
  suppressErrorRendering: false, dompurifyConfig: {ADD_TAGS: ['script']},
  themeCSS: 'injected-css', htmlLabels: true, theme: 'dark', themeVariables: {primaryColor: '#ff0000'},
};
async function probe(source, resourceURL) {
  const child = Bun.spawn([process.execPath, new URL('./fixtures/config-probe.js', import.meta.url).pathname], {
    stdin: new Blob([JSON.stringify({source, resourceURL})]), stdout: 'pipe', stderr: 'pipe',
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const [output, error, status] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    expect(status, error).toBe(0);
    return JSON.parse(output);
  } finally {clearTimeout(timer); child.kill(); await child.exited;}
}
for (const mode of ['directive', 'frontmatter']) test(`locked config survives ${mode} overrides, no scripts/resources`, async () => {
  const header = mode === 'directive' ? `%%{init: ${JSON.stringify(overrides)}}%%` : `---\nconfig: ${JSON.stringify(overrides)}\n---`;
  const result = await probe(`${header}\nflowchart TD\nA["<b>Привет</b>"]-->B`);
  expect(result.error).toBeUndefined();
  expect(result.changed).toEqual([]);
  expect(result.securityLevel).toBe('strict');
  expect(result.htmlLabels).toBe(false);
  expect(result.startOnLoad).toBe(false);
  expect(result.suppressErrorRendering).toBe(true);
  expect([...result.secure].sort()).toEqual(Object.keys(overrides).sort());
  expect(result.scriptExecuted).toBe(false);
  expect(result.externalScriptLoaded).toBe(false);
  expect(result.diagramType).toBe('flowchart-v2');
});

test('jsdom does not fetch script/iframe/image/stylesheet subresources', async () => {
  let requests = 0;
  const server = createServer((_req, response) => {requests++; response.end('window.__loaded=true');});
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const result = await probe('flowchart TD\nA-->B', `http://127.0.0.1:${server.address().port}/probe`);
    expect(result.error).toBeUndefined();
    expect(result.externalScriptLoaded).toBe(false);
    expect(requests).toBe(0);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
