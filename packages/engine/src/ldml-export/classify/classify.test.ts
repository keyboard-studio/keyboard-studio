import { describe, expect, it } from "vitest";
import { parse } from "../../codec/index.js";
import { AZERTY_BASE } from "../__fixtures__/azerty-base.js";
import { classifyFixture, fixtureIr } from "../__fixtures__/helpers.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import { resolveLdmlProfile } from "../profiles/resolve.js";
import type { CompatibilityItem, LdmlBaseLayout, LdmlClassification } from "../types.js";
import { classifyForLdml } from "./classify.js";

const HEAD = `store(&NAME) 'T'
store(&KEYBOARDVERSION) '1.0'
store(&TARGETS) 'any'
begin Unicode > use(main)
store(vowels) 'aeiou'
store(accented) 'áéíóú'
store(short) 'ab'
store(keys) [K_A] [K_B]
store(out) 'xy'
store(opt) '0'
store(prec) 'é'
store(multi) 'ab' 'cd'
group(main) using keys
`;

function classify(
  src: string,
  opts: { profile?: "46" | "49"; base?: LdmlBaseLayout; extra?: string } = {},
): LdmlClassification {
  const { ir } = parse((opts.extra ?? "") + HEAD + src, "t");
  return classifyForLdml(
    { ir, touchLayout: null, visualKeyboard: null, baseLayout: opts.base ?? US_BASE },
    resolveLdmlProfile(opts.profile ?? "46"),
    { languages: ["en"] },
  );
}

const rows = (c: LdmlClassification): string[] => c.items.map((i) => i.rowId);
const find = (c: LdmlClassification, rowId: string): CompatibilityItem | undefined => c.items.find((i) => i.rowId === rowId);

describe("classifyForLdml: one assertion per mapping row (sections 1-4 and 6)", () => {
  // Each case: a KMN rule body, the row that must be present, and its status.
  const cases: { row: string; kmn: string; status: "M" | "A" | "N"; code?: string }[] = [
    { row: "2.1", kmn: "+ [K_A] > 'x'\n", status: "M" },
    { row: "2.2", kmn: "+ [K_oE2] > 'x'\n", status: "M" },
    { row: "2.5", kmn: "+ [K_F1] > 'x'\n", status: "N", code: "KM_LINT_LDML_FRAME_KEY" },
    { row: "2.6", kmn: "+ 'a' > 'x'\n", status: "M" },
    { row: "2.9", kmn: "+ [SHIFT K_A] > 'x'\n", status: "M" },
    { row: "2.10", kmn: "+ [RALT K_A] > 'x'\n", status: "M" },
    { row: "2.11", kmn: "+ [LCTRL K_A] > 'x'\n", status: "M" },
    { row: "2.12", kmn: "+ [RSHIFT K_A] > 'x'\n", status: "A", code: "KM_LINT_LDML_SHIFT_SIDE" },
    { row: "2.13", kmn: "+ [CAPS K_A] > 'x'\n", status: "M" },
    { row: "2.14", kmn: "+ [K_A] > 'x'\n", status: "M" },
    { row: "2.18", kmn: "'x' + [K_BKSP] > 'y'\n", status: "M" },
    { row: "2.19", kmn: "+ [SHIFT K_BKSP] > 'y'\n", status: "N", code: "KM_LINT_LDML_FRAME_KEY" },
    { row: "2.20", kmn: "+ [K_SPACE] > 'x'\n", status: "M" },
    { row: "2.21", kmn: "+ [T_FOO] > 'x'\n", status: "N", code: "KM_LINT_LDML_FRAME_KEY" },
    { row: "2.22", kmn: "+ [NUMLOCK K_A] > 'x'\n", status: "N", code: "KM_LINT_LDML_MODIFIER" },
    { row: "2.23", kmn: "+ [LCTRL RALT K_A] > 'x'\n", status: "A", code: "KM_LINT_LDML_MODIFIER_SIDES" },
    { row: "2.24", kmn: "+ [K_BKSP] > 'x'\n", status: "N", code: "KM_LINT_LDML_BKSP_NO_CONTEXT" },
    { row: "2.25", kmn: "+ any(keys) > index(out, 1)\n", status: "M" },
    { row: "3.1", kmn: "'a' + [K_E] > 'x'\n", status: "M" },
    { row: "3.3", kmn: "+ [K_A] > dk(a1)\n", status: "M" },
    { row: "3.6", kmn: "any(vowels) + [K_E] > 'x'\n", status: "M" },
    { row: "3.7", kmn: "any(vowels) + [K_E] > index(accented, 1)\n", status: "M" },
    { row: "3.8", kmn: "any(vowels) + [K_E] > 'q' index(accented, 1)\n", status: "M" },
    { row: "3.9", kmn: "any(vowels) any(vowels) any(vowels) any(vowels) any(vowels) any(vowels) + [K_E] > index(vowels,1) index(vowels,2) index(vowels,3) index(vowels,4) index(vowels,5) index(vowels,6)\n", status: "N", code: "KM_LINT_LDML_EXPANSION_LIMIT" },
    { row: "3.10", kmn: "notany(vowels) + [K_E] > 'x'\n", status: "M" },
    { row: "3.12", kmn: "'a' + [K_E] > context\n", status: "M" },
    { row: "3.15a", kmn: "+ [K_Q] > nul\n", status: "M" },
    { row: "3.15b", kmn: "'a' + [K_E] > nul\n", status: "M" },
    { row: "3.16", kmn: "+ [K_W] > beep\n", status: "M", code: "KM_LINT_LDML_BEEP" },
    { row: "3.17", kmn: "if(opt = '1') + [K_A] > 'x'\n", status: "A", code: "KM_LINT_LDML_OPTION_STATE" },
    { row: "3.19", kmn: "platform('touch') + [K_A] > 'x'\n", status: "A", code: "KM_LINT_LDML_PLATFORM_CONDITION" },
    { row: "3.20", kmn: "baselayout('kbdus') + [K_A] > 'x'\n", status: "A", code: "KM_LINT_LDML_BASELAYOUT_CONDITION" },
    { row: "3.23", kmn: "+ [K_A] > 'a' U+0301\n", status: "A", code: "KM_LINT_LDML_NORMALIZATION" },
    { row: "3.24", kmn: "nul + [K_A] > 'x'\n", status: "A", code: "KM_LINT_LDML_CONTEXT_START" },
    { row: "3.21", kmn: "+ [K_A] > 'x' layer('shift') 'y'\n", status: "N", code: "KM_LINT_LDML_LAYER_STATE" },
  ];

  for (const c of cases) {
    it(`row ${c.row}`, () => {
      const r = classify(c.kmn);
      const hit = r.items.find((i) => i.rowId === c.row && (c.code === undefined || i.code === c.code));
      expect(hit, `row ${c.row} in ${rows(r).join(",")}`).toBeDefined();
      expect(hit?.status).toBe(c.status);
      if (c.code !== undefined) expect(hit?.code).toBe(c.code);
    });
  }

  it("row 2.4: a key not on the chosen form", () => {
    const r = classify("+ [K_oE2] > 'x'\n+ [K_oE0] > 'y'\n");
    expect(find(r, "2.4")?.code).toBe("KM_LINT_LDML_FORM_KEY_MISSING");
  });

  it("row 2.7: a character keystroke on a mnemonic keyboard", () => {
    const r = classify("+ 'a' > 'x'\n", { extra: "store(&MNEMONICLAYOUT) '1'\n" });
    expect(r.items.some((i) => i.rowId === "2.7" && i.code === "KM_LINT_LDML_MNEMONIC")).toBe(true);
    expect(find(r, "4.14")?.status).toBe("A");
  });

  it("row 2.26: one hint per layer and position where the base has a dead key and no rule covers it", () => {
    const r = classify("+ [K_A] > 'x'\n", { base: AZERTY_BASE });
    const hits = r.items.filter((i) => i.rowId === "2.26");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((i) => i.code === "KM_LINT_LDML_BASE_DEADKEY" && i.severity === "hint" && i.side === "hardware")).toBe(true);
    expect(hits.every((i) => /^base:[^/]+\/K_[A-Za-z0-9]+$/.test(i.nodeKey))).toBe(true);
    expect(classify("+ [K_A] > 'x'\n", { base: US_BASE }).items.some((i) => i.rowId === "2.26")).toBe(false);
  });

  it("row 2.26 is silent where a rule covers the position", () => {
    const r = classify("+ [K_LBRKT] > 'x'\n+ [SHIFT K_LBRKT] > 'y'\n", { base: AZERTY_BASE });
    expect(r.items.filter((i) => i.rowId === "2.26" && i.nodeKey.endsWith("/K_LBRKT") && /^base:(none|shift|caps|shift caps)\//.test(i.nodeKey))).toEqual([]);
  });

  it("row 3.4: a deadkey matched but never output is dropped", () => {
    const r = classify("dk(never) + [K_A] > 'x'\n");
    const i = find(r, "3.4");
    expect(i?.code).toBe("KM_LINT_LDML_UNREACHABLE");
    expect(i?.status).toBe("N");
  });

  it("row 3.10: a precomposed class item is N", () => {
    const r = classify("notany(prec) + [K_A] > 'x'\n");
    expect(r.items.some((i) => i.rowId === "3.10" && i.status === "N" && i.code === "KM_LINT_LDML_NEGATED_CLASS")).toBe(true);
  });

  it("row 3.22: contexts equal under NFD with different outputs", () => {
    const r = classify("'e' U+0301 + [K_A] > 'x'\nU+00E9 + [K_A] > 'y'\n");
    expect(r.items.filter((i) => i.rowId === "3.22")).toHaveLength(2);
  });

  it("row 3.13: more than nine captures", () => {
    const ctx = Array.from({ length: 10 }, () => "'a'").join(" ");
    const out = Array.from({ length: 10 }, (_, k) => `context(${k + 1})`).join(" ");
    expect(classify(`${ctx} + [K_A] > ${out}\n`).items.some((i) => i.rowId === "3.13")).toBe(true);
  });

  // A draft saved before `set` / `call` were typed holds these rules as fragments; the
  // classifier keeps routing them by reason.
  it("row 3.18 and 1.12: a persisted fragment routes by reason, one item each", () => {
    const { ir } = parse(HEAD + "+ [K_A] > 'x'\n", "t");
    ir.raw.push(
      { nodeId: "f1", origin: "imported", sourceText: "+ [K_A] > set(opt = '1')", reason: "option-store-directive", sourceLine: 90 },
      { nodeId: "f2", origin: "imported", sourceText: "+ [K_B] > call(other)", reason: "call-return", sourceLine: 91 },
    );
    const r = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
    const frags = r.items.filter((i) => i.nodeKey.startsWith("fragment#"));
    expect(frags.map((i) => i.rowId).sort()).toEqual(["1.12", "3.18"]);
    expect(frags.find((i) => i.rowId === "3.18")?.params["reason"]).toBe("option-store-directive");
    expect(frags.find((i) => i.rowId === "1.12")?.code).toBe("KM_LINT_LDML_CALL");
  });

  // Before and after typing: the same construct gives the same row, code, status, severity
  // and reason, whether the IR holds a fragment or the typed rule. Only the node key differs.
  it("row 3.18 and 1.12: the typed rule gives the verdict its fragment gave", () => {
    const typed = classify("+ [K_A] > set(opt = '1')\n+ [K_B] > call(other)\n+ [K_C] > save(opt)\n+ [K_D] > return\n");
    expect(typed.items.some((i) => i.nodeKey.startsWith("fragment#"))).toBe(false);
    const verdict = (i: CompatibilityItem) => [i.rowId, i.code, i.status, i.severity, i.params["reason"]];
    const lines = typed.items.filter((i) => i.rowId === "3.18" || i.rowId === "1.12").map((i) => i.line);
    expect(lines).toHaveLength(4);
    const as = (reason: string, rowId: string) => {
      const { ir } = parse(HEAD + "+ [K_A] > 'x'\n", "t");
      ir.raw.push({ nodeId: "f", origin: "imported", sourceText: "x", reason, sourceLine: 90, groupNodeId: (ir.groups[0] as { nodeId: string }).nodeId });
      const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
      return verdict(c.items.find((i) => i.nodeKey.startsWith("fragment#") && i.rowId === rowId) as CompatibilityItem);
    };
    const set = typed.items.find((i) => i.rowId === "3.18") as CompatibilityItem;
    const call = typed.items.find((i) => i.rowId === "1.12") as CompatibilityItem;
    expect(verdict(set)).toEqual(as("option-store-directive", "3.18"));
    expect(verdict(call)).toEqual(as("call-return", "1.12"));
  });

  // layer() and platform() in the IR as typed members, or as the raw elements an older
  // draft holds: identical classifier output.
  it("rows 3.21 and 3.19: typed layer and platform classify as their raw forms did", () => {
    const run = (typedForm: boolean) => {
      const { ir } = parse(HEAD + "platform('touch') + [K_A] > 'x'\n+ [K_B] > layer('shift')\n", "t");
      if (!typedForm) {
        for (const r of ir.groups[0]?.rules ?? []) {
          r.context = r.context.map((el) => (el.kind === "platform" ? { kind: "raw", text: `platform('${el.value}')` } : el));
          r.output = r.output.map((el) => (el.kind === "layer" ? { kind: "raw", text: `layer('${el.value}')` } : el));
        }
      }
      const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
      return c.items.map((i) => [i.siteKey, i.rowId, i.status, i.code, i.severity, i.params]);
    };
    expect(run(true)).toEqual(run(false));
    expect(run(true).some((x) => x[1] === "3.19")).toBe(true);
    expect(run(true).some((x) => x[1] === "3.21")).toBe(true);
  });

  it("row 6.1: an unrecognised fragment reason is OPAQUE and names its reason", () => {
    const ir = fixtureIr("all-opaque.kmn", "t");
    ir.raw.push({ nodeId: "x", origin: "imported", sourceText: "weird", reason: "never-heard-of", sourceLine: 99 });
    const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
    const hit = c.items.find((i) => i.nodeKey === `fragment#${ir.raw.length - 1}`);
    expect(hit?.rowId).toBe("6.1");
    expect(hit?.code).toBe("KM_LINT_LDML_OPAQUE");
    expect(hit?.params["reason"]).toBe("never-heard-of");
  });

  it("an unknown system store is an OPAQUE item (FR-008)", () => {
    const c = classify("+ [K_A] > 'x'\n", { extra: "store(&FROBNICATE) 'q'\n" });
    expect(c.items.some((i) => i.rowId === "6.2" && i.code === "KM_LINT_LDML_OPAQUE")).toBe(true);
  });

  it("row 1.2: ANSI only", () => {
    const c = classifyFixture("ansi-only.kmn");
    expect(c.ansiOnly).toBe(true);
    expect(find(c, "1.2")?.code).toBe("KM_LINT_LDML_ANSI_ONLY");
  });

  it("rows 4.1-4.16 from the header stores", () => {
    const extra = [
      "store(&COPYRIGHT) '(c)'", "store(&BITMAP) 'x.ico'", "store(&HOTKEY) 'x'",
      "store(&CASEDKEYS) [K_A]", "store(&CAPSALWAYSOFF) '1'",
    ].join("\n") + "\n";
    const c = classify("+ [K_A] > 'x'\n", { extra });
    expect(find(c, "4.1")?.status).toBe("M");
    expect(find(c, "4.3")?.status).toBe("M");
    expect(find(c, "4.6")?.status).toBe("M");
    expect(c.items.find((i) => i.rowId === "4.9")?.code).toBe("KM_LINT_LDML_METADATA_PACKAGE_ONLY");
    expect(c.items.find((i) => i.rowId === "4.11")?.code).toBe("KM_LINT_LDML_METADATA_PACKAGE_ONLY");
    expect(c.items.find((i) => i.rowId === "4.12")?.code).toBe("KM_LINT_LDML_HEADER_UNSUPPORTED");
    expect(find(c, "4.13")?.status).toBe("M");
    expect(find(c, "2.15")?.code).toBe("KM_LINT_LDML_CAPS_MODE");
  });

  it("row 4.10 takes its status from the profile row: K in 46, M in 49", () => {
    const { ir } = parse(HEAD + "+ [K_A] > 'x'\n", "t");
    const input = { ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE };
    const in46 = classifyForLdml(input, resolveLdmlProfile("46"), { attribution: true });
    const in49 = classifyForLdml(input, resolveLdmlProfile("49"), { attribution: true });
    expect(find(in46, "4.10")?.status).toBe("K");
    expect(find(in49, "4.10")?.status).toBe("M");
    expect(find(in49, "4.10")?.code).toBeNull();
  });

  it("row 4.16: no language tag", () => {
    const { ir } = parse(HEAD + "+ [K_A] > 'x'\n", "t");
    const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"), { languages: [] });
    expect(find(c, "4.16")?.code).toBe("KM_LINT_LDML_NO_LOCALE");
  });
});

describe("classifyForLdml: group rows (1.x)", () => {
  const calls = (extra: string) => classify("+ [K_A] > use(g2)\n+ [K_B] > use(g2)\nnomatch > use(g2)\n\ngroup(g2)\n'a' > 'b'\n" + extra);

  it("1.1 entry group and 1.5 a group reached on every path", () => {
    const c = calls("");
    expect(c.items.some((i) => i.rowId === "1.1")).toBe(true);
    expect(c.items.some((i) => i.rowId === "1.5" && i.nodeKey === "group:g2#group")).toBe(true);
  });

  it("1.6 a group reached on some paths is A", () => {
    const c = classify("+ [K_A] > use(g2)\n+ [K_B] > 'b'\n\ngroup(g2)\n'a' > 'b'\n");
    const i = c.items.find((x) => x.rowId === "1.6" && x.nodeKey.startsWith("group:g2"));
    expect(i?.status).toBe("A");
    expect(i?.code).toBe("KM_LINT_LDML_GROUP_CHAIN_PARTIAL");
  });

  it("1.7 a keystroke group called from a keystroke group", () => {
    const c = classify("+ [K_A] > use(g2)\n\ngroup(g2) using keys\n+ [K_B] > 'b'\n");
    expect(c.items.some((i) => i.rowId === "1.7" && i.status === "A")).toBe(true);
  });

  it("1.8 a match/nomatch rule that only calls a group; 1.9 one with literal output", () => {
    expect(calls("").items.some((i) => i.rowId === "1.8")).toBe(true);
    const c = classify("+ [K_A] > 'x'\nnomatch > 'q'\n");
    expect(c.items.find((i) => i.rowId === "1.9")?.code).toBe("KM_LINT_LDML_MATCH_NOMATCH_OUTPUT");
  });

  it("1.11 an unreachable group is a hint", () => {
    const c = classify("+ [K_A] > 'x'\n\ngroup(lost)\n'a' > 'b'\n");
    const i = c.items.find((x) => x.rowId === "1.11" && x.nodeKey === "group:lost#group");
    expect(i?.code).toBe("KM_LINT_LDML_UNREACHABLE");
    expect(i?.severity).toBe("hint");
  });

  it("1.3, 1.4 and 1.10: NewContext and PostKeystroke groups are N", () => {
    const c = classifyFixture("options-postkeystroke.kmn");
    const post = c.items.filter((i) => i.rowId === "1.4b");
    expect(post.length).toBe(1);
    expect(post.every((i) => i.status === "N" && i.code === "KM_LINT_LDML_NO_KEY_TRIGGER")).toBe(true);
    expect(c.items.some((i) => i.rowId === "1.4")).toBe(false);
    const nc = classify("+ [K_A] > 'x'\n\ngroup(NewContext) readonly\nnul > layer('shift')\nnomatch > layer('default')\n", {
      extra: "begin NewContext > use(NewContext)\n",
    });
    expect(nc.items.some((i) => i.rowId === "1.4b" && i.nodeKey === "behaviour:start-of-field")).toBe(true);
  });

  it("1.12 call(): the fragment reason selects the row", () => {
    expect(classify("+ [K_A] > call(x)\n").items.some((i) => i.rowId === "1.12")).toBe(true);
  });
});

describe("classifyForLdml: invariants", () => {
  it("every rule, store and group yields at least one item", () => {
    const ir = fixtureIr("plain.kmn", "plain");
    const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"), { languages: ["en"] });
    ir.groups.forEach((g) => {
      expect(c.items.some((i) => i.nodeKey === `group:${g.name}#group`)).toBe(true);
      g.rules.forEach((_r, k) => expect(c.items.some((i) => i.nodeKey === `group:${g.name}#${k}`), `rule ${k}`).toBe(true));
    });
    for (const s of ir.stores.filter((x) => !x.isSystem)) {
      expect(c.items.some((i) => i.nodeKey === `store:${s.name}`)).toBe(true);
    }
  });

  it("every RawKmnFragment yields exactly one item", () => {
    const ir = fixtureIr("all-opaque.kmn", "t");
    const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
    ir.raw.forEach((_f, k) => expect(c.items.filter((i) => i.nodeKey === `fragment#${k}`)).toHaveLength(1));
  });

  it("N KM_LINT_LDML_OPAQUE for a construct with no row, one per site (FR-008)", () => {
    const { ir } = parse(HEAD + "+ [K_A] > 'x'\n+ [K_B] > 'x'\n", "t");
    for (const r of ir.groups[0]?.rules ?? []) r.output.push({ kind: "raw", text: "mystery(1)" });
    const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
    const hits = c.items.filter((i) => i.code === "KM_LINT_LDML_OPAQUE" && i.rowId === "6.2");
    expect(hits).toHaveLength(2);
    expect(hits.every((i) => i.status === "N" && i.severity === "warning")).toBe(true);
  });

  it("row 3.11: notany() over multi-character items is N", () => {
    const { ir } = parse(HEAD + "notany(vowels) + [K_E] > 'x'\n", "t");
    const s = ir.stores.find((x) => x.name === "vowels");
    if (s) s.items = [{ kind: "char", value: "ab" }];
    const c = classifyForLdml({ ir, touchLayout: null, visualKeyboard: null, baseLayout: US_BASE }, resolveLdmlProfile("46"));
    expect(c.items.find((i) => i.rowId === "3.11")?.code).toBe("KM_LINT_LDML_NOTANY_MULTI");
  });

  it("severity is warning for a rule and hint for anything else (FR-010)", () => {
    const c = classify("+ [K_F1] > 'x'\n", { extra: "store(&HOTKEY) 'x'\nstore(&BITMAP) 'a'\n" });
    expect(c.items.find((i) => i.rowId === "2.5")?.severity).toBe("warning");
    expect(c.items.find((i) => i.rowId === "4.12")?.severity).toBe("hint");
    expect(c.items.find((i) => i.rowId === "4.11")?.severity).toBe("hint");
  });

  it("siteKey and nodeKey are formed as the data model says", () => {
    const c = classify("+ [K_F1] > 'x'\n");
    const i = c.items.find((x) => x.rowId === "2.5") as CompatibilityItem;
    expect(i.nodeKey).toMatch(/^group:main#\d+$/);
    expect(i.siteKey).toBe(`${i.code}|${i.rowId}|${i.nodeKey}`);
    const frag = classify("if(opt <> '1') + [K_A] > 'x'\n").items.find((x) => x.nodeKey.startsWith("fragment#"));
    expect(frag?.nodeKey).toMatch(/^fragment#\d+$/);
    expect(classify("+ [K_A] > 'x'\n", { extra: "store(&HOTKEY) 'x'\n" }).items.some((x) => x.nodeKey === "store:HOTKEY")).toBe(true);
  });

  it("items are sorted by siteKey and the result is frozen", () => {
    const c = classifyFixture("reread-rows.kmn");
    const keys = c.items.map((i) => i.siteKey);
    expect(keys).toEqual([...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    expect(Object.isFrozen(c)).toBe(true);
    expect(Object.isFrozen(c.items)).toBe(true);
    expect(Object.isFrozen(c.items[0])).toBe(true);
    expect(() => {
      (c.items as CompatibilityItem[]).push(c.items[0] as CompatibilityItem);
    }).toThrow();
  });

  it("is deterministic: classifying twice gives equal results", () => {
    expect(classifyFixture("plain.kmn")).toEqual(classifyFixture("plain.kmn"));
  });

  it("plain.kmn loses nothing", () => {
    const c = classifyFixture("plain.kmn");
    expect(c.counts.A).toBe(0);
    expect(c.counts.N).toBe(0);
  });

  it("reads status, code and severity from the profile only (FR-061)", () => {
    // Profile 49 differs from 46 only in row 4.10; every other item is identical.
    const a = classifyFixture("reread-rows.kmn", "46");
    const b = classifyFixture("reread-rows.kmn", "49");
    expect(a.items.map((i) => i.siteKey)).toEqual(b.items.map((i) => i.siteKey));
  });
});
