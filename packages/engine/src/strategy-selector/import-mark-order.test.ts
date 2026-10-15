// Tests for base-derived A3a detection on the Track 2 import path — the
// deferred production-reachability half of rule 3a.
//
// Two groups:
//   1. detectMarkInputOrderFromImport() unit shape tests, against hand-built
//      IR fixtures (mirrors recognizer/rules/__fixtures__/recognizerIr.ts's fixture style).
//   2. An end-to-end lock: parse() a trimmed sil_ipa-shaped .kmn fixture
//      (the §7.5 IPA exemplar's real guard-free rule shape: `any(base) +
//      "trigger" > index(marked, 1)`), thread the detected AxisFill into defaultFillAxes
//      + selectStrategy, and confirm rule 3a fires -> S-03 (+S-04). This is
//      the acceptance criterion "an IPA-shaped imported base routes
//      end-to-end through rule 3a to S-03+S-04."

import { describe, it, expect } from "vitest";
import { detectMarkInputOrderFromImport } from "./import-mark-order.js";
import { defaultFillAxes } from "./default-fill.js";
import { selectStrategy } from "./index.js";
import { parse } from "../codec/parse.js";
import type { IRGroup, IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Group 1 — detectMarkInputOrderFromImport() unit shape tests
// ---------------------------------------------------------------------------

describe("detectMarkInputOrderFromImport", () => {
  it("detects the postfix shape [any(base), char] > index(marked, 1)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#acute",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#equalD", "equalD", "aeiou"),
      makeCharStore("store#equalU", "equalU", "áéíóú"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    const fill = detectMarkInputOrderFromImport(ir);
    expect(fill).toEqual({
      axis: "markInputOrder",
      value: "postfix",
      source: "import-derived",
    });
  });

  it("detects the postfix shape when the marked store is precomposed letters with no decomposition (name-extension pairs)", () => {
    // The sil_ipa exemplar's marked letters (U+0253/U+0257/U+0260) have no
    // decomposition mapping, so NFD alone cannot relate them to b/d/g; their
    // Unicode names extend the base names ("… B" -> "… B WITH HOOK").
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#hook",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#equalD", "equalD", "bdg"),
      makeCharStore("store#equalU", "equalU", "ɓɗɠ"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toEqual({
      axis: "markInputOrder",
      value: "postfix",
      source: "import-derived",
    });
  });

  it("detects a marked entry held as one multi-codepoint item (base + combining mark in a single item)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#acute-decomposed",
          context: [
            { kind: "any", storeRef: "baseD" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "baseU", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#baseD", "baseD", "a"),
      {
        nodeId: "store#baseU",
        name: "baseU",
        items: [{ kind: "char", value: "a\u0301" }],
        isSystem: false,
      },
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toEqual({
      axis: "markInputOrder",
      value: "postfix",
      source: "import-derived",
    });
  });

  it("does NOT match a non-diacritic parallel-store remap (unrelated stores, base abc -> output xyz)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#remap",
          context: [
            { kind: "any", storeRef: "inStore" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "outStore", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#inStore", "inStore", "abc"),
      makeCharStore("store#outStore", "outStore", "xyz"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match when only some paired entries are related (every pair must be related)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#partial",
          context: [
            { kind: "any", storeRef: "inStore" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "outStore", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#inStore", "inStore", "ab"),
      makeCharStore("store#outStore", "outStore", "áx"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match when either referenced store is missing from ir.stores (absence is not evidence)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#unresolved",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
        },
      ],
    };
    // Only the input store resolves; the output store is absent.
    const stores: IRStore[] = [
      makeCharStore("store#equalD", "equalD", "aeiou"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match when the any() and index() refs name the same store (stores must be distinct)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#self-remap",
          context: [
            { kind: "any", storeRef: "sameStore" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "sameStore", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#sameStore", "sameStore", "aeiou"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match when the parallel stores have unequal length", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#unequal",
          context: [
            { kind: "any", storeRef: "inStore" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "outStore", offset: 1 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#inStore", "inStore", "ae"),
      makeCharStore("store#outStore", "outStore", "áéí"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match a deadkey-based rule (S-02 body shape: [dk(D), any(BASE)] > index(OUT,2))", () => {
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [
        {
          nodeId: "rule#body",
          context: [
            { kind: "deadkey", id: 0x0060 },
            { kind: "any", storeRef: "dkf0060" },
          ],
          output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
        },
      ],
    };
    const ir = makeTestIR([deadkeysGroup]);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match the mirror-image prefix shape [char, any(base)] > index(marked, 2)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#prefix-acute",
          context: [
            { kind: "char", value: "'" },
            { kind: "any", storeRef: "baseD" },
          ],
          output: [{ kind: "index", storeRef: "baseU", offset: 2 }],
        },
      ],
    };
    const ir = makeTestIR([mainGroup]);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match a leading-any() rule with the wrong (terminal-any) offset [any(base), char] > index(marked, 2)", () => {
    // Regression: a guard-free postfix rule's index() offset must point at the
    // *leading* any() (position 1). Offset 2 is the S-02 *terminal*-any shape
    // and cannot occur guard-free in real Keyman — the earlier code accepted it
    // (out.offset === real.length), so the detector fired on a fabricated shape
    // and missed every real offset-1 rule. This locks offset===1.
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#bad-offset",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "index", storeRef: "equalU", offset: 2 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#equalD", "equalD", "aeiou"),
      makeCharStore("store#equalU", "equalU", "áéíóú"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT see an if()-guarded postfix rule (opaque at parse time — documented scope boundary)", () => {
    // The live sil_ipa postfix rules are all if(option_key=…)-guarded; the codec
    // classifies any if(...) context as opaque (IF_OPTION_STORE), so the rule
    // becomes a RawKmnFragment and never reaches group.rules. Detection of the
    // guarded shape is deferred until the codec's if()-handling is scoped
    // separately — this test locks that boundary so a future codec change that
    // surfaces guarded rules structurally is a deliberate, visible decision.
    const guardedKmn = `c if()-guarded postfix fixture (offset 2, guard at position 1)
store(&VERSION) '10.0'
store(&NAME) 'guarded IPA-shaped test keyboard'
store(&TARGETS) 'any'

store(equalD) "b" "d" "g"
store(equalU) U+0253 U+0257 U+0260

begin Unicode > use(Unicode)

group(Unicode) using keys

if(option_key = '') any(equalD) + "=" > index(equalU,2)
`;
    const { ir } = parse(guardedKmn, "guarded-ipa-shaped-test");
    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match a rule whose context has other than exactly two structural elements (real.length !== 2)", () => {
    // Three structural context elements (not the leading-any()+trigger pair) —
    // the shape guard rejects before it ever inspects base/trigger kinds.
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#too-many-elements",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
            { kind: "char", value: "y" },
          ],
          output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
        },
      ],
    };
    const ir = makeTestIR([mainGroup]);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match a rule whose trailing context element is not a char() trigger (e.g. two any()s)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#not-char-trigger",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "any", storeRef: "otherStore" },
          ],
          output: [{ kind: "index", storeRef: "equalU", offset: 1 }],
        },
      ],
    };
    const ir = makeTestIR([mainGroup]);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match a rule whose output has other than exactly one element (output.length !== 1)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#multi-output",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
          ],
          output: [
            { kind: "index", storeRef: "equalU", offset: 1 },
            { kind: "char", value: "x" },
          ],
        },
      ],
    };
    const ir = makeTestIR([mainGroup]);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("does NOT match a rule whose single output element is not index() (e.g. a literal char output)", () => {
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [
        {
          nodeId: "rule#char-output",
          context: [
            { kind: "any", storeRef: "equalD" },
            { kind: "char", value: "=" },
          ],
          output: [{ kind: "char", value: "x" }],
        },
      ],
    };
    const ir = makeTestIR([mainGroup]);

    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });

  it("returns undefined for an IR with no rules", () => {
    const ir: KeyboardIR = makeTestIR([]);
    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group 2 — end-to-end: parse -> detect -> defaultFillAxes -> selectStrategy
// ---------------------------------------------------------------------------

// Trimmed from release/sil/sil_ipa/source/sil_ipa.kmn — the real §7.5 IPA
// exemplar's guard-free postfix diacritic shape, e.g.
// `any(equalD) + "=" > index(equalU,1)` (the leading-any() offset is 1; the
// live sil_ipa rules use this shape but are if()-guarded, hence opaque — see
// import-mark-order.ts module header).
const SIL_IPA_SHAPED_KMN = `c trimmed sil_ipa-shaped fixture (spec §7.5 IPA exemplar)
store(&VERSION) '10.0'
store(&NAME) 'IPA-shaped test keyboard'
store(&TARGETS) 'any'
store(&COPYRIGHT) '(c) SIL Global'
store(&KEYBOARDVERSION) '1.0'

store(equalD) "b" "d" "g"
store(equalU) U+0253 U+0257 U+0260

begin Unicode > use(Unicode)

group(Unicode) using keys

any(equalD) + "=" > index(equalU,1)
`;

describe("import-path rule 3a reachability (end-to-end)", () => {
  it("an IPA-shaped imported base's detected postfix fill survives defaultFillAxes and routes rule 3a -> S-03 (+S-04)", () => {
    const { ir } = parse(SIL_IPA_SHAPED_KMN, "ipa-shaped-test");

    const importFill = detectMarkInputOrderFromImport(ir);
    expect(importFill).toEqual({
      axis: "markInputOrder",
      value: "postfix",
      source: "import-derived",
    });

    // Simulate the survey's partially-elicited vector, seeded with the
    // import-derived value the way MechanismGallery seeds `axes` before
    // calling defaultFillAxes (spec §7.2) — the prior must never override it.
    const partial = {
      scale: "medium" as const,
      scriptClass: "alphabetic" as const,
      phoneticIntuition: "strong" as const,
      markInputOrder: importFill?.value as "postfix",
    };

    const { axes, axisFills } = defaultFillAxes(partial);
    expect(axes.markInputOrder).toBe("postfix");
    // The script-class prior must not re-fill (and cannot overwrite) an
    // already-present markInputOrder — no axisFills entry for it here.
    expect(axisFills.some((f) => f.axis === "markInputOrder")).toBe(false);

    const result = selectStrategy(axes);
    expect(result.triggeredRule).toBe("3a");
    expect(result.primary).toBe("S-03");
    expect(result.secondaries).toContain("S-04");
  });
});
