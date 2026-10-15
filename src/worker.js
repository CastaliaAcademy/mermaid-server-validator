import { parentPort, workerData } from 'node:worker_threads';
import { initializeEngine } from './engine.js';
import { engineError } from './errors.js';

let dom;
try {
  const engine = await initializeEngine();
  dom = engine.dom;
  const result = await engine.mermaid.parse(workerData.source);
  parentPort.postMessage({valid: true, diagramType: result.diagramType});
} catch (error) {
  parentPort.postMessage(engineError(error));
} finally {
  dom?.window.close();
}
