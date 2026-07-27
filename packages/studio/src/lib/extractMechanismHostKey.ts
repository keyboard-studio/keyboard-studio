// extractMechanismHostKey — shared physical-host-key extraction (spec 035
// review-gate item 3, synthesis P1).
//
// TouchGallery's per-character suggestion useMemo and deriveDesktopModifications
// (packages/studio/src/lib/deriveDesktopModifications.ts) each independently
// inspected a Phase C MechanismRef to recover the physical host key a desktop
// mechanism targets, via the same four pattern/strategy shapes:
//   - simple_swap / S-01              — `kmnRules`'s `+ [K_X]` vkey.
//   - deadkey_single_tap / S-02       — first `baseLetters` letter -> K_<UPPER>.
//   - modifier_as_layer_switch / S-08 — `altgrKeyList`'s vkey (via parseKeySpec).
//   - multi_char_sequence / S-03      — first `firstLetterOut` letter -> K_<UPPER>.
//
// This is the single shared extraction. It returns the RAW result — including
// a possibly-EMPTY hostKey when the pattern is recognized but the slot value
// doesn't yield a usable key — and deliberately does not decide what to do
// with an empty hostKey: that policy differs by caller.
//   - TouchGallery keeps a suggestion with hostKey "" (opens the method
//     chooser so the user can pick a host key manually).
//   - deriveDesktopModifications omits the placement entirely when hostKey is
//     empty (a placement needs a concrete host key to land on).
//
// `kind` distinguishes "replace" (simple_swap) from "longpress" (the other
// three) — TouchGallery needs this to pick the right suggestion card;
// deriveDesktopModifications ignores it.
//
// Pure: no store reads, no React imports.

import type { MechanismRef } from "@keyboard-studio/contracts";
import { parseKeySpec } from "@keyboard-studio/engine";

export interface MechanismHostKeyResult {
  kind: "replace" | "longpress";
  /** May be empty when the pattern is recognized but no key could be extracted. */
  hostKey: string;
}

/**
 * Extract the physical host key a Phase C mechanism targets, and the
 * suggestion `kind` it implies. Returns `undefined` only when `m`'s
 * patternId/strategyId doesn't match any of the four recognized shapes.
 */
export function extractMechanismHostKey(m: MechanismRef): MechanismHostKeyResult | undefined {
  const pid = m.patternId;
  const sid = m.strategyId ?? "";
  const sv = m.slotValues ?? {};

  // simple_swap / S-01 — host key is the KMN rule's target vkey.
  if (pid === "simple_swap" || sid === "S-01") {
    const match = /\+\s*\[([A-Z0-9_]+)\]/.exec(sv["kmnRules"] ?? "");
    return { kind: "replace", hostKey: match?.[1] ?? "" };
  }

  // deadkey_single_tap / S-02 — host key derived from the first base letter.
  if (pid === "deadkey_single_tap" || sid === "S-02") {
    const baseLetters = sv["baseLetters"] ?? "";
    const firstLetter = baseLetters[0];
    const hostKey =
      firstLetter !== undefined && /^[a-zA-Z]$/.test(firstLetter)
        ? `K_${firstLetter.toUpperCase()}`
        : "";
    return { kind: "longpress", hostKey };
  }

  // modifier_as_layer_switch / S-08 — host key from the AltGr key spec.
  if (pid === "modifier_as_layer_switch" || sid === "S-08") {
    const parsed = parseKeySpec(sv["altgrKeyList"] ?? "");
    return { kind: "longpress", hostKey: parsed?.vkey ?? "" };
  }

  // multi_char_sequence / S-03 — host key from the first output letter.
  if (pid === "multi_char_sequence" || sid === "S-03") {
    const firstOut = sv["firstLetterOut"] ?? "";
    const firstChar = firstOut[0];
    const hostKey =
      firstChar !== undefined && /^[a-zA-Z]$/.test(firstChar)
        ? `K_${firstChar.toUpperCase()}`
        : "";
    return { kind: "longpress", hostKey };
  }

  // Unrecognized pattern/strategy — no extractable host key.
  return undefined;
}
