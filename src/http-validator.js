import { fileURLToPath } from 'node:url';
import { ServiceError } from './http-errors.js';

export const VALIDATION_TIMEOUT_MS = 5000;
export const MAX_ACTIVE_VALIDATIONS = 2;
const workerPath = fileURLToPath(new URL('./http-worker.js', import.meta.url));

// Internal options support deterministic isolation/deadline tests; none come
// from HTTP input or environment. Production uses the fixed v1 constants.
export function createValidator({timeoutMs = VALIDATION_TIMEOUT_MS,
  executable = process.execPath, worker = workerPath} = {}) {
  const children = new Set();
  let closed = false;
  return {
    get active() { return children.size; },
    async validate(source) {
      if (closed) throw new ServiceError('INTERNAL_ERROR');
      if (children.size >= MAX_ACTIVE_VALIDATIONS) throw new ServiceError('BUSY');
      let child;
      let timer;
      let timedOut = false;
      const started = performance.now();
      try {
        child = Bun.spawn([executable, worker], {
          stdin: new TextEncoder().encode(source), stdout: 'pipe', stderr: 'ignore',
        });
        children.add(child);
        timer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, Math.max(0, timeoutMs - (performance.now() - started)));
        const [exitCode, output] = await Promise.all([
          child.exited, new Response(child.stdout).text(),
        ]);
        if (timedOut || performance.now() - started >= timeoutMs) {
          throw new ServiceError('VALIDATION_TIMEOUT');
        }
        if (exitCode !== 0 || closed) throw new ServiceError('INTERNAL_ERROR');
        const result = JSON.parse(output);
        if (result.kind !== 'result' || typeof result.valid !== 'boolean' ||
            (result.valid ? result.error !== null :
              !result.error || typeof result.error.message !== 'string')) {
          throw new ServiceError('INTERNAL_ERROR');
        }
        return {valid: result.valid, error: result.error};
      } catch (error) {
        throw error instanceof ServiceError ? error : new ServiceError('INTERNAL_ERROR');
      } finally {
        clearTimeout(timer);
        if (child) {
          // Release admission only after actual exit; do not orphan timed-out work.
          child.kill('SIGKILL');
          await child.exited;
          children.delete(child);
        }
      }
    },
    async close() {
      closed = true;
      const pending = [...children];
      for (const child of pending) child.kill('SIGKILL');
      await Promise.all(pending.map(child => child.exited));
    },
  };
}
