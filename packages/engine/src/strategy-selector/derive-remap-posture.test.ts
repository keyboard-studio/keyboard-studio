// Tests for derived A7a (remap posture) detection — the production-
// reachability half of rule 8.
//
// Two groups:
//   1. deriveRemapPosture() unit shape tests against hand-built IR
//      fixtures (vkeyRule / irGroup / makeTestIR from the contracts
//      fixtures, the same builders the studio journey harness uses).
//   2. An end-to-end lock: the derived value threaded through
//      defaultFillAxes + selectStrategy routes rule 8 -> S-06 (+S-04,
//      +S-08), and an author-recorded "addition" answer merged over the
//      derived baseline re-routes away from rule 8 (the tier-1 precedence
//      the characters-step confirmation relies on).

import { describe, it, expect } from "vitest";
import { deriveRemapPosture } from "./derive-remap-posture.js";
import { defaultFillAxes } from "./default-fill.js";
import { selectStrategy } from "./index.js";
import { mergePhaseResults } from "@keyboard-studio/contracts";
import type { IRGroup, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, irGroup, vkeyRule } from "@keyboard-studio/contracts/fixtures";

/** A base whose letter keys type the given per-key outputs (K_A, K_B, ...). */
function latinBase(outputs: readonly string[]): KeyboardIR {
  const group: IRGroup = irGroup({
    rules: outputs.map((output, i) =>
      vkeyRule({ vkey: `K_${String.fromCharCode(65 + i)}`, output }),
    ),
  });
  return makeTestIR([group]);
}

const LATIN_BASE = () => latinBase(["a", "b", "c", "d", "e"]);

describe("deriveRemapPosture", () => {
  it("fires for a Cyrillic target on a Latin letter base", () => {
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: LATIN_BASE() }),
    ).toBe("full-remap");
  });

  it("fires for Greek and Armenian targets on a Latin letter base", () => {
    for (const targetScript of ["Grek", "Armn", "Geor"]) {
      expect(
        deriveRemapPosture({ scriptClass: "alphabetic", targetScript, baseIr: LATIN_BASE() }),
      ).toBe("full-remap");
    }
  });

  it("never fires for a Latin target (the guardrail)", () => {
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Latn", baseIr: LATIN_BASE() }),
    ).toBeUndefined();
  });

  it("never fires for a non-alphabetic script class", () => {
    for (const scriptClass of ["abugida", "abjad", "syllabary", "logographic"] as const) {
      expect(
        deriveRemapPosture({ scriptClass, targetScript: "Cyrl", baseIr: LATIN_BASE() }),
      ).toBeUndefined();
    }
  });

  it("does not fire when the base letter keys already type the target script", () => {
    const cyrillicBase = latinBase(["а", "б", "в", "г", "д"]);
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: cyrillicBase }),
    ).toBeUndefined();
  });

  it("does not fire when even one letter key types a non-Latin script", () => {
    const mixedBase = latinBase(["a", "b", "ç", "д", "e"]);
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: mixedBase }),
    ).toBeUndefined();
  });

  it("classifies a deadkey-first output by the character that follows the deadkey", () => {
    const group: IRGroup = irGroup({
      rules: [
        vkeyRule({
          vkey: "K_A",
          output: [
            { kind: "deadkey", id: 1 },
            { kind: "char", value: "a" },
          ],
        }),
        vkeyRule({ vkey: "K_B", output: "b" }),
      ],
    });
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Armn", baseIr: makeTestIR([group]) }),
    ).toBe("full-remap");
  });

  it("classifies a multi-character output by its first codepoint", () => {
    const group: IRGroup = irGroup({
      rules: [vkeyRule({ vkey: "K_A", output: "ab" }), vkeyRule({ vkey: "K_B", output: "b" })],
    });
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: makeTestIR([group]) }),
    ).toBe("full-remap");
  });

  it("ignores shifted-layer letter rules (default layer only)", () => {
    const group: IRGroup = irGroup({
      rules: [
        vkeyRule({ vkey: "K_A", output: "a" }),
        vkeyRule({ vkey: "K_A", modifiers: ["SHIFT"], output: "А" }),
        vkeyRule({ vkey: "K_B", output: "b" }),
      ],
    });
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: makeTestIR([group]) }),
    ).toBe("full-remap");
  });

  it("treats a combining-mark-only letter output as no evidence", () => {
    const group: IRGroup = irGroup({
      rules: [vkeyRule({ vkey: "K_A", output: "\u0301" })], // a lone combining acute (U+0301)
    });
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: makeTestIR([group]) }),
    ).toBeUndefined();
  });

  it("resolves an index() letter output through its store", () => {
    const group: IRGroup = irGroup({
      rules: [
        vkeyRule({ vkey: "K_A", output: [{ kind: "index", storeRef: "letters", offset: 1 }] }),
        vkeyRule({ vkey: "K_B", output: "b" }),
      ],
    });
    const ir = makeTestIR([group], [
      { nodeId: "store#letters", name: "letters", isSystem: false, items: [{ kind: "char", value: "a" }] },
    ]);
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Grek", baseIr: ir }),
    ).toBe("full-remap");
  });

  it("returns undefined for an IR with no letter-key rules", () => {
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "Cyrl", baseIr: makeTestIR([]) }),
    ).toBeUndefined();
  });

  it("returns undefined when the target script is empty (identity not landed)", () => {
    expect(
      deriveRemapPosture({ scriptClass: "alphabetic", targetScript: "", baseIr: LATIN_BASE() }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group 2 — end-to-end: derive -> defaultFillAxes -> selectStrategy
// ---------------------------------------------------------------------------

describe("derived remap posture reachability (end-to-end)", () => {
  // The §7.5 armenian_mnemonic_r axis shape: medium alphabetic, weak
  // phonetic intuition, RAlt-only spare keys over a Latin base.
  const partial = {
    scale: "medium" as const,
    scriptClass: "alphabetic" as const,
    phoneticIntuition: "weak" as const,
    spareKeyAvailability: "RAlt only" as const,
  };

  it("the derived fill survives defaultFillAxes and routes rule 8 -> S-06 (+S-04, +S-08)", () => {
    const derived = deriveRemapPosture({
      scriptClass: "alphabetic",
      targetScript: "Armn",
      baseIr: LATIN_BASE(),
    });
    expect(derived).toBe("full-remap");

    const { axes, axisFills } = defaultFillAxes({ ...partial, remapPosture: derived });
    expect(axes.remapPosture).toBe("full-remap");
    // The prior must not claim the derived value as its own fill.
    expect(axisFills.find((f) => f.axis === "remapPosture")).toBeUndefined();

    const rec = selectStrategy(axes);
    expect(rec.triggeredRule).toBe(8);
    expect(rec.primary).toBe("S-06");
    expect(rec.secondaries).toEqual(["S-04", "S-08"]);
  });

  it("without the derived value the prior fills addition and rule 8 does not fire", () => {
    const { axes, axisFills } = defaultFillAxes({ ...partial });
    expect(axes.remapPosture).toBe("addition");
    expect(axisFills).toContainEqual({
      axis: "remapPosture",
      value: "addition",
      source: "script-class-prior",
    });
    const rec = selectStrategy(axes);
    expect(rec.triggeredRule).not.toBe(8);
  });

  it("an author-recorded addition answer merged over the derived baseline re-routes away from rule 8", () => {
    // Tier 1 (recorded station answer on a phase result) beats tier 2
    // (the IR-derived baseline on irAxes) in mergePhaseResults — the
    // precedence the characters-step confirmation records through.
    const session = mergePhaseResults({ remapPosture: "full-remap" }, [
      { phase: "B", answers: [], computedAxes: { remapPosture: "addition" } },
    ]);
    const { axes } = defaultFillAxes({ ...partial, ...session.axes });
    expect(axes.remapPosture).toBe("addition");
    const rec = selectStrategy(axes);
    expect(rec.triggeredRule).not.toBe(8);
  });
});
