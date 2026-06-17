// Shared utilities for flow-map helpers.

/**
 * Resolve a rule's target id, or null for a terminal branch. Prefers an
 * explicit `goto`, then the `default: <id>` shorthand; anything non-string
 * (null, true, undefined) terminates.
 */
export function ruleTarget(rule: { goto?: string | null; default?: unknown }): string | null {
  if (typeof rule.goto === "string") return rule.goto;
  if (typeof rule.default === "string") return rule.default;
  return null;
}
