import { createValidator } from './http-validator.js';
import { ServiceError, jsonResponse, errorResponse } from './http-errors.js';

export const BODY_MAX_BYTES = 131072;
export const SOURCE_MAX_UTF16 = 50000;
export const SOURCE_MAX_UTF8_BYTES = 100000;
const paths = new Set(['/validate', '/validate/detailed']);

async function readSource(request) {
  const media = request.headers.get('content-type') ?? '';
  const encoding = request.headers.get('content-encoding');
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(media) ||
      (encoding !== null && encoding.trim().toLowerCase() !== 'identity')) {
    throw new ServiceError('UNSUPPORTED_MEDIA_TYPE');
  }
  const reader = request.body?.getReader();
  const chunks = [];
  let length = 0;
  if (reader) {
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > BODY_MAX_BYTES) {
          // Do not await cancellation of an untrusted streaming sender.
          reader.cancel().catch(() => {});
          throw new ServiceError('PAYLOAD_TOO_LARGE');
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  let body;
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  } catch {
    throw new ServiceError('INVALID_JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || !Object.hasOwn(body, 'source') ||
      typeof body.source !== 'string') throw new ServiceError('INVALID_INPUT');
  const {source} = body;
  if (!source.trim()) throw new ServiceError('INVALID_INPUT');
  if (source.length > SOURCE_MAX_UTF16 ||
      new TextEncoder().encode(source).byteLength > SOURCE_MAX_UTF8_BYTES) {
    throw new ServiceError('PAYLOAD_TOO_LARGE');
  }
  return source;
}

export function createHandler(validator = createValidator()) {
  return async function handle(request) {
    try {
      const path = new URL(request.url).pathname;
      if (!paths.has(path)) throw new ServiceError('NOT_FOUND');
      if (request.method !== 'POST') throw new ServiceError('METHOD_NOT_ALLOWED');
      const source = await readSource(request);
      const result = await validator.validate(source);
      return jsonResponse(path === '/validate' ? {valid: result.valid} : result);
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export function serverConfig(env = process.env) {
  const port = env.PORT ?? '3000';
  const hostname = env.HOST ?? '0.0.0.0';
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535.');
  }
  if (!hostname.trim()) throw new Error('HOST must not be empty.');
  return {hostname, port: Number(port)};
}

export function startServer(config = serverConfig()) {
  const validator = createValidator();
  const server = Bun.serve({
    ...config,
    // Read-time application limit preserves JSON 413 and routing precedence,
    // rather than Bun's native non-JSON body-limit response.
    maxRequestBodySize: Number.MAX_SAFE_INTEGER,
    idleTimeout: 10,
    fetch: createHandler(validator),
    error: () => errorResponse(new ServiceError('INTERNAL_ERROR')),
  });
  return {server, validator, async close() {
    server.stop(true);
    await validator.close();
  }};
}

if (import.meta.main) {
  try {
    const service = startServer();
    console.log(`Mermaid validator listening on ${service.server.url}`);
    let stopping = false;
    const stop = async () => {
      if (stopping) return;
      stopping = true;
      await service.close();
      process.exit(0);
    };
    process.on('SIGTERM', stop);
    process.on('SIGINT', stop);
  } catch {
    console.error('Unable to start Mermaid validator; check HOST, PORT and bind availability.');
    process.exitCode = 1;
  }
}
