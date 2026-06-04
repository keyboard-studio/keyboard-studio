// CJK + Ethiopic — out of scope for v1.0 per spec §16.
// Three-group routing (spec §9) renders "not yet supported" stubs for these;
// the preview pane MUST NOT silently empty for them.

export const EXCLUDED_SCRIPT_FAMILIES: ReadonlySet<string> = new Set([
  "Hans", "Hant", "Hani", "Bopo", "Hang", // CJK / Hangul
  "Ethi",                                  // Ethiopic
]);

export function isExcludedScript(script: string): boolean {
  return EXCLUDED_SCRIPT_FAMILIES.has(script);
}
