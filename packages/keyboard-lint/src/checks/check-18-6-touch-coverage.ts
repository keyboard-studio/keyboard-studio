// Check 18.6 (touch surface) — KM_LINT_TOUCH_UNCOVERED
// Criteria: same row as the desktop check — 18.6-inventory-fully-covered. This is a
// SIBLING check code, not a second criterion: the criteria.json count (148) is
// test-enforced, and the 18.13 addition was reverted for exactly this reason
// (see specs/035-mobile-touch-derivation/contracts/simplification.md, "Extended:
// criterion 18.6 gains a touch-side check").
//
// SCOPE GUARD differs deliberately from the desktop sibling
// (check-18-6-inventory-coverage.ts):
//   - No `origin === "scaffolded"` guard — imported bases (Case B, spec 035) are
//     this check's primary audience.
//   - No raw-fragment skip — this check walks a TouchLayoutIR, not IR rules, so
//     opaque `.kmn` fragments are not relevant to it.
//
// TRAVERSAL: the reachable-layer + char-collection walk is the canonical
// `computeTouchCoverage` in @keyboard-studio/contracts — shared with the
// engine's `touchCoverage` (packages/engine/src/pattern-apply/touchCoverage.ts).
// Both packages depend on @keyboard-studio/contracts; this check cannot import
// @keyboard-studio/engine directly (dependency-cruiser's `lint-not-to-engine`
// rule, .dependency-cruiser.cjs, forbids it — Layer C must stay a standalone
// hygiene layer, spec §10).

// ---------------------------------------------------------------------------
// SPEC 058: this module additionally hosts the THREE JOINED 18.6 codes —
// KM_LINT_TOUCH_KEY_NO_RULE, KM_LINT_TOUCH_RULE_ORPHAN, and
// KM_HINT_TOUCH_KEY_ID_CASE.
//
// WHY HERE AND NOT IN check-18-6-inventory-coverage.ts. The two 18.6 modules are
// not interchangeable. That one opens with `if (ir.origin !== "scaffolded")
// return []`, and the reachability-view adoption there depends on exactly that
// guard for its safety. All three codes below must fire on IMPORTED keyboards —
// both Cameroon canaries are imported — so behind that guard they would never
// run, and SC-002 would be unsatisfiable while the code looked correct. This
// module has no origin guard (see the SCOPE GUARD note below), which is why the
// join contract's own §5.1 cites it as the precedent.
//
// NO ROWS ARE ADDED TO criteria.json. `CriteriaBands.lintRuleId` is singular and
// 1:1 with a criterion row; hanging several sibling codes off one row's
// `lintRuleId` was tried before and reverted, because nothing enforces a
// code↔criterion bijection and the row's own prose stops describing what its
// codes report. Every code here is documented at check-module level instead —
// this header is that documentation.
//
// EVERY CODE STAYS WARNING-OR-HINT. Keyman Developer's touch-layout validator has
// exactly one error (0x05A, routed away to Layer A′ / edit-time rejection), and
// `@keymanapp/keyboard-lint` ships zero error-severity checks. A first
// error-severity Layer C row would be a layer-boundary change nobody signed off.
// ---------------------------------------------------------------------------

import type {
  KeyboardIR,
  LintFinding,
  TouchKeyRuleIndex,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  computeTouchCoverage,
  findDeadTouchKeys,
  findTouchKeyIdCaseMismatches,
  findTouchRuleOrphans,
  formatUncoveredTouchMessage,
  toUPlusNotation,
} from "@keyboard-studio/contracts";
import { makeLocation } from "./_shared.js";

/**
 * Check that every character in the confirmed inventory has a reachable touch
 * mechanism (text/output/U_ id, or an sk/flick/multitap entry) on some
 * navigable layer of the touch layout. One finding per uncovered char.
 *
 * @param layout - Parsed/derived touch layout (the same TouchLayoutIR shape
 *   `touchCoverage` in the engine consumes).
 * @param inventory - Confirmed inventory characters (already flattened —
 *   matches `computeTouchCoverage`'s `inventory: readonly string[]` signature).
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchCoverage(
  layout: TouchLayoutIR,
  inventory: readonly string[],
  touchLayoutPath: string,
  ruleIndex?: TouchKeyRuleIndex
): LintFinding[] {
  // Spec 058 FR-007: the Layer C leg of the four-caller migration. With the
  // index, a `T_*` key whose output lives in a `.kmn` rule is credited, so this
  // check stops reporting characters the keyboard genuinely types. Absent it,
  // behaviour is unchanged.
  const { uncovered } = computeTouchCoverage(
    layout,
    inventory,
    ruleIndex !== undefined ? { ruleIndex } : {}
  );
  const findings: LintFinding[] = [];

  for (const ch of uncovered) {
    const chNFC = ch.normalize("NFC");
    findings.push({
      code: "KM_LINT_TOUCH_UNCOVERED",
      severity: "warning",
      layer: "C",
      message: `${formatUncoveredTouchMessage(chNFC)}.`,
      location: makeLocation(touchLayoutPath),
      hint: `Add "${chNFC}" (${toUPlusNotation(chNFC)}) to the touch layout — e.g. as a longpress (sk) option, a flick direction, or a multitap entry on a reachable key in the touch gallery.`,
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// KM_LINT_TOUCH_KEY_NO_RULE — the dead custom touch key (0x092 analogue).
//
// A `T_XXXX` key has no intrinsic output; it produces only via a `.kmn` rule
// keyed on it. A key with NO rule at all is a key the user can press to no
// effect — invisible in Developer until compile time, and invisible in the
// studio entirely before this check.
//
// SPEC 058 T114: THE DETECTION MOVED, THE PROSE DID NOT. Every exemption, the
// per-distinct-id dedup, and the opaque-fragment severity downgrade now live in
// `findDeadTouchKeys` (contracts, `touch-key-diagnostics.ts`) — the ONE
// implementation FR-040 requires, shared with the edit-time surface so the two
// cannot drift. This function is what remains of the check: the English
// `message`/`hint` composed from the structured finding's own `fields`. The
// exemption tests in this module's test file still exercise them, through this
// function, exactly as before.
//
// THE EXEMPTIONS ARE STILL THE DESIGN — read them in the detector's doc. Each
// one corresponds to a real, attested idiom for a key that legitimately carries
// no rule; without them this check fires thousands of times on the corpus. Each
// has its own test, deliberately — an omnibus test would let one silently rot.
// ---------------------------------------------------------------------------

/**
 * Check that every custom (`T_`) touch key is wired to at least one rule.
 *
 * @param inputs.ir - The keyboard IR (needed for the opaque-fragment downgrade).
 * @param inputs.layout - The touch layout to walk.
 * @param inputs.ruleIndex - The touch key/rule join.
 * @param touchLayoutPath - Virtual FS path used in `location.file`.
 */
export function checkTouchKeyNoRule(
  inputs: { ir: KeyboardIR; layout: TouchLayoutIR; ruleIndex: TouchKeyRuleIndex },
  touchLayoutPath: string
): LintFinding[] {
  return findDeadTouchKeys(inputs).map((finding) => {
    const keyId = String(finding.fields.keyId);
    const platform = String(finding.fields.platform);
    const layerId = String(finding.fields.layerId);
    const hasOpaque = finding.fields.hasOpaque === true;

    return {
      code: "KM_LINT_TOUCH_KEY_NO_RULE",
      severity: finding.severity,
      layer: "C",
      message: `Touch key "${keyId}" (${platform} layer "${layerId}") has no rule, so pressing it does nothing.`,
      location: makeLocation(touchLayoutPath),
      hint: hasOpaque
        ? `Add a rule such as \`+ [${keyId}] > <output>\`, or rename the key to a self-outputting \`U_<HEX>\` id. Reported as a hint only because this keyboard contains content the parser could not read, which may already define a rule for this key.`
        : `Add a rule such as \`+ [${keyId}] > <output>\`, or rename the key to a self-outputting \`U_<HEX>\` id (which needs no rule). If the key is meant to be inert, give it a sentinel id such as \`T_BLANK\` with \`sp\` 9 or 10.`,
    };
  });
}

// ---------------------------------------------------------------------------
// KM_LINT_TOUCH_RULE_ORPHAN — the inverse defect. Developer has no such check.
//
// A rule keyed on a touch key id that no reachable key carries. The author wrote
// the rule, believes the character works, and nothing anywhere says otherwise.
// `sil_cameroon_azerty` ships exactly this: a `T_03B1` guard+producing pair whose
// layout carries only `U_03B1`.
// ---------------------------------------------------------------------------

/**
 * Check for rules keyed on a touch key id nothing reachable carries.
 *
 * Fires ONLY when a touch layout exists — a desktop-only keyboard has no layout
 * for a key to be missing from, and reporting its whole rule set would be absurd.
 * That guard lives in `collectTouchRuleOrphans`.
 */
export function checkTouchRuleOrphan(
  inputs: { ir: KeyboardIR; layout: TouchLayoutIR; ruleIndex: TouchKeyRuleIndex },
  touchLayoutPath: string
): LintFinding[] {
  // Detection — including the one-per-orphaned-id dedup and the prefix-swap
  // near-miss search — is `findTouchRuleOrphans` (contracts). See the T114 note
  // above `checkTouchKeyNoRule`.
  return findTouchRuleOrphans(inputs).map((finding) => {
    const keyId = String(finding.fields.keyIdAsWritten);
    const reason = finding.fields.reason;
    const nearMiss = finding.fields.nearMissId;

    if (reason === "unreachable-layer") {
      return {
        code: "KM_LINT_TOUCH_RULE_ORPHAN",
        severity: "warning",
        layer: "C",
        message: `A rule is keyed on touch key "${keyId}", which exists only on a layer nothing navigates to.`,
        location: makeLocation(touchLayoutPath),
        hint: `Add a \`nextlayer\` path to the layer carrying "${keyId}", or move the key onto a layer reachable from "default".`,
      };
    }

    // ABSENT — and this is where the finding earns its keep. Name the near-miss.
    // THE REAL PAYOFF. A `U_` id self-outputs BEFORE any rule can run against
    // it, so the layout's `U_03B1` types its character directly and the author's
    // `any(diablock) + [T_03B1] > context` guard never fires. The keyboard
    // "works" and its guard is silently bypassed — precisely the class of defect
    // that is invisible without the join.
    if (typeof nearMiss === "string" && finding.fields.nearMissSelfOutputs === true) {
      return {
        code: "KM_LINT_TOUCH_RULE_ORPHAN",
        severity: "warning",
        layer: "C",
        message: `A rule is keyed on touch key "${keyId}", but no key carries that id — the layout has "${nearMiss}" instead, which outputs its character directly and therefore bypasses the rule.`,
        location: makeLocation(touchLayoutPath),
        hint: `Rename the layout key "${nearMiss}" to "${keyId}" so the rule fires. As "${nearMiss}" it self-outputs before any rule runs, so any guard on "${keyId}" is silently skipped.`,
      };
    }

    return {
      code: "KM_LINT_TOUCH_RULE_ORPHAN",
      severity: "warning",
      layer: "C",
      message: `A rule is keyed on touch key "${keyId}", but no key of any layer of any platform carries that id.`,
      location: makeLocation(touchLayoutPath),
      hint: `Add a key with id "${keyId}" to the touch layout, or remove the rule if the character is reached another way.`,
    };
  });
}

// ---------------------------------------------------------------------------
// KM_HINT_TOUCH_KEY_ID_CASE — the latent case asymmetry. A HINT, not a warning.
//
// `kmcmplib` interns key names case-insensitively, so a layout key `T_CaseTest`
// and a rule keyed on `T_CASETEST` compile and work — on OUR build. Keyman
// Developer's validator compares case-sensitively and warns. The file is
// therefore correct here and reportable there, and an author who never runs
// Developer would never learn why their keyboard warns in someone else's
// toolchain.
//
// Hint severity, because nothing is broken. It is latent, not wrong.
// ---------------------------------------------------------------------------

export function checkTouchKeyIdCase(
  inputs: { layout: TouchLayoutIR; ruleIndex: TouchKeyRuleIndex },
  touchLayoutPath: string
): LintFinding[] {
  // Detection is `findTouchKeyIdCaseMismatches` (contracts) — see the T114 note
  // above `checkTouchKeyNoRule`.
  return findTouchKeyIdCaseMismatches(inputs).map((finding) => {
    const keyId = String(finding.fields.keyId);
    const differing = finding.fields.ruleSpellings as readonly string[];
    return {
      code: "KM_HINT_TOUCH_KEY_ID_CASE",
      severity: "hint",
      layer: "C",
      message: `Touch key "${keyId}" is spelled ${differing.map((s) => `"${s}"`).join(", ")} in its rule(s). This compiles here, but Keyman Developer compares key ids case-sensitively and will warn.`,
      location: makeLocation(touchLayoutPath),
      hint: `Use one spelling in both places — e.g. rename the rule's key to "${keyId}" — so the keyboard is warning-free in Keyman Developer too.`,
    };
  });
}
