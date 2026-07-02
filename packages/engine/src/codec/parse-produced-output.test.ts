import { describe, it, expect } from "vitest";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { parse } from "./parse.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

// Covers the RawKmnFragment.producedOutput sketch: the lenient output-side
// extraction attached to rule-opaque fragments so buildProducedSet can count
// characters produced only by opaque rules (e.g. if()-guarded ones).

function parseKmn(rules: string, stores = "") {
  const kmn = `store(&VERSION) '10.0'
store(&NAME) 'Produced Output Test'
${stores}
begin Unicode > use(main)

group(main) using keys

${rules}
`;
  return parse(kmn, "produced-output-test");
}

const CREE_STORES = `store(C_ef) U+1401 U+1403 U+1405
store(C_efc) U+140C U+140E U+1410
`;

describe("parse — producedOutput sketch on rule-opaque fragments", () => {
  it("if()-guarded rule with index() RHS: sketch holds the store ref, never guard-side content (bj_cree_woods shape)", () => {
    const { ir } = parseKmn(
      `if(option_key = '') U+1427 any(C_ef) > index(C_efc,3)`,
      CREE_STORES,
    );
    expect(ir.raw).toHaveLength(1);
    const frag = ir.raw[0]!;
    expect(frag.reason).toBe(OPAQUE_REASONS.IF_OPTION_STORE);
    expect(frag.producedOutput).toEqual([
      { kind: "index", storeRef: "C_efc", offset: 3 },
    ]);
  });

  it("guard literal must not leak: if(opt = 'Z') rule sketch contains only the RHS char", () => {
    const { ir } = parseKmn(`if(opt = 'Z') + [K_A] > U+1401`);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.producedOutput).toEqual([
      { kind: "char", value: "ᐁ" },
    ]);
  });

  it("SMP literal RHS decodes to a single astral char element", () => {
    const { ir } = parseKmn(`+ [K_D] > U+1F600`);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.reason).toBe(OPAQUE_REASONS.SMP_LITERAL);
    expect(ir.raw[0]!.producedOutput).toEqual([
      { kind: "char", value: "\u{1F600}" },
    ]);
  });

  it("quoted-string RHS expands per character", () => {
    const { ir } = parseKmn(`if(opt = '1') + [K_A] > 'abc'`);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.producedOutput).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "b" },
      { kind: "char", value: "c" },
    ]);
  });

  it("set() RHS carries no producible content: no producedOutput, quoted value stays inside the token", () => {
    const { ir } = parseKmn(`+ [K_B] > set(opt='x')`);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.reason).toBe(OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
    expect(ir.raw[0]!.producedOutput).toBeUndefined();
  });

  it("nul RHS carries no producible content: no producedOutput", () => {
    const { ir } = parseKmn(`if(opt = '1') + [K_E] > nul`);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.producedOutput).toBeUndefined();
  });

  it("outs() RHS becomes a typed outs element in the sketch", () => {
    const { ir } = parseKmn(
      `+ [K_C] > outs(otherStore)`,
      `store(otherStore) U+0061 U+0062
`,
    );
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.reason).toBe(OPAQUE_REASONS.OUTS_EXPANSION);
    expect(ir.raw[0]!.producedOutput).toEqual([
      { kind: "outs", storeRef: "otherStore" },
    ]);
  });

  it("extraction runs over the joined logical line when the RHS spans a continuation", () => {
    const { ir } = parseKmn(
      `if(opt = '1') + [K_F] > U+1401 \\
U+1402`,
    );
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.producedOutput).toEqual([
      { kind: "char", value: "ᐁ" },
      { kind: "char", value: "ᐂ" },
    ]);
  });

  it("store-opaque fragments get no producedOutput (rule fragments only)", () => {
    const { ir } = parseKmn(
      `+ [K_A] > U+0061`,
      `store(smp) U+10D24
`,
    );
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]!.producedOutput).toBeUndefined();
  });

  it("end-to-end: buildProducedSet counts a char produced only via an opaque if() rule's index()", () => {
    const { ir } = parseKmn(
      `if(option_key = '') U+1427 any(C_ef) > index(C_efc,3)`,
      CREE_STORES,
    );
    const produced = buildProducedSet(ir);
    expect(produced.has("ᐌ")).toBe(true);
    expect(produced.has("ᐎ")).toBe(true);
    expect(produced.has("ᐐ")).toBe(true);
    // Guard-side content must not be counted as produced.
    expect(produced.has("ᐧ")).toBe(false);
  });
});
