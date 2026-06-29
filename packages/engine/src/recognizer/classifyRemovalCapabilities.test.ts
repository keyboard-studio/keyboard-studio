/**
 * Unit tests for classifyRemovalCapabilities.
 *
 * Coverage:
 *   A.  Per-branch: opaque, context-sensitive, ownedByPattern (S-02 escape),
 *       slot-fill body (+ output-store alias), simple, unknown.
 *   B.  Decision-order precedence: opaque > context-sensitive > slot-fill > simple.
 *       ownedByPattern escape rule does NOT become removable:simple.
 *   C.  AC canaries (real keyboards via skipIf guard):
 *       - sil_cameroon_qwerty S-02 body → removable:slot-fill; output-store alias present.
 *       - basic_kbdfr S-02 body + trigger rules.
 *       - basic_kbdus direct key rules → removable:simple (AC#2 on a genuinely simple keyboard).
 *       - RawKmnFragment fixture → not-removable:opaque.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { classifyRemovalCapabilities } from "./classifyRemovalCapabilities.js";
import { recognizePatterns } from "./index.js";
import { parse } from "../codec/index.js";
import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  IRStore,
  RawKmnFragment,
} from "@keyboard-studio/contracts";
import { makeTestIR, makeCharStore } from "@keyboard-studio/contracts/fixtures";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function simpleRule(nodeId: string, vkey: string, char: string): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "char", value: char }],
  };
}

function contextSensitiveRule(nodeId: string): IRRule {
  // context.length > 1 → context-sensitive
  return {
    nodeId,
    context: [
      { kind: "vkey", name: "K_A", modifiers: [] },
      { kind: "char", value: "x" },
    ],
    output: [{ kind: "char", value: "y" }],
  };
}

function contextNRule(nodeId: string): IRRule {
  // context(N) element on the LHS → context-sensitive
  return {
    nodeId,
    context: [{ kind: "context", offset: 2 }],
    output: [{ kind: "char", value: "z" }],
  };
}

function bodyRule(nodeId: string, dkId: number, inputStore: string, outputStore: string): IRRule {
  return {
    nodeId,
    context: [
      { kind: "deadkey", id: dkId },
      { kind: "any", storeRef: inputStore },
    ],
    output: [{ kind: "index", storeRef: outputStore, offset: 2 }],
  };
}

function triggerRule(nodeId: string, vkey: string, dkId: number): IRRule {
  return {
    nodeId,
    context: [{ kind: "vkey", name: vkey, modifiers: [] }],
    output: [{ kind: "deadkey", id: dkId }],
  };
}

function unknownRule(nodeId: string): IRRule {
  // context.length === 1 vkey → char, but in the "deadkeys" group —
  // isS01 returns false because groupName === "deadkeys".
  return {
    nodeId,
    context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
    output: [{ kind: "char", value: "zzz" }],
  };
}

function rawFrag(nodeId: string): RawKmnFragment {
  return {
    nodeId,
    origin: "imported",
    sourceText: "call(someFunc)",
    reason: "call-return",
  };
}

function withRaw(ir: KeyboardIR, frags: RawKmnFragment[]): KeyboardIR {
  return { ...ir, raw: frags };
}

// ---------------------------------------------------------------------------
// A. Per-branch unit tests
// ---------------------------------------------------------------------------

describe("classifyRemovalCapabilities — per branch", () => {
  it("A1: RawKmnFragment → not-removable:opaque (keyed by frag.nodeId)", () => {
    const ir = withRaw(makeTestIR([]), [rawFrag("frag#1"), rawFrag("frag#2")]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("frag#1")).toBe("not-removable:opaque");
    expect(map.get("frag#2")).toBe("not-removable:opaque");
  });

  it("A2: context.length > 1 → not-removable:context-sensitive", () => {
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [contextSensitiveRule("rule#ctx")],
    };
    const ir = makeTestIR([group]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#ctx")).toBe("not-removable:context-sensitive");
  });

  it("A3: context(N) element → not-removable:context-sensitive", () => {
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [contextNRule("rule#ctxN")],
    };
    const ir = makeTestIR([group]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#ctxN")).toBe("not-removable:context-sensitive");
  });

  it("A4: S-02 body rule → removable:slot-fill + output-store alias", () => {
    const inputStore = makeCharStore("store#in", "dkf0060", " aAeE");
    const outputStore = makeCharStore("store#out", "dkt0060", "`àÀèÈ");
    const body = bodyRule("rule#body", 0x0060, "dkf0060", "dkt0060");

    const group: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [body],
    };
    const ir = makeTestIR([group], [inputStore, outputStore]);
    const map = classifyRemovalCapabilities(ir);

    expect(map.get("rule#body")).toBe("removable:slot-fill");
    // Output-store alias
    expect(map.get("store#out")).toBe("removable:slot-fill");
    // Input store has NO alias entry
    expect(map.has("store#in")).toBe(false);
  });

  it("A5: S-01 rule → removable:simple", () => {
    const rule = simpleRule("rule#s01", "K_Q", "ɛ");
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeTestIR([group]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#s01")).toBe("removable:simple");
  });

  it("A6: rule in 'deadkeys' group that is vkey→char (not isS01) → not-removable:unknown", () => {
    const rule = unknownRule("rule#unk");
    const group: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [rule],
    };
    const ir = makeTestIR([group]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#unk")).toBe("not-removable:unknown");
  });

  it("A7: trigger rule (vkey → dk) with context.length === 1 → not-removable:unknown (not isS01: output is deadkey, not char)", () => {
    const trigger = triggerRule("rule#trigger", "K_LBRKT", 0x005e);
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [trigger],
    };
    const ir = makeTestIR([group]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#trigger")).toBe("not-removable:unknown");
  });
});

// ---------------------------------------------------------------------------
// B. Decision-order precedence
// ---------------------------------------------------------------------------

describe("classifyRemovalCapabilities — decision-order precedence", () => {
  it("B1: opaque fires before context-sensitive (frag is not in groups)", () => {
    // A RawKmnFragment and a context-sensitive rule coexist.
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [contextSensitiveRule("rule#ctx")],
    };
    const ir = withRaw(makeTestIR([group]), [rawFrag("frag#1")]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("frag#1")).toBe("not-removable:opaque");
    expect(map.get("rule#ctx")).toBe("not-removable:context-sensitive");
  });

  it("B2: slot-fill (isBody) fires before context-sensitive check: true S-02 body → slot-fill, NOT context-sensitive", () => {
    // A rule with context.length === 2 that matches isBody() must be slot-fill,
    // NOT context-sensitive, even though context.length > 1.
    const inputStore = makeCharStore("store#in", "dkf0060", "ae");
    const outputStore = makeCharStore("store#out", "dkt0060", "àè");
    const body = bodyRule("rule#body2", 0x0060, "dkf0060", "dkt0060");
    const group: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [body],
    };
    const ir = makeTestIR([group], [inputStore, outputStore]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#body2")).toBe("removable:slot-fill");
    expect(map.get("rule#body2")).not.toBe("not-removable:context-sensitive");
  });

  it("B2b: a non-body rule with context.length > 1 → context-sensitive (not slot-fill)", () => {
    // A rule with context.length === 3 does NOT match isBody, so context-sensitive fires.
    const bogusBodyWithExtraCtx: IRRule = {
      nodeId: "rule#bogus",
      context: [
        { kind: "deadkey", id: 0x0060 },
        { kind: "any", storeRef: "dkf0060" },
        { kind: "char", value: "x" }, // extra context: makes it non-body, context-sensitive
      ],
      output: [{ kind: "index", storeRef: "dkt0060", offset: 2 }],
    };
    const inputStore = makeCharStore("store#in", "dkf0060", "ae");
    const outputStore = makeCharStore("store#out", "dkt0060", "àè");
    const group: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [bogusBodyWithExtraCtx],
    };
    const ir = makeTestIR([group], [inputStore, outputStore]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#bogus")).toBe("not-removable:context-sensitive");
  });

  it("B3: slot-fill fires before simple (S-02 body is not labelled removable:simple)", () => {
    const inputStore = makeCharStore("store#in", "dkf0060", "ae");
    const outputStore = makeCharStore("store#out", "dkt0060", "àè");
    const body = bodyRule("rule#body", 0x0060, "dkf0060", "dkt0060");
    const group: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [body],
    };
    const ir = makeTestIR([group], [inputStore, outputStore]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#body")).toBe("removable:slot-fill");
    expect(map.get("rule#body")).not.toBe("removable:simple");
  });

  it("B4: ownedByPattern S-02 escape/fallback rule inherits removable:slot-fill (not context-sensitive)", () => {
    // Build an IR with a full S-02 cluster so recognizePatterns sets ownedByPattern.
    // The fallback rule has context.length===2 (dk + char), which would trigger the
    // context-sensitive branch — BUT ownership (decision 2) must fire FIRST so the
    // fallback inherits the cluster's removable:slot-fill label instead.
    const inputStore = makeCharStore("store#in", "dkf0060", " aAeEiIoO");
    const outputStore = makeCharStore("store#out", "dkt0060", "`àÀèÈìÌòÒ");

    const trigger = triggerRule("rule#trigger", "K_7", 0x0060);
    const mainGroup: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [trigger],
    };

    const body = bodyRule("rule#body", 0x0060, "dkf0060", "dkt0060");
    // Fallback: dk(0060) + char → char — context.length===2, owned by the S-02 cluster.
    // With the old order it would be labeled not-removable:context-sensitive;
    // with the corrected order ownership wins and it inherits removable:slot-fill.
    const fallback: IRRule = {
      nodeId: "rule#fallback",
      context: [
        { kind: "deadkey", id: 0x0060 },
        { kind: "char", value: "z" },
      ],
      output: [{ kind: "char", value: "`z" }],
    };
    const deadkeysGroup: IRGroup = {
      nodeId: "group#deadkeys",
      name: "deadkeys",
      usingKeys: false,
      readonly: false,
      rules: [body, fallback],
    };

    const ir = makeTestIR([mainGroup, deadkeysGroup], [inputStore, outputStore]);
    // recognizePatterns sets ownedByPattern on trigger, body, and fallback.
    recognizePatterns(ir);

    const map = classifyRemovalCapabilities(ir);

    // Trigger: ownedByPattern → S-02 → removable:slot-fill (not removable:simple)
    expect(map.get("rule#trigger")).toBe("removable:slot-fill");
    expect(map.get("rule#trigger")).not.toBe("removable:simple");

    // Body: ownedByPattern OR isBody() → removable:slot-fill
    expect(map.get("rule#body")).toBe("removable:slot-fill");

    // Fallback: ownedByPattern fires FIRST → inherits removable:slot-fill
    // (NOT not-removable:context-sensitive, even though context.length===2)
    expect(map.get("rule#fallback")).toBe("removable:slot-fill");
    expect(map.get("rule#fallback")).not.toBe("not-removable:context-sensitive");
  });
});

// ---------------------------------------------------------------------------
// C. AC canaries — real keyboards (skipped when sibling checkout absent)
// ---------------------------------------------------------------------------

const KEYBOARDS_ROOT_B = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/b",
);

const KEYBOARDS_ROOT_SIL = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/sil",
);
const KEYBOARDS_ROOT_BASIC = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/basic",
);
const KEYBOARDS_ROOT_V = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/v",
);
const KEYBOARDS_ROOT_C = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/c",
);
const KEYBOARDS_ROOT_EL = path.resolve(
  new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
  "../../../../../keyboards/release/el",
);

const bamumPath = path.join(KEYBOARDS_ROOT_B, "bamum/source/bamum.kmn");

const cameroonPath = path.join(
  KEYBOARDS_ROOT_SIL,
  "sil_cameroon_qwerty/source/sil_cameroon_qwerty.kmn",
);
const kbdfrPath = path.join(KEYBOARDS_ROOT_BASIC, "basic_kbdfr/source/basic_kbdfr.kmn");
const kbdusPath = path.join(KEYBOARDS_ROOT_BASIC, "basic_kbdus/source/basic_kbdus.kmn");

// §7.5 regression canary paths
const silIpaPath = path.join(KEYBOARDS_ROOT_SIL, "sil_ipa/source/sil_ipa.kmn");
const vietnameseTelexPath = path.join(KEYBOARDS_ROOT_V, "vietnamese_telex/source/vietnamese_telex.kmn");
const csPinyinPath = path.join(KEYBOARDS_ROOT_C, "cs_pinyin/source/cs_pinyin.kmn");
const silYoruba8Path = path.join(KEYBOARDS_ROOT_SIL, "sil_yoruba8/source/sil_yoruba8.kmn");
const elPasifikaPath = path.join(KEYBOARDS_ROOT_EL, "el_pasifika/source/el_pasifika.kmn");

const bamumExists = fs.existsSync(bamumPath);
const cameroonExists = fs.existsSync(cameroonPath);
const kbdfrExists = fs.existsSync(kbdfrPath);
const kbdusExists = fs.existsSync(kbdusPath);
const silIpaExists = fs.existsSync(silIpaPath);
const vietnameseTelexExists = fs.existsSync(vietnameseTelexPath);
const csPinyinExists = fs.existsSync(csPinyinPath);
const silYoruba8Exists = fs.existsSync(silYoruba8Path);
const elPasifikaExists = fs.existsSync(elPasifikaPath);

describe("classifyRemovalCapabilities — AC canaries (real keyboards)", () => {
  it.skipIf(!cameroonExists)(
    "C1: sil_cameroon_qwerty S-02 body rules → removable:slot-fill + output-store alias present",
    () => {
      const kmnText = fs.readFileSync(cameroonPath, "utf-8");
      const { ir } = parse(kmnText, "sil_cameroon_qwerty");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // Find all deadkey body rules in the deadkeys group
      const deadkeysGroup = ir.groups.find((g) => g.name === "deadkeys");
      expect(deadkeysGroup).toBeDefined();

      let bodyCount = 0;
      for (const rule of deadkeysGroup!.rules) {
        const c0 = rule.context[0];
        const c1 = rule.context[1];
        const out = rule.output[0];
        const isBodyShape =
          rule.context.length === 2 &&
          c0?.kind === "deadkey" &&
          c1?.kind === "any" &&
          out?.kind === "index" &&
          out.offset === 2;

        if (!isBodyShape) continue;
        bodyCount++;

        // Rule itself → removable:slot-fill
        expect(map.get(rule.nodeId)).toBe("removable:slot-fill");

        // Output-store alias
        if (out !== undefined && out.kind === "index") {
          const outStore = ir.stores.find((s) => s.name === out.storeRef);
          expect(outStore).toBeDefined();
          expect(map.get(outStore!.nodeId)).toBe("removable:slot-fill");
        }
      }

      expect(bodyCount).toBeGreaterThan(0);
    },
  );

  it.skipIf(!kbdfrExists)(
    "C2: basic_kbdfr trigger rules (S-02) inherit removable:slot-fill via ownedByPattern",
    () => {
      const kmnText = fs.readFileSync(kbdfrPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdfr");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // basic_kbdfr has trigger rules with output = dk(id) and context.length===1 (vkey)
      // After recognizePatterns, these have ownedByPattern set to the S-02 pattern id.
      const mainGroup = ir.groups.find((g) => g.name !== "deadkeys");
      expect(mainGroup).toBeDefined();

      let triggerCount = 0;
      for (const rule of mainGroup!.rules) {
        const out = rule.output[0];
        if (rule.context.length !== 1 || out?.kind !== "deadkey") continue;
        // Trigger rule: ownedByPattern set to an S-02 pattern → removable:slot-fill
        if (rule.ownedByPattern !== undefined) {
          triggerCount++;
          expect(map.get(rule.nodeId)).toBe("removable:slot-fill");
        }
      }
      expect(triggerCount).toBeGreaterThan(0);
    },
  );

  it.skipIf(!kbdusExists)(
    "C2b: basic_kbdus direct key rules (K_A..K_Z) classify removable:simple (AC#2 canary on a genuinely simple keyboard)",
    () => {
      // basic_kbdus is a pure direct-key keyboard: 0 deadkeys, all rules are
      // `+ [MODS KEY] > U+xxxx`.  The S-01 cluster-lifting scope guard
      // (S01_MAX_DISTINCT_KEYS = 5) means recognizePatterns() does NOT claim
      // these rules, so ownedByPattern stays undefined.  classifyRemovalCapabilities
      // step 5 calls isS01() directly — a pure per-rule shape check with no key-count
      // guard — so every direct-key rule MUST still classify removable:simple.
      const kmnText = fs.readFileSync(kbdusPath, "utf-8");
      const { ir } = parse(kmnText, "basic_kbdus");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // Collect all K_A..K_Z letter rules (both lowercase and SHIFT variants).
      const LETTER_KEYS = new Set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `K_${c}`),
      );
      const mainGroup = ir.groups.find((g) => g.name === "main");
      expect(mainGroup).toBeDefined();

      let simpleCount = 0;
      for (const rule of mainGroup!.rules) {
        const ctx = rule.context[0];
        if (ctx?.kind !== "vkey" || !LETTER_KEYS.has(ctx.name)) continue;
        simpleCount++;
        expect(map.get(rule.nodeId)).toBe("removable:simple");
      }

      // basic_kbdus has K_A..K_Z × 2 modifiers (bare + SHIFT) = 52 letter rules.
      expect(simpleCount).toBeGreaterThanOrEqual(50);
    },
  );

  it.skipIf(!bamumExists)(
    "C4: Bamum fan-out rules (any(defaultK/shiftK)>index(defaultU/shiftU,1)) → removable:slot-fill + output-store alias; nul rule → not-removable:unknown",
    () => {
      const kmnText = fs.readFileSync(bamumPath, "utf-8");
      const { ir } = parse(kmnText, "bamum");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // The two fan-out rules must be slot-fill.
      const mainGroup = ir.groups.find((g) => g.name === "main");
      expect(mainGroup).toBeDefined();

      const fanOutRules = mainGroup!.rules.filter((rule) => {
        const c0 = rule.context[0];
        const out = rule.output[0];
        return (
          rule.context.length === 1 &&
          c0?.kind === "any" &&
          out?.kind === "index" &&
          out.offset === 1
        );
      });
      // Bamum has exactly two such rules: defaultK/defaultU and shiftK/shiftU.
      expect(fanOutRules.length).toBe(2);
      for (const rule of fanOutRules) {
        expect(map.get(rule.nodeId)).toBe("removable:slot-fill");
        // Output-store alias must be present.
        const outEl = rule.output[0];
        if (outEl !== undefined && outEl.kind === "index") {
          const outStore = ir.stores.find((s) => s.name === outEl.storeRef);
          expect(outStore).toBeDefined();
          expect(map.get(outStore!.nodeId)).toBe("removable:slot-fill");
        }
      }

      // The `+ any(nul) > nul` rule has a char output, not an index — must be unknown.
      const nullRule = mainGroup!.rules.find((rule) => {
        const c0 = rule.context[0];
        const out = rule.output[0];
        return c0?.kind === "any" && out?.kind !== "index";
      });
      expect(nullRule).toBeDefined();
      expect(map.get(nullRule!.nodeId)).toBe("not-removable:unknown");
    },
  );

  it("C3: RawKmnFragment fixture → not-removable:opaque", () => {
    const frag = rawFrag("frag#opaque-1");
    const ir = withRaw(makeTestIR([]), [frag]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("frag#opaque-1")).toBe("not-removable:opaque");
  });
});

// ---------------------------------------------------------------------------
// D. §7.5 regression canaries (real keyboards, skipIf when absent)
// ---------------------------------------------------------------------------

describe("classifyRemovalCapabilities — §7.5 regression canaries", () => {
  it.skipIf(!silIpaExists)(
    "D1: sil_ipa S-03 rules classify not-removable:context-sensitive",
    () => {
      const kmnText = fs.readFileSync(silIpaPath, "utf-8");
      const { ir } = parse(kmnText, "sil_ipa");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // sil_ipa has multi-element-context rules (S-03 shape) — at least one must
      // classify as not-removable:context-sensitive.
      let found = false;
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if (map.get(rule.nodeId) === "not-removable:context-sensitive") {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      expect(found).toBe(true);
    },
  );

  it.skipIf(!vietnameseTelexExists)(
    "D2: vietnamese_telex S-07 context rules classify not-removable:context-sensitive",
    () => {
      const kmnText = fs.readFileSync(vietnameseTelexPath, "utf-8");
      const { ir } = parse(kmnText, "vietnamese_telex");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // vietnamese_telex uses S-07 (context-based tone marking) — at least one rule
      // must carry not-removable:context-sensitive.
      let found = false;
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if (map.get(rule.nodeId) === "not-removable:context-sensitive") {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      expect(found).toBe(true);
    },
  );

  it.skipIf(!csPinyinExists)(
    "D3: cs_pinyin call(...) rules are RawKmnFragment → not-removable:opaque",
    () => {
      const kmnText = fs.readFileSync(csPinyinPath, "utf-8");
      const { ir } = parse(kmnText, "cs_pinyin");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // cs_pinyin uses call() which the codec can't model → RawKmnFragment entries.
      // At least one fragment must be labeled not-removable:opaque.
      expect(ir.raw.length).toBeGreaterThan(0);
      for (const frag of ir.raw) {
        expect(map.get(frag.nodeId)).toBe("not-removable:opaque");
      }
    },
  );

  it.skipIf(!silYoruba8Exists)(
    "D4: sil_yoruba8 if()/set() rules are RawKmnFragment → not-removable:opaque",
    () => {
      const kmnText = fs.readFileSync(silYoruba8Path, "utf-8");
      const { ir } = parse(kmnText, "sil_yoruba8");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // sil_yoruba8 uses if()/set() directives → RawKmnFragment entries.
      // At least one fragment must be labeled not-removable:opaque.
      expect(ir.raw.length).toBeGreaterThan(0);
      for (const frag of ir.raw) {
        expect(map.get(frag.nodeId)).toBe("not-removable:opaque");
      }
    },
  );

  it.skipIf(!elPasifikaExists)(
    "D5: el_pasifika — bare-any rules classify removable:slot-fill; opaque fragments are opaque; no typed rule gets both slot-fill and context-sensitive",
    () => {
      // el_pasifika uses bare-any fan-out rules like [any(coreKeys)]>index(coreChars,1).
      // These have context.length===1 and offset===1 → isParallelIndexFanOut PASSES →
      // removable:slot-fill (correct: whole-layout transliteration the studio can carve).
      // The any(vowelChars)+any(macronKeys)>index(...) style rules in the source have
      // any() as a context prefix — the codec cannot model this and emits them as
      // RawKmnFragments (opaque).  Any typed rule with context.length > 1 must be
      // context-sensitive (not slot-fill) because isParallelIndexFanOut requires
      // all pre-terminal elements to be deadkey.
      const kmnText = fs.readFileSync(elPasifikaPath, "utf-8");
      const { ir } = parse(kmnText, "el_pasifika");
      recognizePatterns(ir);
      const map = classifyRemovalCapabilities(ir);

      // No typed rule must carry BOTH removable:slot-fill AND be multi-any
      // (the predicate rejects pre-terminal any() elements).
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if (rule.context.length >= 2) {
            const preterminals = rule.context.slice(0, -1);
            const hasNonDeadkeyPreTerminal = preterminals.some((el) => el.kind !== "deadkey");
            if (hasNonDeadkeyPreTerminal) {
              // Must NOT be slot-fill — pre-terminal non-deadkey rejects isParallelIndexFanOut.
              expect(map.get(rule.nodeId)).not.toBe("removable:slot-fill");
            }
          }
        }
      }

      // At least one typed rule must be labeled not-removable:context-sensitive
      // (el_pasifika has context-dependent rules in the constraints group).
      let contextSensitiveCount = 0;
      for (const group of ir.groups) {
        for (const rule of group.rules) {
          if (map.get(rule.nodeId) === "not-removable:context-sensitive") {
            contextSensitiveCount++;
          }
        }
      }
      expect(contextSensitiveCount).toBeGreaterThan(0);

      // RawKmnFragment entries (if(platform) rules, etc.) must be opaque.
      for (const frag of ir.raw) {
        expect(map.get(frag.nodeId)).toBe("not-removable:opaque");
      }
    },
  );
});

// ---------------------------------------------------------------------------
// E. Fan-out predicate regression — hand-built shapes
// ---------------------------------------------------------------------------

describe("classifyRemovalCapabilities — isParallelIndexFanOut regression", () => {
  it("E1: context(N) any(S) > index(OUT, 2) (pre-terminal is context(), not deadkey) → not-removable:context-sensitive (NOT slot-fill)", () => {
    // A rule whose pre-terminal element is context() fails isParallelIndexFanOut
    // (pre-terminal must be deadkey). With context.length===2 it also triggers
    // the context-sensitive branch (context.length > 1).  Regression guard: the
    // introduction of Decision 3b must NOT promote this rule to slot-fill.
    const rule: IRRule = {
      nodeId: "rule#ctx-any",
      context: [
        { kind: "context", offset: 1 },
        { kind: "any", storeRef: "someStore" },
      ],
      output: [{ kind: "index", storeRef: "outStore", offset: 2 }],
    };
    const group: IRGroup = {
      nodeId: "group#main",
      name: "main",
      usingKeys: true,
      readonly: false,
      rules: [rule],
    };
    const ir = makeTestIR([group]);
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#ctx-any")).toBe("not-removable:context-sensitive");
    expect(map.get("rule#ctx-any")).not.toBe("removable:slot-fill");
  });

  it("E2: bare-any rule [any(S)] > index(OUT, 1) → removable:slot-fill + output-store alias (Decision-3b, ungated)", () => {
    const rule: IRRule = {
      nodeId: "rule#bare-any",
      context: [{ kind: "any", storeRef: "defaultU_in" }],
      output: [{ kind: "index", storeRef: "defaultU", offset: 1 }],
    };
    const outputStore: IRStore = { nodeId: "store#defaultU", name: "defaultU", items: [], isSystem: false };
    const group: IRGroup = { nodeId: "group#main", name: "main", usingKeys: true, readonly: false, rules: [rule] };
    const ir = { ...makeTestIR([group]), stores: [outputStore] };
    const map = classifyRemovalCapabilities(ir);
    expect(map.get("rule#bare-any")).toBe("removable:slot-fill");
    expect(map.get("store#defaultU")).toBe("removable:slot-fill");
  });
});
