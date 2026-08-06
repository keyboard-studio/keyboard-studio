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
  /**
   * Restrict the scan to these selectors instead of the whole page.
   *
   * For surfaces that render as an OVERLAY over an arbitrary screen. A whole-page
   * scan of one of those also scans whatever happened to be underneath, so a
   * pre-existing violation on an unrelated screen fails a spec that does not own
   * it — and the usual fix, an `exclude` per offending node, has to be rewritten
   * every time that other screen changes.
   *
   * `include` is the stronger form where it applies: the scan still runs against
   * the real document with the real page CSS, real fonts, and real cascade — it
   * only narrows which nodes are EVALUATED. Prefer it to a list of exclusions
   * when the spec's subject is a specific surface; prefer `exclude` when the
   * subject is the whole screen and one node is a named, tracked carve-out.
   */
  include?: readonly (string | readonly string[])[];
  /**
   * Selectors to exclude from the scan. Each call-site exclusion needs an
   * inline comment naming the criterion and reason (FR-003).
   *
   * An entry may be a plain selector (same-document) or a FRAME CHAIN — an
   * array like `["iframe", ".vendor-class"]`, which is how axe addresses a node
   * inside an iframe and the form axe's own violation targets come back in. The
   * chain form exists so a finding in third-party framed content can be
   * excluded precisely, instead of excluding the whole frame and losing
   * coverage of the content the studio itself puts there.
   */
  exclude?: readonly (string | readonly string[])[];
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
  for (const selector of options.include ?? []) {
    builder = builder.include(typeof selector === "string" ? selector : [...selector]);
  }
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(typeof selector === "string" ? selector : [...selector]);
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
