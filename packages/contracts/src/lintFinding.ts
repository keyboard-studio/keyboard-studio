// see spec.md section 10 - validator and lint engine (Layer A/B/C)

export type LintSeverity = "info" | "hint" | "warn" | "error" | "fatal";

export type LintLayer = "A" | "B" | "C";

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface LintFinding {
  /** Stable code matching the kmn-compiler-messages.ts catalog key (e.g. "KM_ERROR_DUPLICATE_STORE"). */
  code: string;
  severity: LintSeverity;
  layer: LintLayer;
  message: string;
  location?: SourceLocation;
  /** Optional plain-language remediation surfaced as a lint chip. */
  hint?: string;
}
