import { describe, it, expect } from "vitest";
import { checkInventoryCoverage } from "./check-18-6-inventory-coverage.js";
import type { KeyboardIR, LinguistInventory, IRGroup, IRStore } from "@keyboard-studio/contracts";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";

const KMN_PATH = "source/test.kmn";

function makeScaffoldedIR(groups: IRGroup[], stores: IRStore[] = []): KeyboardIR {
  return makeTestIR(groups, stores, [], { origin: "scaffolded" });
}

function makeInventory(chars: string[]): LinguistInventory {
  return {
    language: "test",
    script: "Latin",
    alphabetCore: { lowercase: chars, uppercase: [] },
    mandatoryDiacriticsAndLigatures: [],
    languageSpecificPunctuation: [],
    numerals: [],
  };
}

describe("checkInventoryCoverage (18.6 KM_LINT_INVENTORY_UNCOVERED)", () => {
  it("passes when all inventory chars are covered by char output rules", () => {
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value: "a" }],
          },
          {
            nodeId: "r2",
            context: [],
            output: [{ kind: "char", value: "b" }],
          },
        ],
      },
    ]);
    const inv = makeInventory(["a", "b"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("passes when all inventory chars are covered via outs() store expansion", () => {
    const ir = makeScaffoldedIR(
      [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r1",
              context: [],
              output: [{ kind: "outs", storeRef: "vowels" }],
            },
          ],
        },
      ],
      [
        {
          nodeId: "s1",
          name: "vowels",
          isSystem: false,
          items: [
            { kind: "char", value: "a" },
            { kind: "char", value: "e" },
          ],
        },
      ]
    );
    const inv = makeInventory(["a", "e"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("returns [] for imported keyboards (scope guard)", () => {
    const ir = makeScaffoldedIR([]);
    ir.origin = "imported";
    const inv = makeInventory(["a"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("returns [] when raw fragments are present (scope guard)", () => {
    const ir = makeScaffoldedIR([]);
    ir.raw = [
      { nodeId: "raw1", origin: "imported", sourceText: "c('a')", reason: "outs()" },
    ];
    const inv = makeInventory(["a"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("warns for each inventory char not covered", () => {
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value: "a" }],
          },
        ],
      },
    ]);
    const inv = makeInventory(["a", "b", "c"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings).toHaveLength(2);
    const codes = findings.map((f) => f.code);
    expect(codes).toEqual(["KM_LINT_INVENTORY_UNCOVERED", "KM_LINT_INVENTORY_UNCOVERED"]);
    expect(findings[0]?.severity).toBe("warning");
    expect(findings[0]?.layer).toBe("C");
  });

  it("includes the missing char in the message", () => {
    const ir = makeScaffoldedIR([]);
    const inv = makeInventory(["z"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("z");
  });

  it("hint mentions static analysis limitation", () => {
    const ir = makeScaffoldedIR([]);
    const inv = makeInventory(["z"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings[0]?.hint).toContain("static analysis");
  });

  it("sets location.file to the kmn path", () => {
    const ir = makeScaffoldedIR([]);
    const inv = makeInventory(["z"]);
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings[0]?.location?.file).toBe(KMN_PATH);
  });

  it("passes when keyboard emits base+combining separately and inventory holds the NFC-precomposed form", () => {
    // Inventory: U+00E0 "a with grave" (NFC-precomposed, a single codepoint).
    // Keyboard: emits U+0061 "a" followed by U+0300 "combining grave accent" as two
    // consecutive char elements (NFD/decomposed style, common in S-06/S-07 deadkey layouts).
    // After NFC-normalization of the run ["a", "̀"], the result is "à" which
    // must be present in the emittable set — no false positive.
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [
              { kind: "char", value: "a" },          // U+0061
              { kind: "char", value: "̀" },      // combining grave
            ],
          },
        ],
      },
    ]);
    const inv = makeInventory(["à"]); // a-grave precomposed
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("passes when a standalone combining mark is in the inventory and emitted directly", () => {
    // A standalone combining diacritic in the inventory (e.g. dead key output).
    // The raw char is added verbatim so it is found in the emittable set.
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [{ kind: "char", value: "̀" }], // standalone combining grave
          },
        ],
      },
    ]);
    const inv = makeInventory(["̀"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });

  it("warns when base+combining run normalizes to a different precomposed char than what is in the inventory", () => {
    // Keyboard emits "a" + combining acute (U+0301) → NFC is U+00E1 "a with acute".
    // Inventory has U+00E0 "a with grave". These are different NFC codepoints.
    const ir = makeScaffoldedIR([
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: [
          {
            nodeId: "r1",
            context: [],
            output: [
              { kind: "char", value: "a" },
              { kind: "char", value: "́" }, // combining acute
            ],
          },
        ],
      },
    ]);
    const inv = makeInventory(["à"]); // a-grave; not covered by a+acute
    const findings = checkInventoryCoverage(ir, inv, KMN_PATH);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_INVENTORY_UNCOVERED");
  });

  it("passes when outs() store items cover the NFC-precomposed inventory char", () => {
    // Store contains the NFC form directly; NFC-normalization of item.value is a no-op
    // but the code path through outs/index must still add the char.
    const ir = makeScaffoldedIR(
      [
        {
          nodeId: "g1",
          name: "main",
          usingKeys: true,
          readonly: false,
          rules: [
            {
              nodeId: "r1",
              context: [],
              output: [{ kind: "outs", storeRef: "accented" }],
            },
          ],
        },
      ],
      [
        {
          nodeId: "s1",
          name: "accented",
          isSystem: false,
          items: [{ kind: "char", value: "à" }], // a-grave NFC
        },
      ]
    );
    const inv = makeInventory(["à"]);
    expect(checkInventoryCoverage(ir, inv, KMN_PATH)).toEqual([]);
  });
});
