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
  fatal: "#c0392b",
  error: "#e74c3c",
  warning: "#f39c12",
  hint: "#7f8c8d",
  info: "#2980b9",
};

export const SEVERITY_ORDER: LintSeverity[] = [
  "fatal",
  "error",
  "warning",
  "hint",
  "info",
];
