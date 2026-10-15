// Deliberately conservative: unexpected engine/runtime exceptions are not syntax.
export function engineError(error) {
  const name = error?.name;
  const parserHash = error?.hash;
  const syntax = name === 'UnknownDiagramError' || name === 'YAMLException' ||
    (parserHash && typeof parserHash === 'object' &&
      ('token' in parserHash || 'expected' in parserHash || 'loc' in parserHash));
  const detail = { kind: syntax ? 'syntax' : 'internal',
    message: String(error?.message ?? error).slice(0, 2000) };
  const line = parserHash?.loc?.first_line;
  if (syntax && Number.isInteger(line) && line > 0) detail.line = line;
  return { valid: false, error: detail };
}
