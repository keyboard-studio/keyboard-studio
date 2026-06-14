// Check 18.6 — KM_LINT_INVENTORY_UNCOVERED
// Criteria: Every character in the confirmed linguist inventory is produced by some
// reachable input sequence in the draft keyboard.
//
// SCOPE GUARD: only runs when keyboardIR.origin === "scaffolded". If origin is
// "imported" or "synthesized", or if any RawKmnFragment is present, return [].
//
// The emittable-char set is built via buildProducedSet() from @keyboard-studio/contracts.
// That utility:
//   - Accumulates consecutive {kind:"char"} elements within a single rule into a run
//     buffer, NFC-normalizes on flush, and adds each resulting codepoint. This means
//     base+combining sequences (NFD/decomposed emission) produce the NFC-precomposed
//     codepoint in the set, not the two raw codepoints independently.
//   - Expands {kind:"outs"} and {kind:"index"} store references item-by-item (each
//     item.value NFC-normalized individually; no cross-item run merging).
//   - Ignores {kind:"deadkey"}, {kind:"beep"}, {kind:"raw"} elements.
//   - Excludes control characters U+0000-U+001F, DEL U+007F, and U+0020 SPACE by default.
//
// For each LinguistInventory char NOT in the emittable set, emit one finding.
// The inventory char is NFC-normalized before lookup so precomposed codepoints in
// the inventory match when the keyboard emits the NFC form directly.
//
// Accepted heuristic limit: opaque/raw fragments — if the keyboard body contains a
// RawKmnFragment the scope guard exits early (ir.raw.length > 0 -> return []).
// However if the raw content lives inside a store item marked {kind:"raw"}, the
// store-expansion loop skips it and the character will appear uncovered even though
// it is reachable. Reviewers should treat a finding on a keyboard with raw store
// items as a possible false positive.

import type { LintFinding, KeyboardIR, LinguistInventory } from "@keyboard-studio/contracts";
import { linguistInventoryChars, buildProducedSet } from "@keyboard-studio/contracts";

/**
 * Check that every character in the linguist inventory is emittable by the keyboard.
 * Only runs for scaffolded keyboards with no raw fragments.
 *
 * @param ir - The keyboard IR (must have origin === "scaffolded" to run).
 * @param inventory - The confirmed linguist inventory.
 * @param kmnPath - Virtual FS path used in `location.file`.
 */
export function checkInventoryCoverage(
  ir: KeyboardIR,
  inventory: LinguistInventory,
  kmnPath: string
): LintFinding[] {
  // Scope guard: only run for scaffolded keyboards
  if (ir.origin !== "scaffolded") return [];

  // Scope guard: skip if any RawKmnFragment is present (opaque content)
  if (ir.raw.length > 0) return [];

  // Build emittable set via the canonical shared utility.
  // Space/control filtering: buildProducedSet excludes controls and space by default.
  // The previous buildEmittableSet added raw chars and NFC-normalized chars separately;
  // buildProducedSet instead does run-merge NFC which is strictly more correct for
  // inventory coverage (base+combining pairs produce the precomposed form). The 18.6
  // test suite passes with this change — the only affected behavior is the bug case
  // where a keyboard emitting [base, combining] as two char elements now correctly
  // produces the NFC-precomposed form in the set instead of the two raw codepoints.
  const emittable = buildProducedSet(ir);

  // Supplement: also add individual raw char values so standalone combining marks
  // that appear in the inventory are recognized even when emitted alone.
  // buildProducedSet already handles this via single-element run flush (a lone
  // combining mark NFC-normalizes to itself).

  const inventoryChars = linguistInventoryChars(inventory);
  const findings: LintFinding[] = [];

  for (const ch of inventoryChars) {
    // NFC-normalize the inventory char before lookup so precomposed codepoints
    // match when the keyboard also emits the NFC form.
    const chNFC = ch.normalize("NFC");
    if (!emittable.has(chNFC)) {
      const codePoint = chNFC.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "?";
      findings.push({
        code: "KM_LINT_INVENTORY_UNCOVERED",
        severity: "warning",
        layer: "C",
        message: `Inventory character U+${codePoint} "${chNFC}" is not produced by any reachable rule in the keyboard.`,
        location: { file: kmnPath, line: 1 },
        hint: `Add an output rule that emits "${chNFC}" (U+${codePoint}), or verify it is covered via an opaque/raw fragment (static analysis does not see those). If your keyboard emits this character as a base codepoint followed by a combining mark (NFD/decomposed form), confirm that sequence normalizes to the expected NFC-precomposed codepoint — or mark the keyboard as having a raw fragment to suppress this check for abugida/abjad layouts where opaque store content handles composition.`,
      });
    }
  }

  return findings;
}
