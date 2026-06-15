import { describe, it, expect } from "vitest";
import { emit } from "./emit.js";
import type { KeyboardIR, IRGroup, IRRule, IRStore, IRComment } from "@keyboard-studio/contracts";

function makeIR(): KeyboardIR {
  const stores: IRStore[] = [
    {
      nodeId: "store#0",
      name: "VERSION",
      items: [{ kind: "char", value: "1" }, { kind: "char", value: "0" }, { kind: "char", value: "." }, { kind: "char", value: "0" }],
      isSystem: true,
    },
    {
      nodeId: "store#1",
      name: "NAME",
      items: [{ kind: "char", value: "T" }, { kind: "char", value: "e" }, { kind: "char", value: "s" }, { kind: "char", value: "t" }],
      isSystem: true,
    },
  ];
  const rules: IRRule[] = [
    {
      nodeId: "rule#0",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
    },
    {
      nodeId: "rule#1",
      context: [{ kind: "vkey", name: "K_A", modifiers: ["SHIFT"] }],
      output: [{ kind: "char", value: "A" }],
    },
  ];
  const group: IRGroup = {
    nodeId: "group#0",
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };
  const ir: KeyboardIR = {
    origin: "imported",
    header: {
      keyboardId: "test",
      name: "Test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: ["any"],
      storeDirectives: [],
    },
    stores,
    groups: [group],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
  return ir;
}

describe("emit", () => {
  it("includes begin Unicode > use(main)", () => {
    const out = emit(makeIR());
    expect(out).toContain("begin Unicode > use(main)");
  });

  it("includes group(main) using keys", () => {
    const out = emit(makeIR());
    expect(out).toContain("group(main) using keys");
  });

  it("emits VERSION store first", () => {
    const out = emit(makeIR());
    const versionIdx = out.indexOf("store(&VERSION)");
    const nameIdx = out.indexOf("store(&NAME)");
    expect(versionIdx).toBeGreaterThanOrEqual(0);
    expect(versionIdx).toBeLessThan(nameIdx);
  });

  it("emits rules with + prefix and uppercase U+XXXX codepoints", () => {
    const out = emit(makeIR());
    // K_A -> a (U+0061 uppercase = U+0061)
    expect(out).toContain("+ [K_A] > U+0061");
    // SHIFT K_A -> A (U+0041)
    expect(out).toContain("+ [SHIFT K_A] > U+0041");
  });

  it("ends with a trailing newline", () => {
    const out = emit(makeIR());
    expect(out.endsWith("\n")).toBe(true);
  });

  it("emits deadkey in output as dk(nnnn)", () => {
    const ir = makeIR();
    const group = ir.groups[0];
    if (group) {
      group.rules.push({
        nodeId: "rule#2",
        context: [{ kind: "vkey", name: "K_2", modifiers: ["RALT"] }],
        output: [{ kind: "deadkey", id: 0x007e }],
      });
    }
    const out = emit(ir);
    expect(out).toContain("dk(007e)");
  });

  it("emits index(store, N) in output", () => {
    const ir = makeIR();
    const group = ir.groups[0];
    if (group) {
      group.rules.push({
        nodeId: "rule#3",
        context: [
          { kind: "deadkey", id: 0x007e },
          { kind: "any", storeRef: "dkf007e" },
        ],
        output: [{ kind: "index", storeRef: "dkt007e", offset: 2 }],
      });
    }
    const out = emit(ir);
    expect(out).toContain("index(dkt007e, 2)");
  });

  it("emits freestanding comments before stores", () => {
    const ir = makeIR();
    ir.comments.push({
      nodeId: "comment#0",
      text: "top comment",
      anchor: "freestanding",
    });
    const out = emit(ir);
    const commentIdx = out.indexOf("c top comment");
    const storeIdx = out.indexOf("store(");
    expect(commentIdx).toBeGreaterThanOrEqual(0);
    expect(commentIdx).toBeLessThan(storeIdx);
  });

  it("emits leading comment before the rule it anchors", () => {
    const ir = makeIR();
    const firstRuleId = ir.groups[0]?.rules[0]?.nodeId ?? "rule#0";
    const comment: IRComment = {
      nodeId: "comment#1",
      text: "rule comment",
      anchor: "leading",
      anchorRef: { kind: "rule", nodeId: firstRuleId },
    };
    ir.comments.push(comment);
    const out = emit(ir);
    const commentIdx = out.indexOf("c rule comment");
    const ruleIdx = out.indexOf("+ [K_A] > U+0061");
    expect(commentIdx).toBeGreaterThanOrEqual(0);
    expect(commentIdx).toBeLessThan(ruleIdx);
  });

  it("emits user store referenced by group rules", () => {
    const ir = makeIR();
    // Add a user store
    ir.stores.push({
      nodeId: "store#2",
      name: "myStore",
      items: [{ kind: "char", value: "a" }],
      isSystem: false,
    });
    // Add a rule that references myStore
    ir.groups[0]?.rules.push({
      nodeId: "rule#4",
      context: [{ kind: "any", storeRef: "myStore" }],
      output: [{ kind: "char", value: "b" }],
    });
    const out = emit(ir);
    expect(out).toContain("store(myStore)");
  });

  it("emits RawKmnFragment sourceText verbatim", () => {
    const ir = makeIR();
    ir.raw.push({
      nodeId: "raw#0",
      origin: "imported",
      sourceText: "save(myFlag, 1)",
      reason: "option-store-directive",
    });
    const out = emit(ir);
    expect(out).toContain("save(myFlag, 1)");
  });
});

describe("emit: SMP codepoints", () => {
  it("emits SMP char in context as quoted literal, not U+XXXXX", () => {
    const ir = makeIR();
    // SMP char only in context; BMP char in output so assertions are isolated
    ir.groups[0]?.rules.push({
      nodeId: "rule#smp0",
      context: [{ kind: "char", value: "\u{11700}" }],
      output: [{ kind: "char", value: "a" }],
    });
    const out = emit(ir);
    expect(out).toContain("'\u{11700}'");
    expect(out).not.toContain("U+11700");
  });

  it("emits SMP char in output as quoted literal, not U+XXXXX", () => {
    const ir = makeIR();
    // BMP char in context; SMP char only in output so assertions are isolated
    ir.groups[0]?.rules.push({
      nodeId: "rule#smp1",
      context: [{ kind: "char", value: "a" }],
      output: [{ kind: "char", value: "\u{11701}" }],
    });
    const out = emit(ir);
    expect(out).toContain("'\u{11701}'");
    expect(out).not.toContain("U+11701");
  });
});

// ---------------------------------------------------------------------------
// emitStoreItems — quote selection + unsafe-char splitting
//
// Real keyboards (e.g. sil_cameroon_qwerty) contain user stores whose char
// runs include both literal apostrophes and combining marks. A naive emit
// would wrap the run in '...' and break the lexer (KM_ERROR_KMCMP_InvalidToken,
// reported as 5251082 in the studio's recompile pipeline).
// ---------------------------------------------------------------------------

describe("emit — quoted store values", () => {
  function makeUserStoreIR(name: string, chars: string[]): KeyboardIR {
    const base = makeIR();
    base.stores.push({
      nodeId: `store#user-${name}`,
      name,
      items: chars.map((c) => ({ kind: "char", value: c })),
      isSystem: false,
    });
    // emit only renders user stores referenced by a rule in the group — add
    // a synthetic rule that uses any(<name>) so the store is emitted.
    base.groups[0]?.rules.push({
      nodeId: `rule#use-${name}`,
      context: [{ kind: "any", storeRef: name }],
      output: [{ kind: "index", storeRef: name, offset: 1 }],
    });
    return base;
  }

  it("wraps a plain ASCII run in single quotes", () => {
    const out = emit(makeUserStoreIR("word", ["a", "b", "c"]));
    expect(out).toContain("store(word) 'abc'");
  });

  it("switches to double quotes when the run contains an apostrophe", () => {
    const out = emit(makeUserStoreIR("word", ["a", "'", "b"]));
    expect(out).toContain(`store(word) "a'b"`);
  });

  it("uses single quotes when the run contains a double-quote", () => {
    const out = emit(makeUserStoreIR("word", ["a", '"', "b"]));
    expect(out).toContain(`store(word) 'a"b'`);
  });

  it("splits on U+0022 when the run contains both quote characters", () => {
    const out = emit(makeUserStoreIR("word", ["a", "'", '"', "b"]));
    // Two pieces separated by U+0022 (escape for the literal double-quote).
    expect(out).toContain(`store(word) "a'" U+0022 "b"`);
  });

  it("emits combining marks as separate U+XXXX tokens, not inside the string", () => {
    // sil_cameroon_qwerty &dia: literal combining marks should round-trip as
    // bare U+xxxx tokens, never embedded in a quoted literal.
    const out = emit(
      makeUserStoreIR("dia", ["̀", "̄", "́"]),
    );
    expect(out).toContain("store(dia) U+0300 U+0304 U+0301");
  });

  it("handles the sil_cameroon_qwerty &word pattern (apostrophe + combining marks)", () => {
    // Excerpted shape: "...-'" followed by ten combining marks. The naive
    // emit would produce '...-'̧̰̀...' which the kmcmplib lexer rejects.
    const out = emit(
      makeUserStoreIR("word", [
        "a", "b", "-", "'",
        "̀", "̄", "́", "̌", "̂",
      ]),
    );
    // Apostrophe segment uses double quotes; combining marks are bare U+XXXX.
    expect(out).toContain(
      `store(word) "ab-'" U+0300 U+0304 U+0301 U+030C U+0302`,
    );
    // Critical: no naked combining mark sits inside any quoted literal.
    expect(out).not.toMatch(/['"][^'"]*[̀-ͯ][^'"]*['"]/);
  });

  it("emits control characters as standalone U+XXXX tokens", () => {
    const out = emit(makeUserStoreIR("ctrl", ["a", "	", "b"]));
    expect(out).toContain("store(ctrl) 'a' U+0009 'b'");
  });
});

// ---------------------------------------------------------------------------
// emitRule — inline `+` handling (platform() / pre-context rules)
//
// Original sources like sil_cameroon_qwerty contain rules of the form
//   platform('touch') any(word) any(final) + [K_SPACE] > ...
// Parser captures the `+` between any(final) and [K_SPACE] as a raw context
// element. emitRule must NOT prepend its own `+` in that case, or kmcmplib
// rejects with KM_ERROR_KMCMP_InvalidToken (two `+`s in one rule).
// ---------------------------------------------------------------------------

describe("emit — inline + in rule context", () => {
  it("does not double the + when context already contains a raw + element", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#plat",
      context: [
        { kind: "raw", text: "platform('touch')" },
        { kind: "raw", text: "+" },
        { kind: "vkey", name: "K_SPACE", modifiers: [] },
      ],
      output: [{ kind: "char", value: " " }],
    });
    const out = emit(base);
    expect(out).toContain("platform('touch') + [K_SPACE] > U+0020");
    expect(out).not.toContain("+ platform('touch') + [K_SPACE]");
  });

  it("still prepends + when context has no raw + token", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#plain",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "q" }],
    });
    const out = emit(base);
    expect(out).toContain("+ [K_Q] > U+0071");
  });
});

// ---------------------------------------------------------------------------
// emitRule — match/nomatch keyword preservation
//
// Group-transition rules of the form `match > use(g)` lose their leading
// keyword on round-trip if rule.matchKind is dropped, producing a bare `>`
// line that kmcmplib rejects (KM_ERROR_KMCMP_InvalidToken on line N where
// only `> use(...)` appears). 179 of 914 release keyboards hit this.
// ---------------------------------------------------------------------------

describe("emit — match/nomatch group-transition rules", () => {
  it("emits `match > use(deadkeys)` when matchKind=match", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#match",
      context: [],
      output: [{ kind: "raw", text: "use(deadkeys)" }],
      matchKind: "match",
    });
    const out = emit(base);
    expect(out).toContain("match > use(deadkeys)");
    expect(out).not.toMatch(/^\s*> use\(deadkeys\)\s*$/m);
  });

  it("emits `nomatch > use(main)` when matchKind=nomatch", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#nomatch",
      context: [],
      output: [{ kind: "raw", text: "use(main)" }],
      matchKind: "nomatch",
    });
    const out = emit(base);
    expect(out).toContain("nomatch > use(main)");
  });

  it("falls through to bare `>` when matchKind is unset (legacy path)", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#bare",
      context: [],
      output: [{ kind: "raw", text: "use(somewhere)" }],
    });
    const out = emit(base);
    // The legacy bare-arrow path remains for any caller that constructs
    // empty-context rules manually; the parser now sets matchKind to avoid it.
    expect(out).toContain("> use(somewhere)");
  });
});

// ---------------------------------------------------------------------------
// emitRule / emitStore — $keyman[web|only]: target-selector preservation
//
// kmcmplib::GetLinePrefixType recognises three line-prefix directives that
// scope a line to a compile target. The codec must round-trip them or
// keyboards that use $keymanonly:/$keymanweb: for target-specific stores
// (galaxie_greek_mnemonic, eo_plus, ...) lose their target gating.
// ---------------------------------------------------------------------------

describe("emit — target-selector prefix", () => {
  it("prepends $keymanweb: to a rule when targetSelector=keymanweb", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#kw",
      context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
      output: [{ kind: "char", value: "q" }],
      targetSelector: "keymanweb",
    });
    const out = emit(base);
    expect(out).toContain("$keymanweb: + [K_Q] > U+0071");
  });

  it("prepends $keymanonly: to a store when targetSelector=keymanonly", () => {
    const base = makeIR();
    base.stores.push({
      nodeId: "store#kmo",
      name: "euro",
      items: [
        { kind: "char", value: "C" },
        { kind: "char", value: "c" },
      ],
      isSystem: false,
      targetSelector: "keymanonly",
    });
    // Stores are emitted only when referenced; add a rule that references it.
    base.groups[0]?.rules.push({
      nodeId: "rule#use-euro",
      context: [{ kind: "any", storeRef: "euro" }],
      output: [{ kind: "index", storeRef: "euro", offset: 1 }],
    });
    const out = emit(base);
    expect(out).toContain("$keymanonly: store(euro) 'Cc'");
  });

  it("prepends $keyman: when targetSelector=keyman (apply-to-both marker)", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#kb",
      context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
      output: [{ kind: "char", value: "z" }],
      targetSelector: "keyman",
    });
    const out = emit(base);
    expect(out).toContain("$keyman: + [K_Z] > U+007A");
  });

  it("omits the prefix when targetSelector is unset", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#plain",
      context: [{ kind: "vkey", name: "K_X", modifiers: [] }],
      output: [{ kind: "char", value: "x" }],
    });
    const out = emit(base);
    expect(out).toContain("+ [K_X] > U+0078");
    expect(out).not.toMatch(/\$keyman(web|only)?:\s*\+ \[K_X\]/);
  });
});
