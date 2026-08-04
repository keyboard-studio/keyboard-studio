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
  bindingsForKeyId,
  collectReachableTouchKeyIds,
  collectTouchRuleOrphans,
  computeTouchCoverage,
  formatUncoveredTouchMessage,
  isCustomTouchKeyId,
  isDeadkeyStyledKeyClass,
  isSpacerKeyClass,
  normalizeTouchKeyId,
  toUPlusNotation,
} from "@keyboard-studio/contracts";
import {
  isFrameKeyLabel,
  isRulelessByConvention,
  makeLocation,
  walkTouchKeysDeep,
} from "./_shared.js";

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
// THE EXEMPTIONS ARE THE DESIGN. Each one below corresponds to a real, attested
// idiom for a key that legitimately carries no rule; without them this check
// would fire thousands of times on the corpus and be turned off within a week.
// Each has its own test, deliberately — an omnibus test would let one silently
// rot.
// ---------------------------------------------------------------------------

/**
 * `sp` classes for which a missing rule is a real defect: absent, 0 (character),
 * or 8 (deadkey-STYLED).
 *
 * 0x092 parity. This is where the corrected `sp` enum matters: sp:8 is
 * deadkey-styled and INTERACTIVE, so a dead sp:8 key is exactly as broken as a
 * dead sp:0 one. Under the old `{8,10}` spacer reading, sp:8 keys were treated as
 * inert and would have been skipped here — half the reason this check could not
 * have been written correctly before the FR-012 correction.
 */
function isProducingKeyClass(sp: number | undefined): boolean {
  return sp === undefined || sp === 0 || isDeadkeyStyledKeyClass(sp);
}

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
  const { ir, layout, ruleIndex } = inputs;
  const findings: LintFinding[] = [];

  // WHOLE-IR opaque scope, not per-group. An opaque fragment can hold a rule for
  // any key and the check cannot prove otherwise, so every finding degrades to a
  // hint. Finer (same-group) scoping is deliberately not attempted: a fragment's
  // group attribution is precisely the information the codec failed to recover
  // when it fell back to RawKmnFragment in the first place.
  const hasOpaque = ir.raw.length > 0;
  const severity: LintFinding["severity"] = hasOpaque ? "hint" : "warning";

  const reported = new Set<string>();

  // Descends into sk/multitap/flick, as Developer's own 0x092 does — the flat
  // walkTouchKeys would miss every longpress entry.
  walkTouchKeysDeep(layout, ({ platform, layer, key }) => {
    // Scope: custom ids only. A `K_` key resolves against the compiled-in keyword
    // table and has a physical position whether or not a rule mentions it.
    if (!isCustomTouchKeyId(key.id)) return;

    // Exemption: a layer-switch key does its job via `nextlayer`, not a rule.
    if (key.nextlayer !== undefined && key.nextlayer.length > 0) return;

    // Exemption: only a producing key class can be dead. Blank and spacer keys
    // are non-interactive by construction.
    if (!isProducingKeyClass(key.sp)) return;
    if (isSpacerKeyClass(key.sp)) return;

    // Exemption: a `*`-prefixed frame label draws its caption from Keyman's own
    // string table; it is not literal output and never needs a rule.
    if (isFrameKeyLabel(key.text)) return;

    // Exemption: sentinel ids and auto-minted/reserved prefixes.
    if (isRulelessByConvention(key.id)) return;

    // Exemption: a `U_` id SELF-OUTPUTS (forUnicodeKeynames), so it needs no rule
    // to produce its codepoint. Cameroon's `U_00A1` / `U_00BF` longpresses under
    // `T_0021` / `T_003F` are correctly exempt for exactly this reason.
    if (normalizeTouchKeyId(key.id).startsWith("U_")) return;

    // THE ACTUAL TEST: zero bindings of ANY role. A key whose only bindings are
    // guard / suppresses / transitions / opaque is WIRED, not dead — which is why
    // `+ [T_CAM] > nul` must not be reported. Only total absence fires.
    if (bindingsForKeyId(ruleIndex, key.id).length > 0) return;

    // One finding per distinct id, not per occurrence: a `T_` id legitimately
    // appears on several layers and platforms, and N copies of one message would
    // bury every other finding.
    const normalized = normalizeTouchKeyId(key.id);
    if (reported.has(normalized)) return;
    reported.add(normalized);

    findings.push({
      code: "KM_LINT_TOUCH_KEY_NO_RULE",
      severity,
      layer: "C",
      message: `Touch key "${key.id}" (${platform.id} layer "${layer.id}") has no rule, so pressing it does nothing.`,
      location: makeLocation(touchLayoutPath),
      hint: hasOpaque
        ? `Add a rule such as \`+ [${key.id}] > <output>\`, or rename the key to a self-outputting \`U_<HEX>\` id. Reported as a hint only because this keyboard contains content the parser could not read, which may already define a rule for this key.`
        : `Add a rule such as \`+ [${key.id}] > <output>\`, or rename the key to a self-outputting \`U_<HEX>\` id (which needs no rule). If the key is meant to be inert, give it a sentinel id such as \`T_BLANK\` with \`sp\` 9 or 10.`,
    });
  });

  return findings;
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
  const { ir, layout, ruleIndex } = inputs;
  const orphans = collectTouchRuleOrphans(ir, ruleIndex);
  if (orphans.length === 0) return [];

  const { allIds } = collectReachableTouchKeyIds(layout);
  const findings: LintFinding[] = [];
  const reported = new Set<string>();

  for (const { binding, reason } of orphans) {
    // One finding per orphaned id, not per binding: the guard and the producing
    // rule of a pair are ONE defect with ONE fix, and reporting both would read
    // as two independent problems.
    const normalized = normalizeTouchKeyId(binding.keyIdAsWritten);
    if (reported.has(normalized)) continue;
    reported.add(normalized);

    if (reason === "unreachable-layer") {
      findings.push({
        code: "KM_LINT_TOUCH_RULE_ORPHAN",
        severity: "warning",
        layer: "C",
        message: `A rule is keyed on touch key "${binding.keyIdAsWritten}", which exists only on a layer nothing navigates to.`,
        location: makeLocation(touchLayoutPath),
        hint: `Add a \`nextlayer\` path to the layer carrying "${binding.keyIdAsWritten}", or move the key onto a layer reachable from "default".`,
      });
      continue;
    }

    // ABSENT — and this is where the finding earns its keep. Name the near-miss.
    const nearMiss = findNearMissId(normalized, allIds);
    if (nearMiss !== undefined && nearMiss.startsWith("U_")) {
      // THE REAL PAYOFF. A `U_` id self-outputs BEFORE any rule can run against
      // it, so the layout's `U_03B1` types its character directly and the author's
      // `any(diablock) + [T_03B1] > context` guard never fires. The keyboard
      // "works" and its guard is silently bypassed — precisely the class of defect
      // that is invisible without the join.
      findings.push({
        code: "KM_LINT_TOUCH_RULE_ORPHAN",
        severity: "warning",
        layer: "C",
        message: `A rule is keyed on touch key "${binding.keyIdAsWritten}", but no key carries that id — the layout has "${nearMiss}" instead, which outputs its character directly and therefore bypasses the rule.`,
        location: makeLocation(touchLayoutPath),
        hint: `Rename the layout key "${nearMiss}" to "${binding.keyIdAsWritten}" so the rule fires. As "${nearMiss}" it self-outputs before any rule runs, so any guard on "${binding.keyIdAsWritten}" is silently skipped.`,
      });
      continue;
    }

    findings.push({
      code: "KM_LINT_TOUCH_RULE_ORPHAN",
      severity: "warning",
      layer: "C",
      message: `A rule is keyed on touch key "${binding.keyIdAsWritten}", but no key of any layer of any platform carries that id.`,
      location: makeLocation(touchLayoutPath),
      hint: `Add a key with id "${binding.keyIdAsWritten}" to the touch layout, or remove the rule if the character is reached another way.`,
    });
  }

  return findings;
}

/**
 * The layout id that differs from `normalizedRuleId` only in its prefix — e.g.
 * `U_03B1` for a rule keyed on `T_03B1`.
 *
 * Prefix-swap only, deliberately: a looser edit-distance search would produce
 * confident-sounding but wrong suggestions, and the prefix swap is the one
 * near-miss shape with a real, explainable cause (`U_` self-outputs).
 */
function findNearMissId(
  normalizedRuleId: string,
  allIds: ReadonlySet<string>
): string | undefined {
  const body = normalizedRuleId.slice(2);
  for (const prefix of ["U_", "T_", "K_"]) {
    if (normalizedRuleId.startsWith(prefix)) continue;
    const candidate = `${prefix}${body}`;
    if (allIds.has(candidate)) return candidate;
  }
  return undefined;
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
  const { layout, ruleIndex } = inputs;
  const findings: LintFinding[] = [];
  const reported = new Set<string>();

  walkTouchKeysDeep(layout, ({ key }) => {
    if (key.id.length === 0) return;
    const normalized = normalizeTouchKeyId(key.id);
    if (reported.has(normalized)) return;

    const spellings = ruleIndex.spellings.get(normalized);
    if (spellings === undefined) return;

    // A mismatch exists when some rule spells the id differently from the layout.
    // Comparing against EVERY spelling (rather than the first) means a file with
    // three inconsistent spellings still reports once, naming them all.
    const differing = spellings.filter((s) => s !== key.id);
    if (differing.length === 0) return;

    reported.add(normalized);
    findings.push({
      code: "KM_HINT_TOUCH_KEY_ID_CASE",
      severity: "hint",
      layer: "C",
      message: `Touch key "${key.id}" is spelled ${differing.map((s) => `"${s}"`).join(", ")} in its rule(s). This compiles here, but Keyman Developer compares key ids case-sensitively and will warn.`,
      location: makeLocation(touchLayoutPath),
      hint: `Use one spelling in both places — e.g. rename the rule's key to "${key.id}" — so the keyboard is warning-free in Keyman Developer too.`,
    });
  });

  return findings;
}
