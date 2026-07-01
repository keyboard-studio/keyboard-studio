import { describe, it, expect } from "vitest";
import { emit } from "./emit.js";
import { parse } from "./parse.js";
import { normaliseForComparison } from "./normalise-ir.js";
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

  // Pinning test (not a spec of desired behavior): a store whose items[] has
  // been emptied still emits a bare `store(name) ` line with a trailing space
  // and no value token — kmcmplib rejects this (a store needs >=1 value
  // token to compile). The pattern-apply "drop" edit class (see
  // applyStoreSlotRemovals) now refuses to produce an empty store via that
  // path, so this transform-level guard is the reason IRStore.items should
  // never actually reach emit() empty in practice. This test pins emit()'s
  // own behavior in case some other caller ever does hand it an empty store.
  it("emits a bare `store(name) ` line (trailing space, no value) for an emptied store", () => {
    const out = emit(makeUserStoreIR("emptied", []));
    expect(out).toContain("store(emptied) \n");
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

// ---------------------------------------------------------------------------
// emitRule — group.usingKeys gate on the auto-prepended `+`
//
// kmcmplib::ProcessKeyLineImpl has two rule-syntax modes based on whether
// fk->currentGroup->fUsingKeys is true:
//
//   using keys     →  <lookahead> + <key> > <output>   (the `+` is required)
//   without keys   →  <context>           > <output>   (the `+` is forbidden)
//
// Rules inside `group(deadkeys)` (no `using keys` clause) such as
//   dk(003b) any(dkf003b) > index(dkt003b, 2)
// in sil_cameroon_qwerty must round-trip WITHOUT a leading `+`, or kmcmplib
// rejects with KM_ERROR_KMCMP_InvalidToken on the rule line.
// ---------------------------------------------------------------------------

describe("emit — group.usingKeys controls the auto-prepended +", () => {
  it("does NOT prepend + for rules in a non-keys group", () => {
    const base = makeIR();
    base.groups.push({
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      rules: [
        {
          nodeId: "rule#dk",
          context: [
            { kind: "deadkey", id: 0x3b },
            { kind: "any", storeRef: "dkf003b" },
          ],
          output: [{ kind: "index", storeRef: "dkt003b", offset: 2 }],
        },
      ],
      readonly: false,
    });
    const out = emit(base);
    expect(out).toContain("group(deadkeys)");
    expect(out).toContain("dk(003b) any(dkf003b) > index(dkt003b, 2)");
    expect(out).not.toMatch(/\+\s+dk\(003b\)\s+any\(dkf003b\)\s*>/);
  });

  it("still prepends + for rules in a using-keys group (regression)", () => {
    const base = makeIR();
    base.groups[0]?.rules.push({
      nodeId: "rule#keys",
      context: [{ kind: "vkey", name: "K_A", modifiers: [] }],
      output: [{ kind: "char", value: "a" }],
    });
    expect(base.groups[0]?.usingKeys).toBe(true);
    const out = emit(base);
    expect(out).toContain("+ [K_A] > U+0061");
  });
});

// ---------------------------------------------------------------------------
// emit — position-faithful path for fragment-bearing keyboards (ir.raw.length > 0)
//
// These tests guard the two defects fixed by the faithful-emit path:
//   (a) store-dropping: stores referenced only by opaque fragments were silently
//       omitted; the faithful path preserves ALL user stores for the group.
//   (b) fragment reordering: fragments were dumped at file-end, losing their
//       original position; the faithful path interleaves them by sourceLine.
//
// They also verify that the fragment-free path is not affected (AC#3 regression
// guard).
// ---------------------------------------------------------------------------

describe("emit — faithful emit for fragment-bearing keyboards", () => {
  /**
   * Minimal IR with one opaque fragment inside the group.
   * The fragment references a user store that is NOT referenced by any typed rule.
   * The group carries `sourceLine: 15` so positional attribution places the
   * store (sourceLine 20) inside it. Before the fix, that store would be
   * silently dropped.
   */
  function makeFragmentBearingIR(): KeyboardIR {
    const base = makeIR();
    // Give the group a source line so positional attribution can assign the store.
    const grp = base.groups[0];
    if (grp) grp.sourceLine = 15;
    // User store at sourceLine 20 (> group header line 15) → positionally in group.
    // Not referenced by any typed rule; only by the opaque fragment below.
    base.stores.push({
      nodeId: "store#opaque-only",
      name: "opaqueStore",
      items: [{ kind: "char", value: "x" }],
      isSystem: false,
      sourceLine: 20,
    });
    // Typed rule at sourceLine 25.
    base.groups[0]?.rules.push({
      nodeId: "rule#typed",
      context: [{ kind: "vkey", name: "K_B", modifiers: [] }],
      output: [{ kind: "char", value: "b" }],
      sourceLine: 25,
    });
    // Opaque fragment at sourceLine 22, in the group.
    base.raw.push({
      nodeId: "raw#frag0",
      origin: "imported",
      sourceText: "save(opaqueStore, 1)",
      reason: "save/set/reset option-store",
      sourceLine: 22,
      groupNodeId: base.groups[0]?.nodeId,
    });
    return base;
  }

  it("(a) preserves user stores attributed positionally to the group (store-drop fix)", () => {
    const ir = makeFragmentBearingIR();
    const out = emit(ir);
    // The store must appear in the output even though no typed rule references it.
    expect(out).toContain("store(opaqueStore)");
  });

  it("(b) interleaves fragment before the typed rule that follows it in source (reorder fix)", () => {
    const ir = makeFragmentBearingIR();
    const out = emit(ir);
    const fragIdx = out.indexOf("save(opaqueStore, 1)");
    const ruleIdx = out.indexOf("+ [K_B] > U+0062");
    expect(fragIdx).toBeGreaterThanOrEqual(0);
    expect(ruleIdx).toBeGreaterThanOrEqual(0);
    // Fragment at sourceLine 22 must appear before rule at sourceLine 25.
    expect(fragIdx).toBeLessThan(ruleIdx);
  });

  it("(c) each user store is emitted exactly once (no duplicates across groups)", () => {
    // Two groups; a user store positionally in the first group.
    // It must appear in the first group's output and NOT in the second group's.
    const base = makeIR();
    const grp1 = base.groups[0];
    if (grp1) grp1.sourceLine = 10;
    const grp2: import("@keyboard-studio/contracts").IRGroup = {
      nodeId: "group#two",
      name: "deadkeys",
      usingKeys: false,
      rules: [],
      readonly: false,
      sourceLine: 30,
    };
    base.groups.push(grp2);
    // Store at sourceLine 15 → belongs to group1 (line 10 <= 15 < 30).
    base.stores.push({
      nodeId: "store#once",
      name: "sharedStore",
      items: [{ kind: "char", value: "y" }],
      isSystem: false,
      sourceLine: 15,
    });
    // Fragment in group2 that mentions sharedStore (should NOT cause a second emit).
    base.raw.push({
      nodeId: "raw#grp2frag",
      origin: "imported",
      sourceText: "call(sharedStore)",
      reason: "call/return",
      sourceLine: 35,
      groupNodeId: "group#two",
    });
    const out = emit(base);
    // Store appears exactly once.
    const matches = [...out.matchAll(/store\(sharedStore\)/g)];
    expect(matches).toHaveLength(1);
  });

  it("fragment-free keyboard output is unchanged by the presence of the faithful-emit branch (AC#3)", () => {
    // When ir.raw.length === 0, emit() must take the old standard path.
    const ir = makeIR(); // no raw fragments
    expect(ir.raw.length).toBe(0);
    const out = emit(ir);
    // Verify standard structure is intact.
    expect(out).toContain("begin Unicode > use(main)");
    expect(out).toContain("group(main) using keys");
    expect(out).toContain("+ [K_A] > U+0061");
    // No stray fragment placeholders.
    expect(out).not.toContain("save(");
  });

  it("AC#3 — fragment-free path emits both rules verbatim; no rule silently dropped or reordered", () => {
    // Stronger guard: verify that BOTH rules from makeIR() appear in the correct
    // textual form, proving the standard (non-faithful) path was not altered by
    // the addition of the faithful-emit branch. If a rule line is missing the
    // fragment-free path regressed.
    const ir = makeIR(); // rule#0: K_A→a, rule#1: K_A+SHIFT→A
    expect(ir.raw.length).toBe(0);
    const out = emit(ir);
    // Both rules must be present as full lines.
    expect(out).toContain("+ [K_A] > U+0061");
    expect(out).toContain("+ [SHIFT K_A] > U+0041");
    // The group body must contain exactly 2 rule lines.
    const ruleLines = out.split("\n").filter((l) => l.trimStart().startsWith("+"));
    expect(ruleLines).toHaveLength(2);
    // System stores (VERSION, NAME) must be present.
    expect(out).toContain("store(&VERSION)");
    expect(out).toContain("store(&NAME)");
    // No user (non-system) stores in the output (makeIR has none).
    expect(out).not.toContain("store(VERSION");
    expect(out).not.toContain("store(NAME");
  });

  it("global pre-begin fragment is emitted before the begin directive", () => {
    const ir = makeIR();
    // A pre-begin fragment has no groupNodeId.
    ir.raw.push({
      nodeId: "raw#pre",
      origin: "imported",
      sourceText: "c pre-begin unknown construct",
      reason: "unknown-pre-begin",
      sourceLine: 1,
      // groupNodeId intentionally absent — global/pre-begin
    });
    const out = emit(ir);
    const fragIdx = out.indexOf("c pre-begin unknown construct");
    const beginIdx = out.indexOf("begin Unicode > use(main)");
    expect(fragIdx).toBeGreaterThanOrEqual(0);
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(fragIdx).toBeLessThan(beginIdx);
  });
});

// ---------------------------------------------------------------------------
// emit — fragment-free orphan store preservation (ir.raw.length === 0)
//
// A user store declared in a keyboard but never referenced by any typed rule
// was previously silently dropped on the fragment-free path because the emitter
// only output user stores that appeared in a rule's storeRef. The fix adds an
// explicit orphan pass that emits such stores before the `begin` directive so
// that emit → re-parse produces a structurally equal IR.
// ---------------------------------------------------------------------------

describe("emit — fragment-free path preserves orphan user stores", () => {
  it("preserves a user store not referenced by any rule (unit — IR constructed directly)", () => {
    const ir = makeIR(); // ir.raw.length === 0 by construction
    expect(ir.raw.length).toBe(0);
    // Add a user store that no typed rule references.
    ir.stores.push({
      nodeId: "store#orphan",
      name: "orphanDict",
      items: [{ kind: "char", value: "a" }, { kind: "char", value: "b" }, { kind: "char", value: "c" }],
      isSystem: false,
    });
    // The existing rules in makeIR() reference neither orphanDict in context nor output.
    const out = emit(ir);
    expect(out).toContain("store(orphanDict)");
    // The orphan store must appear before the begin directive.
    const storeIdx = out.indexOf("store(orphanDict)");
    const beginIdx = out.indexOf("begin Unicode > use(main)");
    expect(storeIdx).toBeGreaterThanOrEqual(0);
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(storeIdx).toBeLessThan(beginIdx);
  });

  it("round-trips a keyboard with an unreferenced user store through parse → emit → re-parse", () => {
    // Inline .kmn — no opaque constructs, so ir.raw.length === 0 after parse.
    const kmn = [
      "store(&VERSION) '10.0'",
      "store(&NAME) 'OrphanTest'",
      "store(&COPYRIGHT) ''",
      "store(&TARGETS) 'any'",
      "store(&LANGUAGE) ''",
      "store(orphanDict) 'abc'",
      "",
      "begin Unicode > use(main)",
      "",
      "group(main) using keys",
      "+ [K_A] > U+0061",
    ].join("\n");

    const { ir: ir1 } = parse(kmn, "orphan_test");
    expect(ir1.raw.length).toBe(0);
    // The parsed IR must contain orphanDict.
    expect(ir1.stores.some(s => s.name === "orphanDict")).toBe(true);

    const emitted = emit(ir1);
    // Emitted text must include the orphan store.
    expect(emitted).toContain("store(orphanDict)");

    const { ir: ir2 } = parse(emitted, "orphan_test");
    // Re-parsed IR must also contain orphanDict — round-trip fidelity.
    expect(ir2.stores.some(s => s.name === "orphanDict")).toBe(true);

    // Deep structural equality after normalisation.
    expect(normaliseForComparison(ir2)).toEqual(normaliseForComparison(ir1));
  });
});

// ---------------------------------------------------------------------------
// emit — faithful path catch-all for unsourced stores referenced only by a
// global fragment (ir.raw.length > 0)
//
// An unsourced store (sourceLine: undefined) whose only name-reference lives
// inside a global fragment (groupNodeId: undefined) is invisible to every
// group's per-group name-reference check in emitGroupBodyFaithful: global
// fragments never appear in any group's `groupFragments` slice, so the
// per-group fallback never sees the store name. Without the post-group
// catch-all sweep the store is silently dropped.
//
// The fix: after the group loop, emit any unsourced store not yet recorded in
// emittedStores. This test constructs the precise condition — unsourced store,
// global fragment referencing it, single typed group that does NOT reference it
// in its own typed rules or group-owned fragments.
// ---------------------------------------------------------------------------

describe("emit — faithful path preserves an unsourced store referenced only by a global fragment", () => {
  function makeGlobalFragmentIR(): KeyboardIR {
    const base = makeIR(); // gives us system stores + group(main) using keys

    // Give the group a sourceLine so attributeStoresToGroups can work positionally.
    const grp = base.groups[0];
    if (grp) grp.sourceLine = 10;

    // Unsourced user store: no sourceLine → falls into unsourcedStores list.
    // No typed rule in any group references it.
    base.stores.push({
      nodeId: "store#ghost",
      name: "ghostStore",
      items: [{ kind: "char", value: "g" }],
      isSystem: false,
      // sourceLine intentionally absent
    });

    // A global fragment (groupNodeId: undefined) whose text contains ghostStore.
    // Global fragments are emitted before `begin`, never inside any group's block.
    // emitGroupBodyFaithful therefore never sees "ghostStore" in its groupFragments
    // scan, so without the catch-all the store is dropped.
    base.raw.push({
      nodeId: "raw#global",
      origin: "imported",
      sourceText: "any(ghostStore) > nul",
      reason: "any-store-global",
      sourceLine: 5,
      // groupNodeId intentionally absent — this is a global/pre-begin fragment
    });

    return base;
  }

  it("emitted text contains store(ghostStore) (catch-all sweep)", () => {
    const ir = makeGlobalFragmentIR();
    expect(ir.raw.length).toBeGreaterThan(0); // faithful path must be active
    const out = emit(ir);
    expect(out).toContain("store(ghostStore)");
  });

  it("store(ghostStore) appears exactly once in the emitted text (no duplicates)", () => {
    const ir = makeGlobalFragmentIR();
    const out = emit(ir);
    const matches = [...out.matchAll(/store\(ghostStore\)/g)];
    expect(matches).toHaveLength(1);
  });

  it("round-trip: re-parsing emitted text produces an IR that contains a store named ghostStore", () => {
    const ir = makeGlobalFragmentIR();
    const out = emit(ir);
    const { ir: ir2 } = parse(out, "ghost_test");
    expect(ir2.stores.some(s => s.name === "ghostStore")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// emit — faithful path catch-all: broadened to ALL userStores (not only unsourced)
//
// The catch-all backstop was widened to iterate ALL non-system userStores,
// deduped by emittedStores.has(nodeId). This closes two gaps:
//
//   Test 1 — degenerate keyboard: sourced store in a keyboard where every group
//   is readonly so the pre-group bucket reassignment finds no firstGroup and
//   cannot promote the store. The sourced store has a sourceLine that precedes
//   all group headers, so attributeStoresToGroups() places it in the "" bucket.
//   With no non-readonly firstGroup the bucket is deleted and the store is never
//   emitted by the positional pass. The widened catch-all (all userStores, not
//   only unsourced) recovers it.
//
//   Test 2 — no double-emission: a store that IS emitted by the normal faithful
//   pass (positionally attributed to a real group) must appear EXACTLY ONCE in
//   the output. The emittedStores dedup guard in the catch-all must prevent a
//   second emission.
// ---------------------------------------------------------------------------

describe("emit — faithful path catch-all emits sourced stores dropped by all-readonly groups", () => {
  /**
   * IR where every group is readonly and the single user store has a sourceLine
   * that precedes all group headers.
   *
   * Before the catch-all was broadened from unsourcedStores to userStores, the
   * sourced store had a sourceLine and therefore was excluded from unsourcedStores.
   * The pre-group bucket ("") could not be promoted because ir.groups.find(g =>
   * !g.readonly) returns undefined. The store was silently dropped.
   *
   * After the broadening the catch-all sweeps all userStores; the sourced store
   * is not in emittedStores yet, so it is emitted.
   */
  function makeAllReadonlyIR(): KeyboardIR {
    const base = makeIR();

    // Replace the writable group with a readonly one that still has a sourceLine.
    const grp = base.groups[0];
    if (grp) {
      grp.readonly = true;
      grp.sourceLine = 10;
    }

    // User store at sourceLine 1 — precedes the group header at line 10,
    // so attributeStoresToGroups() places it in the "" (pre-group) bucket.
    base.stores.push({
      nodeId: "store#sourced-pregroup",
      name: "preGroupStore",
      items: [{ kind: "char", value: "p" }],
      isSystem: false,
      sourceLine: 1,
    });

    // At least one RawKmnFragment so the faithful path (ir.raw.length > 0) is active.
    base.raw.push({
      nodeId: "raw#readonly-frag",
      origin: "imported",
      sourceText: "c opaque line requiring faithful path",
      reason: "unknown-construct",
      sourceLine: 12,
      groupNodeId: grp?.nodeId,
    });

    return base;
  }

  it("emits the sourced pre-group store when all groups are readonly (catch-all coverage)", () => {
    const ir = makeAllReadonlyIR();
    expect(ir.raw.length).toBeGreaterThan(0); // faithful path must be active
    // Confirm truly all-readonly.
    expect(ir.groups.every(g => g.readonly)).toBe(true);
    const out = emit(ir);
    expect(out).toContain("store(preGroupStore)");
  });

  it("store(preGroupStore) appears exactly once (catch-all does not duplicate)", () => {
    const ir = makeAllReadonlyIR();
    const out = emit(ir);
    const matches = [...out.matchAll(/store\(preGroupStore\)/g)];
    expect(matches).toHaveLength(1);
  });
});

describe("emit — faithful path catch-all dedup prevents double-emission of a normally-emitted store", () => {
  /**
   * IR with ir.raw.length > 0 and a sourced user store that IS emitted by the
   * normal positional pass (the store's sourceLine puts it inside a non-readonly
   * group). The catch-all sweep runs after the group loop; without the
   * emittedStores guard it would emit the store a second time.
   *
   * This test verifies the guard works: exactly one store(alreadyEmitted) in output.
   */
  function makeNormallyEmittedStoreIR(): KeyboardIR {
    const base = makeIR();

    // Give the group a sourceLine so positional attribution can assign the store.
    const grp = base.groups[0];
    if (grp) grp.sourceLine = 10;

    // Sourced store at sourceLine 15 — inside the group (line 10 <= 15).
    // Positional pass will emit it during emitGroupBodyFaithful.
    base.stores.push({
      nodeId: "store#normal-emitted",
      name: "alreadyEmitted",
      items: [{ kind: "char", value: "n" }],
      isSystem: false,
      sourceLine: 15,
    });

    // A typed rule at sourceLine 20 so the group is non-empty.
    base.groups[0]?.rules.push({
      nodeId: "rule#normal",
      context: [{ kind: "vkey", name: "K_N", modifiers: [] }],
      output: [{ kind: "char", value: "n" }],
      sourceLine: 20,
    });

    // Fragment in the same group to activate the faithful path.
    base.raw.push({
      nodeId: "raw#normal-frag",
      origin: "imported",
      sourceText: "c fragment that activates faithful path",
      reason: "unknown-construct",
      sourceLine: 25,
      groupNodeId: grp?.nodeId,
    });

    return base;
  }

  it("store emitted by the positional pass appears exactly once (dedup guard fires)", () => {
    const ir = makeNormallyEmittedStoreIR();
    expect(ir.raw.length).toBeGreaterThan(0); // faithful path must be active
    const out = emit(ir);
    // The store must be present.
    expect(out).toContain("store(alreadyEmitted)");
    // The dedup guard must prevent a second emission.
    const matches = [...out.matchAll(/store\(alreadyEmitted\)/g)];
    expect(matches).toHaveLength(1);
  });
});
