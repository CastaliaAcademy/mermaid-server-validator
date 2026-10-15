#!/usr/bin/env node
import { createReadStream } from 'node:fs';
import { validateMermaid } from './index.js';
import { MAX_SOURCE_BYTES, failure } from './limits.js';

const exitCodes = { syntax: 1, input: 2, timeout: 3, internal: 4, busy: 5 };
async function readBounded(stream) {
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of stream) {
      bytes += chunk.length;
      if (bytes > MAX_SOURCE_BYTES) throw Error('Input exceeds 100000 UTF-8 bytes.');
      chunks.push(chunk);
    }
    // Reject malformed UTF-8 rather than silently replacing it with U+FFFD.
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes));
  } finally {
    stream.destroy();
  }
}
async function main(args) {
  let path;
  let timeoutMs;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--timeout-ms' && timeoutMs === undefined) {
      const value = args[++i];
      if (!value || !/^[0-9]+$/.test(value)) return failure('input', 'Expected an integer after --timeout-ms.');
      timeoutMs = Number(value);
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) {
        return failure('input', 'timeoutMs must be an integer between 1 and 30000.');
      }
    } else if (arg === '--help' && args.length === 1) {
      return { usage: 'castalia-mermaid-validate [--timeout-ms 1..30000] [file.mmd|-]' };
    } else if ((arg.startsWith('-') && arg !== '-') || path !== undefined) {
      return failure('input', 'Usage: castalia-mermaid-validate [--timeout-ms 1..30000] [file.mmd|-]');
    } else {
      path = arg;
    }
  }
  let source;
  try {
    source = await readBounded(!path || path === '-' ? process.stdin : createReadStream(path, { highWaterMark: 16_384 }));
  } catch (error) {
    return failure('input', `Unable to read UTF-8 input: ${String(error.message).slice(0, 300)}`);
  }
  return validateMermaid(source, timeoutMs === undefined ? undefined : { timeoutMs });
}
try {
  const result = await main(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.valid === false ? exitCodes[result.error.kind] : 0;
} catch {
  process.stdout.write(JSON.stringify(failure('internal', 'Unexpected CLI failure.')) + '\n');
  process.exitCode = 4;
}
