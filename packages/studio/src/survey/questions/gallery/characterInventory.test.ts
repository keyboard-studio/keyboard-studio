// characterInventory module tests (spec 090 T028): the module contract,
// the no-op apply, and the folded-in extract probe (the retired
// pb_character_inventory spike's produced-set seed). The hosted step flow
// end to end is covered by survey/CharactersStep.test.tsx and
// survey/phaseBDraftOps.test.ts (the draft ops over this value).

import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import characterInventory, { extractCharacterInventory } from "./characterInventory.ts";
import { CharactersStep } from "../../CharactersStep.tsx";
import { emptyCharacterInventoryValue } from "../../phaseBDraftOps.ts";

const CTX = { ir: null, writes: [], decisions: {}, currentHistoryEntryState: null } as const;

describe("characterInventory module contract", () => {
  it("provides character-inventory, requires the step's declared three, writes nothing", () => {
    expect(characterInventory.provides).toEqual(["character-inventory"]);
    // Pinned EQUAL to steps/stepDependencies.ts by the FR-002 coverage
    // test (the 091 parity) — see the module's own comment.
    expect(characterInventory.requires).toEqual([
      "target-script",
      "authoring-track",
      "project-keyboard-id",
    ]);
    expect(characterInventory.writes).toEqual([]);
    expect(characterInventory.renderer).toBe(CharactersStep);
  });

  it("apply is a deterministic no-op (the value is recorded by the host; nothing is applied to the IR)", () => {
    const value = { ...emptyCharacterInventoryValue(), chars: ["a", "ɛ"] };
    expect(characterInventory.apply(value, CTX)).toEqual({});
    expect(characterInventory.apply(value, CTX)).toEqual(characterInventory.apply(value, CTX));
    expect(characterInventory.apply(undefined, CTX)).toEqual({});
  });
});

describe("characterInventory extract (starting-point probe)", () => {
  it("is undefined without an IR and for an IR that produces nothing", () => {
    expect(extractCharacterInventory({ ir: null, catalog: null })).toBeUndefined();
    expect(extractCharacterInventory({ ir: makeTestIR([]), catalog: null })).toBeUndefined();
  });

  it("seeds the produced set with base provenance, deterministically", () => {
    const ir = makeTestIR([
      {
        nodeId: "g-main",
        name: "main",
        usingKeys: true,
        rules: [
          {
            nodeId: "r1",
            context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
            output: [{ kind: "char", value: "a" }],
          },
          {
            nodeId: "r2",
            context: [{ kind: "vkey", name: "K_E", modifiers: [] }],
            output: [{ kind: "char", value: "ɛ" }],
          },
        ],
      },
    ]);
    const seed = extractCharacterInventory({ ir, catalog: null });
    expect(seed?.chars).toEqual(["a", "ɛ"]);
    expect(seed?.provenance).toEqual({ a: "base", ɛ: "base" });
    // Determinism: the same IR extracts the identical seed value.
    expect(extractCharacterInventory({ ir, catalog: null })).toEqual(seed);
  });
});
