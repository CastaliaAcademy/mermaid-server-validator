// One fresh Bun process per source: globals, DOM and Mermaid config are never
// shared between requests. No external browser or renderer is involved.
import { syntaxDiagnostic } from './http-diagnostic.js';
// Keep stdout a private JSON protocol; never log diagram source/config.
for (const method of ['log', 'warn', 'error', 'info', 'debug', 'trace']) console[method] = () => {};
let dom;
let result = {kind: 'internal'};
try {
  const source = await Bun.stdin.text();
  const { initializeEngine } = await import('./engine.js');
  const engine = await initializeEngine();
  dom = engine.dom;
  const { mermaid } = engine;
  // Lock all known config keys, including secure and diagram-specific objects:
  // frontmatter/init directives cannot alter nested server policy either.
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
    htmlLabels: false, theme: 'base', maxTextSize: 50000,
    secure: [...new Set([...Object.keys(mermaid.mermaidAPI.defaultConfig),
      'secure', 'securityLevel', 'startOnLoad', 'suppressErrorRendering',
      'htmlLabels', 'dompurifyConfig', 'themeCSS'])],
  });
  try {
    await mermaid.parse(source);
    result = {kind: 'result', valid: true, error: null};
  } catch (error) {
    const diagnostic = syntaxDiagnostic(error, source);
    if (diagnostic) result = {kind: 'result', valid: false, error: diagnostic};
  }
} catch {
  // Import, DOM and runtime exceptions are not syntax diagnostics.
} finally {
  dom?.window.close();
}
process.stdout.write(JSON.stringify(result));
