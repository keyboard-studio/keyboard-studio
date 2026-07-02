// Tests for base-derived A3a detection on the Track 2 import path — the
// deferred production-reachability half of rule 3a.
//
// Two groups:
//   1. detectMarkInputOrderFromImport() unit shape tests, against hand-built
//      IR fixtures (mirrors s02-deadkey-single-tap.test.ts's fixture style).
//   2. An end-to-end lock: parse() a trimmed sil_ipa-shaped .kmn fixture
//      (the §7.5 IPA exemplar's real rule shape: `any(base) + "trigger" >
//      index(marked, 2)`), thread the detected AxisFill into defaultFillAxes
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
  it("detects the postfix shape [any(base), char] > index(marked, 2)", () => {
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
          output: [{ kind: "index", storeRef: "equalU", offset: 2 }],
        },
      ],
    };
    const stores: IRStore[] = [
      makeCharStore("store#equalD", "equalD", "aeiou"),
      makeCharStore("store#equalU", "equalU", "áéíóú"),
    ];
    const ir = makeTestIR([mainGroup], stores);

    const fill = detectMarkInputOrderFromImport(ir);
    expect(fill).toEqual({ axis: "markInputOrder", value: "postfix", source: "import-derived" });
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

  it("returns undefined for an IR with no rules", () => {
    const ir: KeyboardIR = makeTestIR([]);
    expect(detectMarkInputOrderFromImport(ir)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Group 2 — end-to-end: parse -> detect -> defaultFillAxes -> selectStrategy
// ---------------------------------------------------------------------------

// Trimmed from release/sil/sil_ipa/source/sil_ipa.kmn — the real §7.5 IPA
// exemplar's postfix diacritic rules, e.g. `any(equalD) + "=" > index(equalU,2)`.
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

any(equalD) + "=" > index(equalU,2)
`;

describe("import-path rule 3a reachability (end-to-end)", () => {
  it("an IPA-shaped imported base's detected postfix fill survives defaultFillAxes and routes rule 3a -> S-03 (+S-04)", () => {
    const { ir } = parse(SIL_IPA_SHAPED_KMN, "ipa-shaped-test");

    const importFill = detectMarkInputOrderFromImport(ir);
    expect(importFill).toEqual({ axis: "markInputOrder", value: "postfix", source: "import-derived" });

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
