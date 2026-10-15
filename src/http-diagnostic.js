// Verified against Mermaid 12.1.0: preprocessing removes comments/directives/
// frontmatter and trims leading whitespace; Diagram.fromText encodes entities
// and appends a newline. Jison loc describes the PREVIOUS token, not necessarily
// the error token. Never return loc.first_column or a pretty-printed caret.
function originalPosition(error, source) {
  // These Jison grammars emit the verified, 1-based diagnostic header below.
  // Other grammars (including Langium and YAML) use independent coordinates.
  if (!/^(?:flowchart|graph|sequenceDiagram)\b/.test(source) ||
      /%%|^---|[<#]/m.test(source)) return null;
  const match = /^(?:Parse error on line (\d+):|Lexical error on line (\d+)\.)/.exec(error.message);
  if (!match) return null;
  const line = Number(match[1] ?? match[2]);
  // Reject locations in Mermaid's synthetic appended newline, including EOF.
  const lines = source.split(/\r\n|\r|\n/);
  if (!Number.isSafeInteger(line) || line < 1 || line > lines.length) return null;
  return {line, column: null};
}
export function syntaxDiagnostic(error, source) {
  const hash = error?.hash;
  const syntax = error?.name === 'UnknownDiagramError' || error?.name === 'YAMLException' ||
    (hash && typeof hash === 'object' && ('token' in hash || 'expected' in hash || 'loc' in hash)) ||
    // Mermaid's Langium adapter exposes the actual parser result, not a hash.
    (error?.result && typeof error.result === 'object' &&
      (Array.isArray(error.result.lexerErrors) || Array.isArray(error.result.parserErrors)));
  if (!syntax) return null;
  const message = typeof error.message === 'string' && error.message.trim()
    ? error.message.split(/\n\s+at /)[0].slice(0, 2000) : 'Mermaid syntax error.';
  return {message, position: originalPosition(error, source)};
}
