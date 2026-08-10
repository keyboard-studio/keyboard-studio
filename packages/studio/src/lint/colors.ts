// Shared severity color map and display order for the lint chip UI.
// Internal to the lint module — do not re-export from index.ts.

import type { LintSeverity } from "@keyboard-studio/contracts";

// NOTE: "warning" is retained here only so this Record stays total over
// LintSeverity. Both consumers (LintChip, LintSummary) deliberately
// override it to the panel's neutral default-text colour rather than
// reading this entry — warnings get no colour treatment (calm advisory,
// not an alarm). Do not wire this "warning" value back in without
// revisiting that decision.
export const SEVERITY_COLORS: Record<LintSeverity, string> = {
  fatal: "var(--app-danger-text)",
  error: "var(--app-danger-text)",
  warning: "var(--app-warning-text)",
  hint: "var(--app-text-muted)",
  info: "var(--app-accent-text)",
};

export const SEVERITY_ORDER: LintSeverity[] = [
  "fatal",
  "error",
  "warning",
  "hint",
  "info",
];
