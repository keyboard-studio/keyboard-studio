// occupiedHostKeys — which physical host keys a KeyboardIR occupies (spec 055
// research D-05).
//
// No shipped predicate answers "which keys does this IR occupy" — a
// MechanismAssignment's `target` is a character, not a key (see
// contracts/src/assignmentMap.ts), and the host-key math itself lives only in
// extractMechanismHostKey (packages/studio/src/lib/extractMechanismHostKey.ts),
// which takes a MechanismRef, not a KeyboardIR. This module bridges the two:
// it classifies each IRRule's own structural shape into the minimal
// MechanismRef candidate extractMechanismHostKey recognizes, then delegates
// every host-key extraction to that shared function — it never reimplements
// or forks that math.
//
// Two of extractMechanismHostKey's four shapes have a direct, unambiguous
// counterpart in a parsed IRRule:
//   - simple_swap / S-01  — a rule whose context is a single vkey and whose
//     output is a single character: the ordinary "this key types this char"
//     shape. This also covers modifier combinations, including AltGr — an
//     AltGr rule is structurally identical at the IR level (a single vkey
//     context carrying a modifier), so it needs no separate branch.
//   - deadkey_single_tap / S-02 — a rule whose context is a deadkey marker
//     followed by the literal base-letter character being matched.
// modifier_as_layer_switch (S-08) has no IR shape distinct from simple_swap
// (both are a single vkey context), so it is covered by that branch already.
// multi_char_sequence (S-03) has no reliable single-rule structural signature
// in a parsed .kmn (it is reconstructed from a store-driven, multi-rule
// mechanism, not a single rule shape) — occupiedHostKeys does not attempt to
// recover it; in practice such a key is still captured via its own direct
// simple_swap rule.
//
// Pure: no store reads, no I/O, no mutation of `ir`.

import type { KeyboardIR, MechanismRef } from "@keyboard-studio/contracts";
import { extractMechanismHostKey } from "./extractMechanismHostKey.js";

/**
 * Classify every rule in `ir` into the minimal MechanismRef candidate
 * extractMechanismHostKey can recognize. A rule matching neither shape
 * contributes no candidate.
 */
function candidateRefs(ir: KeyboardIR): MechanismRef[] {
  const refs: MechanismRef[] = [];

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const ctx0 = rule.context[0];
      const out0 = rule.output[0];

      // simple_swap shape: exactly one vkey context element, exactly one char
      // output element.
      if (
        rule.context.length === 1 &&
        ctx0 !== undefined &&
        ctx0.kind === "vkey" &&
        rule.output.length === 1 &&
        out0 !== undefined &&
        out0.kind === "char"
      ) {
        const mods = ctx0.modifiers.join(" ");
        refs.push({
          patternId: "simple_swap",
          slotValues: { kmnRules: `[${mods.length > 0 ? `${mods} ` : ""}${ctx0.name}]` },
        });
        continue;
      }

      // deadkey_single_tap shape: a deadkey marker followed by the literal
      // base-letter character being matched.
      const ctx1 = rule.context[1];
      if (
        rule.context.length === 2 &&
        ctx0 !== undefined &&
        ctx0.kind === "deadkey" &&
        ctx1 !== undefined &&
        ctx1.kind === "char"
      ) {
        refs.push({
          patternId: "deadkey_single_tap",
          slotValues: { baseLetters: ctx1.value },
        });
      }
    }
  }

  return refs;
}

/**
 * Which physical host keys `ir` currently occupies — a key with at least one
 * rule producing a character on it. Host keys are recovered through the
 * existing {@link extractMechanismHostKey}; a candidate whose mechanism
 * yields no host key (an unrecognized shape, or a recognized shape whose slot
 * value fails its own extraction) contributes nothing — never an empty-string
 * key.
 */
export function occupiedHostKeys(ir: KeyboardIR): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const ref of candidateRefs(ir)) {
    const result = extractMechanismHostKey(ref);
    if (result !== undefined && result.hostKey.length > 0) {
      keys.add(result.hostKey);
    }
  }
  return keys;
}
