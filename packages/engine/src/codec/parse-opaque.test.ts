import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

// KMN with opaque constructs:
//   1. save(myFlag, 1)     -> option-store-directive
//   2. outs(otherStore)    -> outs-expansion
//   3. context(0)          -> indexed-context (degenerate offset; FR-004 types
//                              context(N) with N > 1 in context position)
//   4. U+1F600            -> typed char (spec 116: the Keyman lexer reads SMP
//                              literals as characters; smp-literal is no longer
//                              produced and stays defined for persisted drafts)
const OPAQUE_KMN = `store(&VERSION) '10.0'
store(&NAME) 'Opaque Test'
store(myFlag) 'x'
store(otherStore) U+0061 U+0062

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
+ [K_B] > save(myFlag, 1)
+ [K_C] > outs(otherStore)
dk(0001) context(0) > U+0061
+ [K_D] > U+1F600
`;

describe("parse opaque features", () => {
  it("produces RawKmnFragment for save() rule", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
  });

  it("produces RawKmnFragment for outs() rule", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.OUTS_EXPANSION);
  });

  it("produces RawKmnFragment for degenerate context(0) rule", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.INDEXED_CONTEXT);
  });

  // DELIBERATE FLIP (spec 116, allow-list class smp-literal-typed): the
  // legacy reader opaqued SMP literals as smp-literal; the Keyman lexer reads
  // U+1F600 as a character, so the rule is typed and no fragment exists.
  it("types an SMP literal U+1F600 as a char — no smp-literal fragment (spec 116 flip)", () => {
    const { ir } = parse(OPAQUE_KMN, "opaque-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).not.toContain(OPAQUE_REASONS.SMP_LITERAL);
    const main = ir.groups.find(g => g.name === "main");
    const rule = main?.rules.find(r => r.context.some(c => c.kind === "vkey" && c.name === "K_D"));
    expect(rule?.output).toEqual([{ kind: "char", value: "\u{1F600}" }]);
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
    // The 3 opaque reasons should appear (the SMP literal is typed, spec 116)
    const features = opaqueFeatures.map(f => f.feature);
    expect(features).toContain(OPAQUE_REASONS.OPTION_STORE_DIRECTIVE);
    expect(features).toContain(OPAQUE_REASONS.OUTS_EXPANSION);
    expect(features).toContain(OPAQUE_REASONS.INDEXED_CONTEXT);
    expect(features).not.toContain(OPAQUE_REASONS.SMP_LITERAL);
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

  // DELIBERATE FLIP (#2238, constraint 7 of the #2232 ruling): pre-#2238
  // these two tests pinned dk(grave) as a RawKmnFragment with reason
  // named-deadkey. The codec now types named deadkeys, so the rule is a
  // typed rule carrying a name-carrying element and NO fragment exists.
  // The NAMED_DEADKEY constant stays defined for persisted working copies.
  it("types dk(grave) as a namedDeadkey element — no named-deadkey fragment (#2238 flip)", () => {
    const { ir } = parse(NAMED_DK_KMN, "named-dk-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).not.toContain(OPAQUE_REASONS.NAMED_DEADKEY);
    expect(ir.raw.length).toBe(0);
    const main = ir.groups.find(g => g.name === "main");
    const rule = main?.rules[0];
    expect(rule?.output).toEqual([{ kind: "namedDeadkey", name: "grave" }]);
  });

  it("named deadkey name is preserved verbatim in the typed rule (#2238 flip)", () => {
    const { ir } = parse(NAMED_DK_KMN, "named-dk-test");
    const main = ir.groups.find(g => g.name === "main");
    const out = main?.rules[0]?.output[0];
    expect(out).toEqual({ kind: "namedDeadkey", name: "grave" });
  });
});

// ---------------------------------------------------------------------------
// P1-D: System store with SMP content (typed since spec 116)
// ---------------------------------------------------------------------------

describe("parse opaque — SMP in system store (P1-D)", () => {
  const SMP_SYS_STORE_KMN = `store(&VERSION) '10.0'
store(&NAME) U+1F600

begin Unicode > use(main)

group(main) using keys

+ [K_A] > U+0061
`;

  // DELIBERATE FLIP (spec 116, class smp-literal-typed): the store was an
  // smp-literal fragment; now it is a typed system store whose item is the
  // astral character itself, never a corrupted (surrogate-split) value.
  it("types store(&NAME) U+1F600 as a system store with one astral char item (spec 116 flip)", () => {
    const { ir } = parse(SMP_SYS_STORE_KMN, "smp-sys-store-test");
    expect(ir.raw.map(r => r.reason)).not.toContain(OPAQUE_REASONS.SMP_LITERAL);
    const name = ir.stores.find(st => st.isSystem && st.name === "NAME");
    expect(name?.items).toEqual([{ kind: "char", value: "\u{1F600}" }]);
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

  it("a head-position equality guard parses typed since spec 103 (no fragment)", () => {
    const { ir } = parse(IF_KMN, "if-test");
    const reasons = ir.raw.map(r => r.reason);
    expect(reasons).not.toContain(OPAQUE_REASONS.IF_OPTION_STORE);
    const rule = ir.groups.flatMap((g) => g.rules)[0];
    expect(rule?.context[0]).toEqual({
      kind: "if",
      store: "myFlag",
      value: "a",
    });
  });

  it("an untypeable guard still produces RawKmnFragment with reason if-option-store", () => {
    const { ir } = parse(
      IF_KMN.replace("if(myFlag = 'a')", "if(myFlag <> 'a')"),
      "if-test-neq",
    );
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

  // Spec 116: call() and return are typed output elements, so the rule is a
  // typed rule and no call-return fragment is produced.
  it("types call() as a call element — no fragment", () => {
    const { ir } = parse(CALL_KMN, "call-test");
    expect(ir.raw.map(r => r.reason)).not.toContain(OPAQUE_REASONS.CALL_RETURN);
    const rule = ir.groups.flatMap((g) => g.rules)[0]!;
    expect(rule.output).toEqual([{ kind: "call", storeRef: "myCallback" }]);
  });

  it("types the return keyword as a return element — no fragment", () => {
    const { ir } = parse(RETURN_KMN, "return-test");
    expect(ir.raw.map(r => r.reason)).not.toContain(OPAQUE_REASONS.CALL_RETURN);
    const rule = ir.groups.flatMap((g) => g.rules)[0]!;
    expect(rule.output).toEqual([{ kind: "return" }]);
  });

  it("a call() with an argument list the typed member cannot hold stays a call-return fragment", () => {
    const { ir } = parse(CALL_KMN.replace("call(myCallback)", "call(myCallback, 1)"), "call-args");
    expect(ir.raw.map(r => r.reason)).toContain(OPAQUE_REASONS.CALL_RETURN);
  });
});

// outs(store) inside a STORE BODY (not just a rule output). Before the fix,
// parseStoreItems dropped outs(...) to a raw item and emitted the store
// normally, producing broken .kmn when the store was later referenced.
describe("parse opaque — outs(store) inside a store body", () => {
  const OUTS_IN_STORE_KMN = `store(&NAME) 'Outs In Store'
store(whitespace) ' ' U+00A0
store(whitespace-dk) outs(whitespace) dk(1)

begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;

  // Spec 116: outs(store) in a store body is a typed `outs` item (a reference),
  // not an opaque fragment. It must still never fall to a raw item.
  it("types outs() as an outs store item — no outs-expansion fragment", () => {
    const { ir } = parse(OUTS_IN_STORE_KMN, "outs-in-store");
    expect(ir.raw.map((r) => r.reason)).not.toContain(OPAQUE_REASONS.OUTS_EXPANSION);
    const store = ir.stores.find((s) => s.name === "whitespace-dk");
    expect(store?.items).toEqual([{ kind: "outs", storeRef: "whitespace" }, { kind: "deadkey", id: 1 }]);
  });

  it("no store carries a raw outs(...) item", () => {
    const { ir } = parse(OUTS_IN_STORE_KMN, "outs-in-store");
    const rawOutsItem = ir.stores
      .flatMap((s) => s.items)
      .some((it) => it.kind === "raw" && /outs\(/.test(it.text ?? ""));
    expect(rawOutsItem).toBe(false);
  });

  it("emits the store with its outs() reference, after the store it names", () => {
    const { ir } = parse(OUTS_IN_STORE_KMN, "outs-in-store");
    const text = emit(ir);
    expect(text).toContain("store(whitespace-dk) outs(whitespace) dk(0001)");
    expect(text.indexOf("store(whitespace) ")).toBeLessThan(text.indexOf("store(whitespace-dk)"));
  });
});

// Pattern-audit sweep for the opaque-directive "token-classification-miss" class:
// a directive token (outs/if/save/call) must go opaque in EVERY element parser,
// never silently fall to a raw item. Closes the two cross-parser gaps that the
// store-body outs() fix surfaced.
describe("parse opaque — opaque-directive class across all element parsers", () => {
  it("outs() in CONTEXT position goes opaque (parseContextElements)", () => {
    const kmn = `store(&NAME) 'Ctx Outs'
store(s) U+0061 U+0062
begin Unicode > use(main)
group(main) using keys
U+0061 outs(s) > U+0063
`;
    const { ir } = parse(kmn, "ctx-outs");
    expect(ir.raw.map((r) => r.reason)).toContain(OPAQUE_REASONS.OUTS_EXPANSION);
  });

  it("if() in a STORE body goes opaque (parseStoreItems)", () => {
    const kmn = `store(&NAME) 'Store If'
store(weird) if(flag)
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;
    const { ir } = parse(kmn, "store-if");
    expect(ir.raw.map((r) => r.reason)).toContain(OPAQUE_REASONS.IF_OPTION_STORE);
  });
});

// Bracketed menu-store literal inside a STORE BODY: the old-style multi-tap
// menu syntax from the Keyman advanced docs. The bracketed entries are key
// sequences, not literal characters, so the store must go opaque rather than
// being expanded character by character.
describe("parse opaque — bracketed menu-store literal in a store body", () => {
  const MENU_KMN = `store(&NAME) 'Menu Store'
store(a_menu) '[1ae 2a 3a 4a 5a 6a]'

begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;

  it("marks the store opaque with reason menu-store-syntax", () => {
    const { ir } = parse(MENU_KMN, "menu-store");
    const reasons = ir.raw.map((r) => r.reason);
    expect(reasons).toContain(OPAQUE_REASONS.MENU_STORE_SYNTAX);
  });

  it("does NOT emit the menu store into ir.stores (no char-by-char expansion)", () => {
    const { ir } = parse(MENU_KMN, "menu-store");
    expect(ir.stores.find((s) => s.name === "a_menu")).toBeUndefined();
  });

  it("preserves the store source verbatim in the RawKmnFragment", () => {
    const { ir } = parse(MENU_KMN, "menu-store");
    const frag = ir.raw.find((r) => r.reason === OPAQUE_REASONS.MENU_STORE_SYNTAX);
    expect(frag?.sourceText).toContain("store(a_menu)");
    expect(frag?.sourceText).toContain("'[1ae 2a 3a 4a 5a 6a]'");
  });

  it("does not fabricate char items in the fragment's storeSketch", () => {
    const { ir } = parse(MENU_KMN, "menu-store");
    const frag = ir.raw.find((r) => r.reason === OPAQUE_REASONS.MENU_STORE_SYNTAX);
    expect(frag?.storeSketch).toBeUndefined();
  });

  it("opaqueFeatures inventory reflects menu-store-syntax", () => {
    const { opaqueFeatures } = parse(MENU_KMN, "menu-store");
    const features = opaqueFeatures.map((f) => f.feature);
    expect(features).toContain(OPAQUE_REASONS.MENU_STORE_SYNTAX);
  });

  it("emit leaves the menu store source text byte-identical", () => {
    const { ir } = parse(MENU_KMN, "menu-store");
    expect(emit(ir)).toContain("store(a_menu) '[1ae 2a 3a 4a 5a 6a]'");
  });

  it("a quoted store whose '[' is not at position 0 still expands to char items", () => {
    const kmn = `store(&NAME) 'Plain Store'
store(plain) 'a[b'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;
    const { ir } = parse(kmn, "menu-store-negative");
    const store = ir.stores.find((s) => s.name === "plain");
    expect(store?.items).toEqual([
      { kind: "char", value: "a" },
      { kind: "char", value: "[" },
      { kind: "char", value: "b" },
    ]);
    expect(ir.raw.map((r) => r.reason)).not.toContain(OPAQUE_REASONS.MENU_STORE_SYNTAX);
  });

  it("a lone '[' literal is a bracket-character store, not menu syntax", () => {
    // Real keyboards store a single bracket character (sil_yoruba8:
    // store(key.grv) '['). Only a complete bracketed group with content
    // ('[1ae 2a …]') is menu syntax; swallowing the lone bracket broke
    // pattern-apply store resolution for such keyboards.
    const kmn = `store(&NAME) 'Bracket Store'
store(key.grv) '['
store(key.all) '[' ']' ';'
begin Unicode > use(main)
group(main) using keys
+ [K_A] > U+0061
`;
    const { ir } = parse(kmn, "bracket-char-store");
    expect(ir.raw.map((r) => r.reason)).not.toContain(OPAQUE_REASONS.MENU_STORE_SYNTAX);
    expect(ir.stores.find((s) => s.name === "key.grv")?.items).toEqual([
      { kind: "char", value: "[" },
    ]);
    expect(ir.stores.find((s) => s.name === "key.all")?.items).toEqual([
      { kind: "char", value: "[" },
      { kind: "char", value: "]" },
      { kind: "char", value: ";" },
    ]);
  });

  it("a vkey bracket whose key is a quoted ']' stays one item and round-trips", () => {
    // bu_phonetic: store(keyBridgeB) [CTRL ALT SHIFT "]"]. The bracket scan
    // used to stop at the quoted ']', splitting the item in two and emitting
    // `[CTRL ALT SHIFT "] "]`, which kmc rejects.
    const kmn = `store(&NAME) 'Quoted Bracket Key'
store(keyBridgeB) [CTRL ALT SHIFT "]"]
begin Unicode > use(main)
group(main) using keys
+ [SHIFT "]"] > U+032A
`;
    const { ir } = parse(kmn, "quoted-bracket-key");
    expect(ir.stores.find((s) => s.name === "keyBridgeB")?.items).toEqual([
      { kind: "raw", text: '[CTRL ALT SHIFT "]"]' },
    ]);
    const out = emit(ir);
    expect(out).toContain('store(keyBridgeB) [CTRL ALT SHIFT "]"]');
    expect(out).toContain('+ [SHIFT "]"] > U+032A');
  });
});
