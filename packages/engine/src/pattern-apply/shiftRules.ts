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
 *   - the .kmn rule-line text to inject for a given shift assignment, a bare
 *     base-layer assignment (buildBaseRuleLines), and a combined base+shift
 *     case-pair assignment (buildCasePairRuleLines) — the latter exists so a
 *     base-layer swap on a CAPS-handling key plus a confirmed shift-layer
 *     companion can be expressed as ONE set of rules instead of two
 *     separately-emitted CAPS/NCAPS pairs that would otherwise conflict (a
 *     second `[CAPS K_X]` line silently shadowing the first — see
 *     buildCasePairRuleLines's docstring).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";

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
 *
 * Distinct from placement/filters.ts's `isMnemonicKeyboard`: that reads the
 * `begin` directive/ANSI-vs-Unicode store shape to decide whether a
 * keyboard's IR is even meaningful to extract placement data from; this
 * reads the `&mnemoniclayout` system store's runtime value to decide whether
 * K_X is a mnemonic or positional key for a NEW rule the studio is about to
 * author. Different signal, different question — do not merge them.
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
  const cp = toUPlusNotation(shiftChar);
  if (!opts.capsHandling) {
    return [`+ [SHIFT ${vkey}] > ${cp}`];
  }
  return [
    `+ [NCAPS SHIFT ${vkey}] > ${cp}`,
    `+ [CAPS SHIFT ${vkey}] > ${cp}`,
  ];
}

/**
 * Build the .kmn rule line(s) for a BASE-layer key assignment (S-01 simple
 * swap), CAPS-aware.
 *
 * - No CAPS handling on the key: a single `+ [K_X] > U+XXXX` line — kmcmplib's
 *   automatic CapsLock handling (Unicode case-mapping the output) still
 *   applies for this key.
 * - CAPS handling present: both `+ [NCAPS K_X] > U+XXXX` and
 *   `+ [CAPS K_X] > U+XXXX` lines, same output for both — a bare (unmodified)
 *   rule on a CAPS-handling key would match BOTH caps states anyway (once any
 *   explicit CAPS/NCAPS rule exists for a key, kmcmplib turns off automatic
 *   CAPS handling for it and matching is first-rule-wins with no specificity
 *   reordering — Layer-A Check #10), but emitting it as a bare line would
 *   also shadow any PRE-EXISTING CAPS/NCAPS pair for the same key, since
 *   newly-injected lines are spliced in before the base's existing rules
 *   (applyAssignments's merge-by-group-name ordering). Emitting the explicit
 *   pair here keeps the two states visible in the emitted source even though
 *   the output is identical for both.
 */
export function buildBaseRuleLines(
  vkey: string,
  baseChar: string,
  opts: { capsHandling: boolean },
): string[] {
  const cp = toUPlusNotation(baseChar);
  if (!opts.capsHandling) {
    return [`+ [${vkey}] > ${cp}`];
  }
  return [`+ [NCAPS ${vkey}] > ${cp}`, `+ [CAPS ${vkey}] > ${cp}`];
}

/**
 * Build the .kmn rule line(s) for a combined base+shift case-pair assignment
 * on the SAME key — the base character on the unshifted layer, its case
 * counterpart on the shift layer.
 *
 * - No CAPS handling on the key: `+ [K_X] > <base>` and `+ [SHIFT K_X] > <shift>`
 *   — identical to independently calling {@link buildBaseRuleLines} and
 *   {@link buildShiftRuleLines} with `capsHandling: false`, since the two
 *   rules target disjoint contexts (no CAPS/NCAPS modifier on either) and
 *   cannot conflict.
 * - CAPS handling present: the full four-combo quad, with CapsLock acting
 *   as a case-inverter (matching well-authored Keyman keyboards):
 *     `+ [NCAPS K_X] > <base>`, `+ [NCAPS SHIFT K_X] > <shift>`,
 *     `+ [CAPS K_X] > <shift>`, `+ [CAPS SHIFT K_X] > <base>`.
 *   Callers on a CAPS-handling key MUST use this single combined builder
 *   rather than calling buildBaseRuleLines + buildShiftRuleLines separately:
 *   each of those would independently emit its own `[CAPS K_X]`/`[NCAPS K_X]`
 *   line (base pair maps CAPS to <base>, shift pair maps CAPS to <shift>),
 *   producing two conflicting rules for the same context where the
 *   first-inserted one silently wins (Layer-A Check #10).
 */
export function buildCasePairRuleLines(
  vkey: string,
  baseChar: string,
  shiftChar: string,
  opts: { capsHandling: boolean },
): string[] {
  const baseCp = toUPlusNotation(baseChar);
  const shiftCp = toUPlusNotation(shiftChar);
  if (!opts.capsHandling) {
    return [`+ [${vkey}] > ${baseCp}`, `+ [SHIFT ${vkey}] > ${shiftCp}`];
  }
  return [
    `+ [NCAPS ${vkey}] > ${baseCp}`,
    `+ [NCAPS SHIFT ${vkey}] > ${shiftCp}`,
    `+ [CAPS ${vkey}] > ${shiftCp}`,
    `+ [CAPS SHIFT ${vkey}] > ${baseCp}`,
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
