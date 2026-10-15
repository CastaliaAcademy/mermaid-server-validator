import { Worker } from 'node:worker_threads';
import {
  MAX_SOURCE_LENGTH, MAX_SOURCE_BYTES, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS,
  MAX_CONCURRENCY, RESOURCE_LIMITS, failure,
} from './limits.js';

let active = 0;

export async function validateMermaid(source, options) {
  if (typeof source !== 'string' || source.length > MAX_SOURCE_LENGTH ||
      Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES || source.trim().length === 0) {
    return failure('input', 'Source must be nonempty, at most 50000 UTF-16 units and 100000 UTF-8 bytes.');
  }
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (options !== undefined) {
    if (options === null || typeof options !== 'object' || Array.isArray(options) ||
        Reflect.ownKeys(options).some(key => key !== 'timeoutMs')) {
      return failure('input', 'Only the timeoutMs option is supported.');
    }
    timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : options.timeoutMs;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      return failure('input', 'timeoutMs must be an integer between 1 and 30000.');
    }
  }
  if (active >= MAX_CONCURRENCY) return failure('busy', 'Two validations are already running. Retry later.');
  active++;
  const started = performance.now();
  return new Promise((resolve) => {
    let worker;
    let timer;
    let settled = false;
    const finish = async (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        // Resolve/release capacity only AFTER the worker has actually stopped.
        if (worker) await worker.terminate();
      } catch {
        result = failure('internal', 'Worker cleanup failed.');
      } finally {
        active--;
        resolve(result);
      }
    };
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), {
        workerData: { source }, resourceLimits: RESOURCE_LIMITS,
        // A file worker must not inherit --input-type, eval/debug/preload flags.
        execArgv: [],
        // Never leak Mermaid logging into the host/CLI JSON channel.
        stdout: true, stderr: true,
      });
      worker.stdout.resume();
      worker.stderr.resume();
      worker.once('message', (result) => {
        if (performance.now() - started >= timeoutMs) {
          void finish(failure('timeout', 'Validation deadline exceeded.'));
        } else {
          void finish(result);
        }
      });
      worker.once('error', () => void finish(failure('internal', 'Mermaid worker failed to start or execute.')));
      worker.once('exit', (code) => void finish(failure('internal', `Worker exited without a result (code ${code}).`)));
      timer = setTimeout(() => void finish(failure('timeout', 'Validation deadline exceeded.')),
        Math.max(0, timeoutMs - (performance.now() - started)));
    } catch {
      void finish(failure('internal', 'Unable to start Mermaid worker.'));
    }
  });
}
