/**
 * Mnemonic-vs-positional classifier (spec 041 US1, T015).
 *
 * Value ∈ {mnemonic, positional}, read from the `&MNEMONICLAYOUT` system store
 * (reusing the engine's `isMnemonicLayout`): a keyboard declaring the store is
 * mnemonic, otherwise positional. This is a GATE facet (FR-016, AS-3): it is
 * measured and surfaced, but tagged so downstream transform never offers it —
 * flipping a keyboard's binding model is not a safe automatic edit. The gate
 * marker rides in `notes` (the Categorization shape carries no transform flag).
 *
 * The facet's `mixed` value (a keyboard that mixes both binding models across
 * groups) is NOT emitted by this store-read v1: detecting it reliably requires a
 * per-rule keystroke-reference cross-check that a measurement starter should not
 * approximate. `mixed` therefore stays a valid-but-unreached member here,
 * deferred rather than guessed — an honest single-value read (FR-016 favours
 * under-claiming a mix over a wrong clean value the gate would otherwise mask).
 */

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { isMnemonicLayout } from "../../packages/engine/src/pattern-apply/shiftRules.js";

import { assembleMeasurement, neutralContext, undeterminedFallback } from "./measurement.js";
import type { Categorization, FacetDefinition } from "./types.js";
import type { ScannedKeyboard } from "./scan.js";

const GATE_NOTE = "gate facet: measured/surfaced only, never offered for transform";

export function classifyMnemonicVsPositional(ir: KeyboardIR, def: FacetDefinition): Categorization | null {
  void def;
  const value = isMnemonicLayout(ir) ? "mnemonic" : "positional";
  return assembleMeasurement({
    sites: [{ location: "keyboard", value }],
    ctx: neutralContext(ir),
    ir,
    dominant: value,
    notes: `${GATE_NOTE}; &MNEMONICLAYOUT ${value === "mnemonic" ? "set" : "unset"}`,
  });
}

export function mnemonicVsPositionalFallback(kb: ScannedKeyboard, def: FacetDefinition): Categorization {
  void kb;
  void def;
  return undeterminedFallback("no rule structure; mnemonic-vs-positional undetermined");
}
