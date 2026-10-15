import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createServer } from 'node:http';
import { once } from 'node:events';
const overrides = {
 secure: [], securityLevel: 'loose', startOnLoad: true, maxTextSize: 1, maxEdges: 0,
 suppressErrorRendering: false, dompurifyConfig: {ADD_TAGS: ['script']},
 themeCSS: 'injected-css', htmlLabels: true, theme: 'dark', themeVariables: {primaryColor: '#ff0000'},
};
function probe(source, resourceURL) {
 return new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./fixtures/config-probe.js', import.meta.url), {workerData: {source, resourceURL}});
  worker.on('error', reject);
  worker.on('message', async result => {await worker.terminate(); resolve(result);});
 });
}
for (const mode of ['directive', 'frontmatter']) test(`locked config survives ${mode} overrides, no scripts/resources`, async () => {
 const header = mode === 'directive' ? `%%{init: ${JSON.stringify(overrides)}}%%` : `---\nconfig: ${JSON.stringify(overrides)}\n---`;
 const result = await probe(`${header}\nflowchart TD\nA["<b>Привет</b>"]-->B`);
 assert.equal(result.error, undefined, JSON.stringify(result));
 assert.deepEqual(result.changed, []);
 assert.equal(result.securityLevel, 'strict');
 assert.equal(result.htmlLabels, false);
 assert.equal(result.startOnLoad, false);
 assert.equal(result.suppressErrorRendering, true);
 assert.deepEqual([...result.secure].sort(), Object.keys(overrides).sort());
 assert.equal(result.scriptExecuted, false);
 assert.equal(result.externalScriptLoaded, false);
 assert.equal(result.diagramType, 'flowchart-v2');
});

test('jsdom does not fetch script/iframe/image/stylesheet subresources', async () => {
 let requests = 0;
 const server = createServer((_req, response) => {requests++; response.end('window.__loaded=true');});
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 try {
   const {port} = server.address();
   const result = await probe('flowchart TD\nA-->B', `http://127.0.0.1:${port}/probe`);
   assert.equal(result.error, undefined, JSON.stringify(result));
   assert.equal(result.externalScriptLoaded, false);
   assert.equal(requests, 0);
 } finally {
   await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
 }
});
