import { describe, it, expect } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { IRStore, KeyboardIR } from "@keyboard-studio/contracts";
import { checkCasedKeysDeclared } from "./check-cased-keys.js";

function ir(outputs: string[], systemStores: Record<string, string> = {}): KeyboardIR {
  const stores: IRStore[] = Object.entries(systemStores).map(([name, text]) => ({
    nodeId: `store:${name}`,
    name,
    isSystem: true,
    items: [{ kind: "raw", text }],
  }));
  return makeTestIR({
    header: { keyboardId: "demo" },
    stores,
    groups: [
      {
        nodeId: "g1",
        name: "main",
        usingKeys: true,
        readonly: false,
        rules: outputs.map((value, i) => ({
          nodeId: `r${i}`,
          context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
          output: [{ kind: "char", value }],
        })),
      },
    ],
  });
}

describe("checkCasedKeysDeclared (7.28)", () => {
  it("flags a cased-script keyboard without &CasedKeys", () => {
    const { findings } = checkCasedKeysDeclared(ir(["a", "1"]), "demo");
    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_CASEDKEYS_MISSING");
    expect(findings[0]!.location.file).toBe("source/demo.kmn");
  });

  it("passes when &CasedKeys is declared", () => {
    const k = ir(["a"], { CasedKeys: "[K_A] .. [K_Z]" });
    expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
  });

  it("passes an uncased script", () => {
    expect(checkCasedKeysDeclared(ir(["क", "अ"]), "demo").findings).toEqual([]);
  });

  it("exempts mnemonic layouts", () => {
    const k = ir(["a"], { MNEMONICLAYOUT: "'1'" });
    expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
  });

  describe("declared store that misses keys", () => {
    type Spec = [string, string[], string];
    function keyed(specs: Spec[], systemStores: Record<string, string> = {}): KeyboardIR {
      // Each bracketed token becomes its own raw item, as the codec emits them.
      const stores: IRStore[] = Object.entries(systemStores).map(([name, text]) => ({
        nodeId: `store:${name}`,
        name,
        isSystem: true,
        items: text.split(/\s+(?=\[|\.\.)/).map((t) => ({ kind: "raw" as const, text: t })),
      }));
      return makeTestIR({
        header: { keyboardId: "demo" },
        stores,
        groups: [
          {
            nodeId: "g1",
            name: "main",
            usingKeys: true,
            readonly: false,
            rules: specs.map(([vkey, modifiers, value], i) => ({
              nodeId: `r${i}`,
              context: [{ kind: "vkey", name: vkey, modifiers }],
              output: [{ kind: "char", value }],
            })),
          },
        ],
      });
    }
    const AZ = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i));
    const azSpecs = (skip: string[] = []): Spec[] =>
      AZ.filter((c) => !skip.includes(c)).flatMap((c): Spec[] => [
        [`K_${c.toUpperCase()}`, [], c],
        [`K_${c.toUpperCase()}`, ["SHIFT"], c.toUpperCase()],
      ]);
    const AZ_STORE = { CasedKeys: "[K_A] .. [K_Z]" };

    it("fails a declared A-Z store naming K_LBRKT and the RAlt K_N pair", () => {
      const k = keyed(
        [
          ...azSpecs(),
          ["K_LBRKT", [], "ŋ"],
          ["K_LBRKT", ["SHIFT"], "Ŋ"],
          ["K_N", ["RALT"], "ŋ"],
          ["K_N", ["SHIFT", "RALT"], "Ŋ"],
        ],
        AZ_STORE,
      );
      const { findings } = checkCasedKeysDeclared(k, "demo");
      expect(findings).toHaveLength(1);
      expect(findings[0]!.code).toBe("KM_LINT_CASEDKEYS_MISSING");
      expect(findings[0]!.message).toContain("K_LBRKT");
      expect(findings[0]!.message).toContain("ŋ/Ŋ");
    });

    it("passes when the declared store covers every key with a pair", () => {
      const k = keyed(
        [...azSpecs(), ["K_LBRKT", [], "ŋ"], ["K_LBRKT", ["SHIFT"], "Ŋ"]],
        { CasedKeys: "[K_A] .. [K_Z] [K_LBRKT]" },
      );
      expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
    });

    it("lists a conflicting key as information without demanding it", () => {
      const k = keyed(
        [
          ...azSpecs(),
          ["K_E", ["RALT"], "€"],
          ["K_E", ["SHIFT", "RALT"], "£"],
          ["K_LBRKT", [], "ŋ"],
          ["K_LBRKT", ["SHIFT"], "Ŋ"],
        ],
        AZ_STORE,
      );
      const { findings } = checkCasedKeysDeclared(k, "demo");
      expect(findings).toHaveLength(1);
      expect(findings[0]!.message).toContain("K_LBRKT");
      expect(findings[0]!.message).toContain("K_E");
      // K_E is information, not a missing key: a store that adds only K_LBRKT passes.
      const ok = keyed(
        [
          ...azSpecs(),
          ["K_E", ["RALT"], "€"],
          ["K_E", ["SHIFT", "RALT"], "£"],
          ["K_LBRKT", [], "ŋ"],
          ["K_LBRKT", ["SHIFT"], "Ŋ"],
        ],
        { CasedKeys: "[K_A] .. [K_Z] [K_LBRKT]" },
      );
      expect(checkCasedKeysDeclared(ok, "demo").findings).toEqual([]);
    });

    it("judges Turkish pairs with a tr language", () => {
      const k = keyed(
        [
          ["K_I", [], "i"],
          ["K_I", ["SHIFT"], "İ"],
          ["K_A", [], "a"],
          ["K_A", ["SHIFT"], "A"],
        ],
        { CasedKeys: "[K_A]" },
      );
      const tr = checkCasedKeysDeclared(k, "demo", "tr");
      expect(tr.findings).toHaveLength(1);
      expect(tr.findings[0]!.message).toContain("K_I");
      // Without the language, i / dotted capital I is not a case pair.
      expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
    });

    it("passes mixed: a mnemonic keyboard is exempt even with cased output", () => {
      const k = keyed([...azSpecs()], { MNEMONICLAYOUT: "'1'" });
      expect(checkCasedKeysDeclared(k, "demo").findings).toEqual([]);
    });
  });
});
