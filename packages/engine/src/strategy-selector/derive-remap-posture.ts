// see spec.md §7.2 rule 8 — derived A7a (remap posture) detection.
//
// The A7a twin of import-mark-order.ts's A3a detector, with one structural
// difference: A3a evidence lives entirely in the base IR, so it is seeded at
// instantiation; A7a evidence is the MISMATCH between the target script
// (known only once the identity lands) and the base's letter keys, so this
// detector takes the target as an input and the studio runs it when the
// target script lands, folding a hit onto irAxes (source: "ir-derived").
// From there it flows through defaultFillAxes into selectStrategy exactly
// like the A3a fill — a present remapPosture is preserved, so rule 8 fires
// in production, not just in tests. The author's own recorded answer at the
// characters-step confirmation outranks the fill (tier 1, §7.2 precedence).
//
// FIRING SHAPE (all three required):
//   1. scriptClass (A2) is "alphabetic" — A7a is an alphabetic-only sub-axis.
//   2. The target script is NOT Latin. This is the guardrail: a Latin target
//      never fires, so Latin special-letters addition cases can never be
//      reclassified as remaps.
//   3. Every classifiable letter-key output in the base IR is Latin-script:
//      the base types Latin letters on its letter keys (K_A–K_Z, default
//      layer) while the target wants a different script — the mnemonic
//      shape (armenian_mnemonic_r, russian_mnemonic_r) where the author
//      re-uses the Latin letter keys for the target script's letters.
//
// CLASSIFICATION: a letter-key rule's evidence is the FIRST codepoint its
// output produces, classified with the engine's script lookup (scriptOf).
// Deadkey/beep output elements produce no character themselves and are
// stepped over (a deadkey-first output is classified by the character that
// follows it); index()/outs() elements resolve through ir.stores. A rule
// whose first produced codepoint cannot be determined (raw/context output,
// an unresolvable store ref, a nul output, deadkeys only) is NO evidence —
// it neither supports nor blocks a fire. A codepoint in a neutral script
// (Common / Inherited / Unknown) is likewise no evidence. One classifiable
// non-Latin letter-key output blocks the fire: the base is not a Latin
// letter base, so there is no mismatch to derive from.

import type {
  KeyboardIR,
  OutputElement,
  RemapPosture,
  ScriptClass,
} from "@keyboard-studio/contracts";
import { scriptOf } from "../facets/generated/scriptLookup.js";

/** Scripts that carry no script identity of their own (marks, digits, unknown). */
const SCRIPT_NEUTRAL = new Set(["Zyyy", "Zinh", "Zzzz", "Zxxx"]);

const LETTER_VKEY = /^K_[A-Z]$/;

/**
 * The first codepoint `output` produces, or `undefined` when it cannot be
 * determined from the typed output elements (see the module header for the
 * per-element rules). `stores` resolves index()/outs() references.
 */
function firstProducedCodepoint(
  output: readonly OutputElement[],
  stores: KeyboardIR["stores"],
): number | undefined {
  for (const el of output) {
    switch (el.kind) {
      case "char": {
        const cp = el.value.codePointAt(0);
        if (cp !== undefined) return cp;
        break;
      }
      case "deadkey":
      case "beep":
        // Produce no character themselves; the produced character (if any)
        // comes from a later element.
        break;
      case "index": {
        const store = stores.find((s) => s.name === el.storeRef);
        const item = store?.items[el.offset - 1];
        if (item === undefined || item.kind !== "char") return undefined;
        const cp = item.value.codePointAt(0);
        if (cp !== undefined) return cp;
        return undefined;
      }
      case "outs": {
        const store = stores.find((s) => s.name === el.storeRef);
        if (store === undefined) return undefined;
        for (const item of store.items) {
          if (item.kind !== "char") continue;
          const cp = item.value.codePointAt(0);
          if (cp !== undefined) return cp;
        }
        return undefined;
      }
      case "nul":
      case "context":
      case "useGroup":
      case "raw":
        return undefined;
    }
  }
  return undefined;
}

/**
 * Derive A7a `remapPosture` from the target identity and the base IR (spec
 * §7.2 rule 8). Returns `"full-remap"` when the script mismatch at the
 * letter keys is present (see the module header for the exact firing
 * shape), otherwise `undefined` — callers must not assume a fill happens;
 * when this returns `undefined` the script-class prior's `"addition"` (or
 * the author's recorded answer) stands.
 *
 * @see spec.md §7.2 rule 8
 */
export function deriveRemapPosture(args: {
  scriptClass: ScriptClass;
  targetScript: string;
  baseIr: KeyboardIR;
}): RemapPosture | undefined {
  const { scriptClass, targetScript, baseIr } = args;
  if (scriptClass !== "alphabetic") return undefined;
  // Guardrail: a Latin target never fires (Latin-on-Latin is addition by
  // definition, e.g. Latin special-letters keyboards). An empty target is
  // no target at all — the identity has not landed yet.
  if (targetScript.trim() === "" || targetScript === "Latn") return undefined;

  let latinOutputs = 0;
  for (const group of baseIr.groups) {
    for (const rule of group.rules) {
      // The codec preserves a structural inline `+` as a raw context
      // element on some shapes (see import-mark-order.ts); strip it before
      // inspecting the context.
      const real = rule.context.filter(
        (el) => !(el.kind === "raw" && el.text.trim() === "+"),
      );
      if (real.length !== 1) continue;
      const key = real[0];
      if (key === undefined || key.kind !== "vkey") continue;
      if (!LETTER_VKEY.test(key.name)) continue;
      // Default layer only: a shifted (or otherwise modified) letter key is
      // a different chord, not the base letter the author re-uses.
      if (key.modifiers.length !== 0) continue;

      const cp = firstProducedCodepoint(rule.output, baseIr.stores);
      if (cp === undefined) continue;
      const script = scriptOf(cp);
      if (SCRIPT_NEUTRAL.has(script)) continue;
      if (script !== "Latn") {
        // One classifiable non-Latin letter-key output: the base is not a
        // Latin letter base, so there is no mismatch to derive from.
        return undefined;
      }
      latinOutputs += 1;
    }
  }

  return latinOutputs > 0 ? "full-remap" : undefined;
}
