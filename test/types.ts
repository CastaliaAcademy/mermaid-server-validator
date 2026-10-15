import { validateMermaid, type MermaidValidationResult, type ValidateMermaidOptions } from '@castalia/mermaid-validator';
const options: ValidateMermaidOptions = {timeoutMs: 1000};
const result: MermaidValidationResult = await validateMermaid('flowchart TD\nA-->B', options);
if (result.valid) {
  result.diagramType.toUpperCase();
  // @ts-expect-error discriminated success has no error
  result.error;
} else {
  const kind: 'input' | 'syntax' | 'timeout' | 'internal' | 'busy' = result.error.kind;
  void kind;
  result.error.message.toUpperCase();
  // @ts-expect-error discriminated failure has no diagramType
  result.diagramType;
}
// @ts-expect-error callers cannot pass arbitrary Mermaid config
await validateMermaid('flowchart TD\nA-->B', {config: {securityLevel: 'loose'}});
// @ts-expect-error timeout must be numeric
await validateMermaid('flowchart TD\nA-->B', {timeoutMs: '10'});
await validateMermaid(null);
