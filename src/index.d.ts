export interface ValidateMermaidOptions {
  /** Wall-clock deadline including worker/engine startup; integer 1..30000, default 5000. */
  timeoutMs?: number;
}
export type MermaidErrorKind = 'input' | 'syntax' | 'timeout' | 'internal' | 'busy';
export interface MermaidValidationError {
  kind: MermaidErrorKind;
  /** At most 2000 UTF-16 units for engine messages; may contain untrusted source fragments. */
  message: string;
  /** Optional parser-reported 1-based line; may refer to preprocessed source. */
  line?: number;
}
export type MermaidValidationResult =
  | { valid: true; diagramType: string }
  | { valid: false; error: MermaidValidationError };
/** Validate raw Mermaid (not Markdown). Never renders SVG or alters host DOM globals. */
export function validateMermaid(source: unknown, options?: ValidateMermaidOptions): Promise<MermaidValidationResult>;
