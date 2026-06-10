import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

// KMN with opaque constructs:
//   1. save(myFlag, 1)     -> option-store-directive
//   2. outs(otherStore)    -> outs-expansion
//   3. context(2)          -> indexed-context
//   4. U+1F600            -> smp-literal
const OPAQUE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Opaque Test'
store(myFlag) 'x'
store(otherStore) U+0061 U+0062

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
+ [K_B] > save(myFlag, 1)
+ [K_C] > outs(otherStore)
dk(0001) context(2) > U+0061
+ [K_D] > U+1F600
`;

describe("parse opaque features", () => {
  it("produces RawKmnFragment for save() rule", () => {
    const { ir, opaqueFeatures } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
  });

  it("produces RawKmnFragment for outs() rule", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.OUTS_EXPANSION);
  });

  it("produces RawKmnFragment for indexed context(2) rule", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.INDEXED_CONTEXT);
  });

  it("produces RawKmnFragment for SMP literal U+1F600", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.SMP_LITERAL);
  });

  it("preserves sourceText verbatim in RawKmnFragment", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const saveFragment = ir.raw.find(r => r.reason === OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
    expect(saveFragment?.sourceText).toContain("save(myFlag");
  });

  it("all RawKmnFragments have origin: imported", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    for (const frag of ir.raw) {
      expect(frag.origin).toBe("imported");
    }
  });

  it("opaqueFeatures inventory reflects the counts", () => {
    const { opaqueFeatures } = parse(OPAQUE_KMN, "opaque-test");
    // At least the 4 opaque reasons should appear
    const features = opaqueFeatures.map(f => f.feature);
    expect(features).toContain(OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
    expect(features).toContain(OPAQUE_REASONS.OUTS_EXPANSION);
    expect(features).toContain(OPAQUE_REASONS.INDEXED_CONTEXT);
    expect(features).toContain(OPAQUE_REASONS.SMP_LITERAL);
  });

  it("non-opaque rules are NOT in raw fragments", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    // K_A -> U+0061 is clean; should be in group rules
    const mainGroup = ir.groups.find(g => g.name === "main");
    const cleanRule = mainGroup?.rules.find(r =>
      r.context.some(c => c.kind === "vkey" && c.name === "K_A")
    );
    expect(cleanRule).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// P0-A: Named deadkey identifiers
// ---------------------------------------------------------------------------

describe("parse opaque — named deadkey (P0-A)", () => {
  const NAMED_DK_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Named DK Test'

begin Unicode > use(main)

group(main) using keys

+ '\`' > dk(grave)
`;

  it("produces RawKmnFragment with reason named-deadkey for dk(grave)", () => {
    const { ir } = parse(NAMED_DK_KMN, "named-dk-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.NAMED_DEADKEY);
  });

  it("named-deadkey fragment preserves the source line", () => {
    const { ir } = parse(NAMED_DK_KMN, "named-dk-test");
    const frag = ir.raw.find(r => r.reason === OPAQUE_REASONS.NAMED_DEADKEY);
    expect(frag?.sourceText).toContain("dk(grave)");
  });
});

// ---------------------------------------------------------------------------
// P1-D: System store with SMP content becomes RawKmnFragment
// ---------------------------------------------------------------------------

describe("parse opaque — SMP in system store (P1-D)", () => {
  const SMP_SYS_STORE_KMN = `store(&VERSION) '10.0'
store(&NAME) U+1F600

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
`;

  it("produces RawKmnFragment (not a corrupted system store) for store(&NAME) U+1F600", () => {
    const { ir } = parse(SMP_SYS_STORE_KMN, "smp-sys-store-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.SMP_LITERAL);
  });
});

// ---------------------------------------------------------------------------
// P1-G: IF_OPTION_STORE and CALL_RETURN coverage
// ---------------------------------------------------------------------------

describe("parse opaque — if-option-store (P1-G)", () => {
  const IF_KMN = `store(&VERSION) '10.0'
store(&NAME) 'If Test'

begin Unicode > use(main)

group(main) using keys

if(myFlag = 'a') + [K_A] > use(g)
`;

  it("produces RawKmnFragment with reason if-option-store", () => {
    const { ir } = parse(IF_KMN, "if-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.IF_OPTION_STORE);
  });
});

describe("parse opaque — call-return (P1-G)", () => {
  const CALL_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Call Test'

begin Unicode > use(main)

group(main) using keys

+ [K_A] > call(myCallback)
`;

  const RETURN_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Return Test'

begin Unicode > use(main)

group(main) using keys

+ [K_B] > return
`;

  it("produces RawKmnFragment with reason call-return for call()", () => {
    const { ir } = parse(CALL_KMN, "call-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.CALL_RETURN);
  });

  it("produces RawKmnFragment with reason call-return for return keyword", () => {
    const { ir } = parse(RETURN_KMN, "return-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.CALL_RETURN);
  });
});
