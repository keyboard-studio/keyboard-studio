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

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { AxeBuilder } from "@axe-core/playwright";
import { expect } from "playwright/test";
import type { Page } from "playwright/test";

export interface AxeScanOptions {
  /** CSS selectors to exclude from the scan. Each call-site exclusion needs
   * an inline comment naming the criterion and reason (FR-003). */
  exclude?: readonly string[];
}

// --- Baseline recorder (spec 056 T001) -------------------------------------
//
// The gate below fails only on `serious`/`critical`. That is deliberate, but it
// means `minor`/`moderate` findings — and the rule PASSES that are the actual
// evidence for a tracker row flipping to `pass` — never reach any output. Set
// A11Y_BASELINE=1 to append the *whole* result of every scan (one JSON line per
// scan) to A11Y_BASELINE_FILE for the Cycle 1 baseline audit. Recording only;
// it changes no assertion, and with the env var unset this is inert.

const BASELINE_ENABLED = process.env.A11Y_BASELINE === "1";
const BASELINE_FILE = resolve(
  process.env.A11Y_BASELINE_FILE ??
    "../../specs/056-ada-accessibility/evidence/axe-baseline.jsonl",
);

let baselineDirReady = false;

function recordBaseline(entry: unknown): void {
  if (!baselineDirReady) {
    mkdirSync(dirname(BASELINE_FILE), { recursive: true });
    baselineDirReady = true;
  }
  appendFileSync(BASELINE_FILE, `${JSON.stringify(entry)}\n`, "utf8");
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
  if (BASELINE_ENABLED) {
    recordBaseline({
      screen: screenLabel,
      url: results.url,
      excluded: options.exclude ?? [],
      violations: results.violations.map((v) => ({
        rule: v.id,
        impact: v.impact,
        help: v.help,
        tags: v.tags,
        nodeCount: v.nodes.length,
        nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
      })),
      // Rules that ran clean here — the per-screen evidence a tracker row
      // needs before it may be called `pass`.
      passes: results.passes.map((p) => p.id),
      // axe could not decide these; they are manual-review candidates, not passes.
      incomplete: results.incomplete.map((i) => ({
        rule: i.id,
        impact: i.impact,
        nodeCount: i.nodes.length,
      })),
    });
  }
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
