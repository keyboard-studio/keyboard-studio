// Axe accessibility scan helper for the walk specs (spec 056 FR-003).
//
// Every live walk spec asserts zero serious/critical axe violations on the
// key screens it visits. `minor`/`moderate` findings are intentionally NOT
// gated here — they surface in the scan output for the Cycle 1 baseline
// audit but do not fail the walk; the gate tightens only by a deliberate
// tracker-backed decision, never silently.
//
// Per-rule/per-node exclusions (spec 056 FR-003): pass `exclude` selectors
// with an inline comment at the call site naming the WCAG criterion and the
// reason. No blanket disables.

import { AxeBuilder } from "@axe-core/playwright";
import { expect } from "playwright/test";
import type { Page } from "playwright/test";

export interface AxeScanOptions {
  /** CSS selectors to exclude from the scan. Each call-site exclusion needs
   * an inline comment naming the criterion and reason (FR-003). */
  exclude?: readonly string[];
}

/** Runs an axe scan of the current page state and fails the test on any
 * violation axe rates `serious` or `critical`. The failure message carries
 * the rule id, impact, help text, and the first few offending nodes so the
 * defect is locatable without re-running locally. */
export async function expectNoSeriousAxeViolations(
  page: Page,
  screenLabel: string,
  options: AxeScanOptions = {},
): Promise<void> {
  let builder = new AxeBuilder({ page });
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  const results = await builder.analyze();
  const gated = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({
      screen: screenLabel,
      rule: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    }));
  expect(gated, `serious/critical axe violations on: ${screenLabel}`).toEqual([]);
}
