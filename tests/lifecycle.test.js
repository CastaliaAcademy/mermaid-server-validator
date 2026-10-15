import { expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { startServer } from '../src/server.js';

const entrypoint = fileURLToPath(new URL('../src/server.js', import.meta.url));
function spawn(env) {
  return Bun.spawn([process.execPath, entrypoint], {
    env: {...process.env, ...env}, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
  });
}

test('entrypoint refuses invalid env and occupied port without a stack', async () => {
  const bound = startServer({hostname: '127.0.0.1', port: 0});
  try {
    for (const env of [{PORT: '0'}, {PORT: '3000', HOST: ''},
      {PORT: String(bound.server.port), HOST: '127.0.0.1'}]) {
      const child = spawn(env);
      expect(await child.exited).toBe(1);
      const stderr = await new Response(child.stderr).text();
      expect(stderr).toContain('Unable to start Mermaid validator;');
      expect(stderr).not.toContain(' at ');
      expect(stderr).not.toContain(entrypoint);
    }
  } finally { await bound.close(); }
});

test('real entrypoint handles HTTP then exits on SIGTERM', async () => {
  // Reserve an ephemeral port, release it, then exercise the actual entrypoint.
  const reservation = Bun.serve({hostname: '127.0.0.1', port: 0, fetch: () => new Response()});
  const port = reservation.port;
  reservation.stop(true);
  const child = spawn({HOST: '127.0.0.1', PORT: String(port)});
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 10000);
  try {
    const reader = child.stdout.getReader();
    const {value, done} = await reader.read();
    reader.releaseLock();
    expect(done).toBe(false);
    expect(new TextDecoder().decode(value)).toContain('Mermaid validator listening on');
    const response = await fetch(`http://127.0.0.1:${port}/validate`, {method: 'POST',
      headers: {'Content-Type': 'application/json'}, body: '{"source":"flowchart TD\\n A --> B"}'});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({valid: true});
    child.kill('SIGTERM');
    expect(await child.exited).toBe(0);
    expect(await new Response(child.stderr).text()).toBe('');
  } finally {
    clearTimeout(watchdog);
    child.kill('SIGKILL');
    await child.exited;
  }
}, 12000);
