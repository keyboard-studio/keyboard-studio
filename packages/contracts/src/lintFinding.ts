// see spec.md section 10 - validator and lint engine (Layer A/B/C)

/**
 * Diagnostic severity levels.
 *
 * Names align with the upstream `keymanapp/keyman` `IKeymanError::Severity`
 * enum (`kesFatal`, `kesError`, `kesWarning`, `kesHint`) — see {@link LintSeverityNumeric}
 * for the upstream numeric mapping. `"info"` is studio-only: it does NOT
 * exist upstream and is intended for Layer C hygiene messages that are
 * notable but never blocking. Layer A and Layer B validators MUST NOT emit
 * `"info"` — downgrade to `"hint"` if the finding has no compiler-level
 * severity.
 */
export type LintSeverity = "info" | "hint" | "warning" | "error" | "fatal";

/**
 * Numeric severity codes matching upstream `IKeymanError::Severity` for
 * interop. `info` is studio-specific (no upstream value) and uses `-1`.
 *
 * @see https://github.com/keymanapp/keyman/blob/master/windows/docs/engine/api/IKeymanError/Severity.md
 */
export const LintSeverityNumeric: Record<LintSeverity, number> = {
  fatal: 0,
  error: 1,
  warning: 2,
  hint: 3,
  info: -1, // Layer C only; no upstream equivalent.
};

export type LintLayer = "A" | "B" | "C";

export interface SourceLocation {
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Studio-namespaced lint-code template literal type.
 *
 * The studio uses its own `KM_*` namespace (`KM_ERROR_*`, `KM_WARN_*`,
 * `KM_HINT_*`, `KM_FATAL_*`, `KM_INFO_*`, `KM_LINT_*`) rather than the
 * upstream `keymanapp/keyman` codes (`ERROR_*`, `WARN_*`, `HINT_*`,
 * `FATAL_*`). The wrapper exists because the upstream `KmnCompilerMessages`
 * class is marked `@internal` — depending on its exact identifiers
 * would couple us to a private upstream surface.
 *
 * ValidatorService implementations are responsible for translating
 * upstream codes to this namespace at the boundary (e.g.
 * `ERROR_DuplicateGroup` → `KM_ERROR_DUPLICATE_GROUP`). Layer C codes
 * use the `KM_LINT_*` prefix and have no upstream equivalent.
 *
 * Codes are SCREAMING_SNAKE under the prefix; the suffix should be a
 * stable English identifier of the failure mode.
 *
 * @see spec.md §10 — validator and lint engine
 * @see #87 — wrapper-namespace decision
 */
export type LintCode =
  | `KM_ERROR_${string}`
  | `KM_WARN_${string}`
  | `KM_HINT_${string}`
  | `KM_FATAL_${string}`
  | `KM_INFO_${string}`
  | `KM_LINT_${string}`;

/**
 * Provenance of a {@link LintFinding}. `"upstream"` means the finding was
 * present in a fetched release-tree source file before the user made any
 * edit; the chip rail renders these muted and excludes them from the
 * submit-block threshold until the file is touched. Omit (or set
 * `"authored"`) for findings the user caused.
 *
 * @see CLAUDE.md "Issue closure policy" / #39 cycle-3 km-validator review
 */
export type LintFindingOrigin = "authored" | "upstream";

export interface LintFinding {
  /**
   * Studio-namespaced lint code (e.g. `"KM_ERROR_DUPLICATE_STORE"`).
   * See {@link LintCode} for the namespace and translation policy.
   */
  code: LintCode;
  severity: LintSeverity;
  layer: LintLayer;
  message: string;
  location?: SourceLocation;
  /** Optional plain-language remediation surfaced as a lint chip. */
  hint?: string;
  /**
   * Provenance of this finding. When `"upstream"`, the chip rail mutes
   * the finding and does not count it toward the Submit-blocked threshold.
   * Default (absent) is `"authored"`.
   */
  origin?: LintFindingOrigin;
}
