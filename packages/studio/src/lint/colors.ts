// Shared severity color map and display order for the lint chip UI.
// Internal to the lint module — do not re-export from index.ts.

import type { LintSeverity } from "@keyboard-studio/contracts";

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
