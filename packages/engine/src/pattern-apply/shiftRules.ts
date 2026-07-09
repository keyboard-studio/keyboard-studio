/**
 * Shift-layer rule planning/building helpers.
 *
 * Producer-side groundwork for two studio features:
 *   1. Shift-layer key assignments — user maps shift+key -> a character.
 *   2. Case-pair proposal — user maps a base character, engine proposes the
 *      case counterpart on the shift layer (see character-discovery/casePair.ts).
 *
 * The KeyboardIR codec already parses/emits `[SHIFT K_X]` vkeys
 * (codec/parse.ts `parseVkeyBracket`, codec/emit.ts `fmtContextElement`).
 * This module supplies the studio with:
 *   - a mnemonic-layout guard (NEVER emit `[SHIFT K_X]` rules for mnemonic
 *     keyboards — in mnemonic mode K_X already means the base-layout
 *     character, so a SHIFT-flagged rule would double-apply shift),
 *   - a CAPS-handling scan (once a key carries any explicit CAPS/NCAPS rule,
 *     kmcmplib's CAPS auto-handling turns off for that key — first-match-wins,
 *     no specificity reordering — so a shift assignment on such a key needs
 *     both the CAPS and NCAPS combos to stay correct per Layer-A Check #10),
 *   - the .kmn rule-line text to inject for a given shift assignment.
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";

const MNEMONIC_STORE_NAME = "MNEMONICLAYOUT";

/** Concatenate an IRStore's char/raw items into a plain string value. */
function storeTextValue(ir: KeyboardIR, systemStoreName: string): string | undefined {
  const store = ir.stores.find(
    (s) => s.isSystem && s.name.toUpperCase() === systemStoreName,
  );
  if (store === undefined) return undefined;
  return store.items
    .map((item) => {
      if (item.kind === "char") return item.value;
      if (item.kind === "raw") return item.text;
      return "";
    })
    .join("");
}

/**
 * Returns true when the keyboard's `&mnemoniclayout` store is set to "1".
 *
 * NEVER emit `[SHIFT K_X]` rules for a mnemonic keyboard — in mnemonic mode,
 * K_X already resolves to the base-layout character (the OS keyboard-layout
 * mapping, not a fixed positional key), so a SHIFT-flagged rule on top of
 * that would double-apply the shift. The studio disables shift targeting
 * whenever this returns true.
 */
export function isMnemonicLayout(ir: KeyboardIR): boolean {
  return storeTextValue(ir, MNEMONIC_STORE_NAME) === "1";
}

/**
 * Returns true if any rule in the named group targets `vkeyName` with an
 * explicit CAPS or NCAPS modifier.
 *
 * kmcmplib's CAPS auto-handling turns off for a key once any explicit
 * CAPS/NCAPS rule exists for it (first-match-wins ordering, no specificity
 * reordering) — so once true, a new shift assignment for that key must supply
 * both the CAPS and NCAPS combos rather than relying on the compiler's
 * automatic CAPS-state derivation.
 */
export function keyHasCapsHandling(
  ir: KeyboardIR,
  groupName: string,
  vkeyName: string,
): boolean {
  const group = ir.groups.find((g) => g.name === groupName);
  if (group === undefined) return false;
  for (const rule of group.rules) {
    for (const el of rule.context) {
      if (
        el.kind === "vkey" &&
        el.name === vkeyName &&
        el.modifiers.some((m) => m === "CAPS" || m === "NCAPS")
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Format a single character as `U+XXXX` (uppercase hex, 4+ digits) — the same
 * style used by the mechanism gallery's base-layer swap rules.
 */
function fmtCodepoint(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

/**
 * Build the .kmn rule line(s) for a shift-layer key assignment.
 *
 * - No CAPS handling on the key: a single `+ [SHIFT K_X] > U+XXXX` line.
 * - CAPS handling present: both `+ [NCAPS SHIFT K_X] > U+XXXX` and
 *   `+ [CAPS SHIFT K_X] > U+XXXX` lines, completing the four-combo
 *   requirement of Layer-A Check #10.
 */
export function buildShiftRuleLines(
  vkey: string,
  shiftChar: string,
  opts: { capsHandling: boolean },
): string[] {
  const cp = fmtCodepoint(shiftChar);
  if (!opts.capsHandling) {
    return [`+ [SHIFT ${vkey}] > ${cp}`];
  }
  return [
    `+ [NCAPS SHIFT ${vkey}] > ${cp}`,
    `+ [CAPS SHIFT ${vkey}] > ${cp}`,
  ];
}

/** Result of {@link planShiftAssignment}. */
export interface ShiftAssignmentPlan {
  /** False when the keyboard is mnemonic — the studio must disable shift targeting. */
  allowed: boolean;
  /** Present (and always `"mnemonic"`) when `allowed` is false. */
  reason?: "mnemonic";
  /** Whether the target key already has explicit CAPS/NCAPS handling. */
  capsHandling: boolean;
}

/**
 * Convenience wrapper combining the mnemonic guard and the CAPS scan into a
 * single plan the studio can act on before calling {@link buildShiftRuleLines}.
 */
export function planShiftAssignment(
  ir: KeyboardIR,
  groupName: string,
  vkey: string,
): ShiftAssignmentPlan {
  const capsHandling = keyHasCapsHandling(ir, groupName, vkey);
  if (isMnemonicLayout(ir)) {
    return { allowed: false, reason: "mnemonic", capsHandling };
  }
  return { allowed: true, capsHandling };
}
