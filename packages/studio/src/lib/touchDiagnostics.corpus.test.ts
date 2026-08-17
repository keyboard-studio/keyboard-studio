/**
 * SC-002 corpus canaries for the joined touch-layout diagnostics (spec 063 T042).
 *
 * ## Why this test lives in `packages/studio` and not in `packages/keyboard-lint`
 *
 * `@keymanapp/keyboard-lint` has ZERO `node:fs` usage anywhere in `src` — every
 * one of its tests uses inline fixtures, deliberately, so the lint engine stays a
 * pure function of its inputs and runs in a browser. A disk-reading canary there
 * would be the first `fs`-touching test in the package and would quietly make that
 * property untrue. Studio is the only package that depends on keyboard-lint, and
 * it already reads the corpus with the established `KEYBOARDS_ROOT` +
 * `fs.existsSync` skip-if-absent pattern, so the canary has a home here.
 *
 * (Its sibling, the SC-001 coverage canary, stays in engine — which also already
 * reads the corpus. The split follows "whichever package already reads disk",
 * not the package that owns the code under test.)
 *
 * ## What is pinned, and what deliberately is not
 *
 * Pinned: two exact per-keyboard numbers, plus a count that catches corpus drift.
 * NOT pinned, ever: any corpus-wide aggregate. The narrative calibration figures
 * in the spec (~1,170 duplicate-id findings, ~205 bases with orphan rules) are
 * scale estimates for a design decision, not test targets — asserting them would
 * make an unrelated corpus bump fail this suite for no signal.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { buildTouchKeyRuleIndex } from "@keyboard-studio/contracts";
import { checkTouchKeyNoRule, checkTouchRuleOrphan } from "@keymanapp/keyboard-lint";
import { parseKmn, parseTouchLayout } from "@keyboard-studio/engine";

/**
 * Resolved from `process.cwd()` (which vitest sets to `packages/studio`), NOT from
 * `import.meta.url` as the engine's corpus tests do.
 *
 * That difference is forced, not stylistic: studio runs under Vite, which serves
 * modules root-relative, so `new URL(".", import.meta.url).pathname` here is
 * `/src/lib` — no drive letter, no repo path — and the engine's five-dots-up
 * pattern silently resolves to `D:\keyboards`, a directory that does not exist.
 * The test would then skip forever while looking like it passed.
 */
const KEYBOARDS_ROOT = path.resolve(process.cwd(), "../../../keyboards");

function sourceDir(id: string): string {
  return path.join(KEYBOARDS_ROOT, "release/sil", id, "source");
}

function filesFor(id: string): { kmn: string; touch: string } {
  const dir = sourceDir(id);
  return {
    kmn: path.join(dir, `${id}.kmn`),
    touch: path.join(dir, `${id}.keyman-touch-layout`),
  };
}

function present(id: string): boolean {
  const { kmn, touch } = filesFor(id);
  return fs.existsSync(kmn) && fs.existsSync(touch);
}

function load(id: string) {
  const { kmn, touch } = filesFor(id);
  const { ir } = parseKmn(fs.readFileSync(kmn, "utf8"), id);
  const layout = parseTouchLayout(fs.readFileSync(touch, "utf8"));
  // The resolver's real precedence puts `ir.touchLayout` first; mirror that here
  // rather than passing the layout separately, so the canary exercises the same
  // shape the lint context builds.
  ir.touchLayout = layout;
  return { ir, layout, ruleIndex: buildTouchKeyRuleIndex(ir) };
}

const QWERTY = "sil_cameroon_qwerty";
const AZERTY = "sil_cameroon_azerty";
const PATH = "source/kbd.keyman-touch-layout";

describe.skipIf(!present(AZERTY))("SC-002 — sil_cameroon_azerty orphan rule", () => {
  it("reports the orphan rule EXACTLY ONCE", () => {
    // The defect: the `.kmn` carries a rule pair keyed on a `T_` id that the touch
    // layout provides only in its `U_` form. Exactly once, not twice — the guard
    // and the producing rule are one defect with one fix.
    const findings = checkTouchRuleOrphan(load(AZERTY), PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_TOUCH_RULE_ORPHAN");
  });

  it("names the near-miss `U_` id and explains the guard bypass", () => {
    // This is the finding's payoff, on the real file: the self-outputting `U_` id
    // fires before any rule can run, so the author's `any(diablock)` guard is
    // silently skipped.
    const findings = checkTouchRuleOrphan(load(AZERTY), PATH);
    expect(findings[0]?.message).toContain("bypasses");
    expect(findings[0]?.hint).toContain("self-outputs");
  });

  it("stays a warning — Layer C ships no error-severity codes", () => {
    expect(checkTouchRuleOrphan(load(AZERTY), PATH)[0]?.severity).toBe("warning");
  });
});

describe.skipIf(!present(QWERTY))("SC-002 — sil_cameroon_qwerty is clean", () => {
  it("produces ZERO dead-T_-key findings", () => {
    // The exemptions earn their keep here. This keyboard is full of ruleless
    // sentinel keys, `*`-prefixed frame labels, `U_` longpresses, and a `> nul`
    // key with a nextlayer — every one of which a naive check would report.
    const findings = checkTouchKeyNoRule(load(QWERTY), PATH);
    expect(findings).toEqual([]);
  });

  it("produces ZERO orphan-rule findings", () => {
    // The QWERTY/AZERTY pair is the whole point of using both: same author, same
    // idioms, and the defect is present in exactly one of them. A check that fired
    // on both would be measuring the idiom, not the defect.
    expect(checkTouchRuleOrphan(load(QWERTY), PATH)).toEqual([]);
  });

  it("pins the distinct T_ id count so corpus drift is caught", () => {
    // If this number moves, the two assertions above are measuring a different
    // file than the one they were calibrated against, and their passing means less.
    const { ruleIndex } = load(QWERTY);
    const distinctTIds = [...ruleIndex.byId.keys()].filter((id) => id.startsWith("T_"));
    expect(distinctTIds).toHaveLength(22);
  });
});
