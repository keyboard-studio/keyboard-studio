/**
 * #2633 — Keyman 19-deprecated .kmn forms are rewritten to modern
 * equivalents on parse, and emit never writes them back.
 *
 * Three form classes:
 *   1. Header statements (NAME, VERSION, ...) → matching system store,
 *      except LANGUAGE / LAYOUT / BITMAPS, which are dropped.
 *   2. Legacy value formats (d### / x### / octal ###) → U+XXXX.
 *   3. Target-selector prefixes ($keyman: / $keymanweb: / $keymanonly:)
 *      → dropped / platform() guards / merged stores.
 *
 * Every rewrite is recorded in ParseResult.rewrites so the import can show
 * it in the as-built notes.
 */

import { describe, expect, it } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { normaliseForComparison } from "./normalise-ir.js";
import type { DeprecatedRewriteKind } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/** A minimal keyboard: prelude lines, then begin + a using-keys group. */
function kmn(prelude: string, body = ""): string {
  return `${prelude}begin Unicode > use(main)\n\ngroup(main) using keys\n\n${body}\n`;
}

function stdPrelude(): string {
  return `store(&VERSION) '10.0'\nstore(&NAME) 'Test'\n`;
}

function rewritesOf(
  result: ReturnType<typeof parse>,
  kind: DeprecatedRewriteKind,
) {
  return result.rewrites.filter((r) => r.kind === kind);
}

function hasDeprecatedForm(text: string): boolean {
  // Header statements, legacy value formats, target-selector prefixes.
  return (
    /^(NAME|VERSION|COPYRIGHT|HOTKEY|BITMAP|BITMAPS|LANGUAGE|LAYOUT|MESSAGE)\s/m.test(text) ||
    /(?:^|\s)(?:d\d{1,3}|x[0-9a-fA-F]{1,4}|\d{1,3})(?:\s|$)/m.test(text) ||
    /\$keyman(?:web|only)?:/.test(text)
  );
}

// ---------------------------------------------------------------------------
// 1. Header statements
// ---------------------------------------------------------------------------

describe("deprecated header statements", () => {
  it("NAME becomes store(&NAME)", () => {
    const result = parse(kmn(`store(&VERSION) '10.0'\nNAME "Foo"\n`), "kb");
    const store = result.ir.stores.find((s) => s.name === "NAME");
    expect(store).toBeDefined();
    expect(store?.items).toEqual([
      { kind: "char", value: "F" },
      { kind: "char", value: "o" },
      { kind: "char", value: "o" },
    ]);
    expect(result.ir.header.name).toBe("Foo");
    const rw = rewritesOf(result, "header-statement");
    expect(rw).toHaveLength(1);
    expect(rw[0]).toMatchObject({
      sourceText: `NAME "Foo"`,
      rewrittenText: `store(&NAME) 'Foo'`,
    });
    const emitted = emit(result.ir);
    expect(emitted).toContain(`store(&NAME) 'Foo'`);
    expect(emitted).not.toMatch(/^NAME\s/m);
  });

  it("VERSION becomes store(&VERSION), not store(&KEYBOARDVERSION)", () => {
    const result = parse(kmn(`VERSION 10.0\n`), "kb");
    const store = result.ir.stores.find((s) => s.name === "VERSION");
    expect(store).toBeDefined();
    expect(result.ir.header.version).toBe("10.0");
    expect(result.ir.stores.find((s) => s.name === "KEYBOARDVERSION")).toBeUndefined();
    expect(rewritesOf(result, "header-statement")).toHaveLength(1);
    expect(emit(result.ir)).toContain(`store(&VERSION) '10.0'`);
  });

  it("COPYRIGHT, MESSAGE and BITMAP become stores", () => {
    const result = parse(
      kmn(`store(&VERSION) '10.0'\nCOPYRIGHT "Me 2026"\nMESSAGE "Hello"\nBITMAP "x.bmp"\n`),
      "kb",
    );
    expect(result.ir.header.copyright).toBe("Me 2026");
    const emitted = emit(result.ir);
    expect(emitted).toContain(`store(&COPYRIGHT) 'Me 2026'`);
    expect(emitted).toContain(`store(&MESSAGE) 'Hello'`);
    expect(emitted).toContain(`store(&BITMAP) 'x.bmp'`);
    expect(rewritesOf(result, "header-statement")).toHaveLength(3);
  });

  it('HOTKEY "^%A" becomes store(&HOTKEY) [CTRL ALT K_A]', () => {
    const result = parse(kmn(`store(&VERSION) '10.0'\nHOTKEY "^%A"\n`), "kb");
    const store = result.ir.stores.find((s) => s.name === "HOTKEY");
    expect(store?.items).toEqual([{ kind: "raw", text: "[CTRL ALT K_A]" }]);
    expect(emit(result.ir)).toContain(`store(&HOTKEY) [CTRL ALT K_A]`);
    expect(rewritesOf(result, "header-statement")[0]).toMatchObject({
      sourceText: `HOTKEY "^%A"`,
      rewrittenText: `store(&HOTKEY) [CTRL ALT K_A]`,
    });
  });

  it("an already-bracketed HOTKEY passes through verbatim", () => {
    const result = parse(
      kmn(`store(&VERSION) '10.0'\nHOTKEY "[Alt Shift K_PAUSE]"\n`),
      "kb",
    );
    const store = result.ir.stores.find((s) => s.name === "HOTKEY");
    expect(store?.items).toEqual([{ kind: "raw", text: "[Alt Shift K_PAUSE]" }]);
    expect(emit(result.ir)).toContain(`store(&HOTKEY) [Alt Shift K_PAUSE]`);
  });

  it("LANGUAGE and LAYOUT are dropped and recorded", () => {
    const result = parse(
      kmn(`store(&VERSION) '10.0'\nLANGUAGE "en"\nLAYOUT "us"\n`),
      "kb",
    );
    expect(result.ir.stores.find((s) => s.name === "LANGUAGE")).toBeUndefined();
    expect(result.ir.stores.find((s) => s.name === "LAYOUT")).toBeUndefined();
    const rw = rewritesOf(result, "header-statement");
    expect(rw).toHaveLength(2);
    expect(rw[0]?.rewrittenText).toContain("dropped");
    expect(rw[1]?.rewrittenText).toContain("dropped");
    const emitted = emit(result.ir);
    expect(emitted).not.toMatch(/^LANGUAGE\s/m);
    expect(emitted).not.toMatch(/^LAYOUT\s/m);
  });

  it('BITMAPS "a.bmp" "b.bmp" is dropped (no one-value equivalent)', () => {
    const result = parse(kmn(`store(&VERSION) '10.0'\nBITMAPS "a.bmp" "b.bmp"\n`), "kb");
    expect(result.ir.stores.find((s) => s.name === "BITMAP")).toBeUndefined();
    const rw = rewritesOf(result, "header-statement");
    expect(rw).toHaveLength(1);
    expect(rw[0]?.rewrittenText).toContain("dropped");
    expect(emit(result.ir)).not.toMatch(/^BITMAPS\s/m);
  });

  it("a header is dropped when a real store() already declares the value", () => {
    // Store first, header second.
    const result = parse(
      kmn(`store(&VERSION) '10.0'\nstore(&NAME) 'Real'\nNAME "Other"\n`),
      "kb",
    );
    expect(result.ir.header.name).toBe("Real");
    const rw = rewritesOf(result, "header-statement");
    expect(rw).toHaveLength(1);
    expect(rw[0]?.rewrittenText).toContain("already declared");
    // The surviving store (line 2) consumes the dropped header line (3):
    // deleting the store must remove the header too, or a re-parse
    // re-synthesises the store from it.
    const nameStore = result.ir.stores.find((s) => s.isSystem && s.name === "NAME");
    expect(nameStore?.consumedSourceLines).toEqual([3]);
    expect(emit(result.ir)).toContain(`store(&NAME) 'Real'`);
    expect(emit(result.ir)).not.toContain(`'Other'`);
  });

  it("a header is dropped when the store comes after it", () => {
    // Header first, store second — the store still wins.
    const result = parse(
      kmn(`store(&VERSION) '10.0'\nNAME "Other"\nstore(&NAME) 'Real'\n`),
      "kb",
    );
    expect(result.ir.header.name).toBe("Real");
    expect(rewritesOf(result, "header-statement")).toHaveLength(1);
    // Same consumption the other way round: the store (line 3) consumes
    // the dropped header line (2).
    const nameStore = result.ir.stores.find((s) => s.isSystem && s.name === "NAME");
    expect(nameStore?.consumedSourceLines).toEqual([2]);
    expect(emit(result.ir)).toContain(`store(&NAME) 'Real'`);
  });
});

// ---------------------------------------------------------------------------
// 2. Legacy value formats
// ---------------------------------------------------------------------------

describe("deprecated legacy value formats", () => {
  it("d### / x### / octal in a store decode to the character", () => {
    const result = parse(kmn(stdPrelude(), `store(s) d241 x41 101\n`), "kb");
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.items).toEqual([
      { kind: "char", value: "\u00f1" }, // d241
      { kind: "char", value: "A" }, // x41
      { kind: "char", value: "A" }, // 101 octal
    ]);
    const rw = rewritesOf(result, "legacy-value-format");
    expect(rw).toHaveLength(3);
    expect(rw.map((r) => r.sourceText)).toEqual(["d241", "x41", "101"]);
    expect(rw.map((r) => r.rewrittenText)).toEqual(["U+00F1", "U+0041", "U+0041"]);
    // Printable chars collapse into a quoted string on emit (only control /
    // combining chars spell U+XXXX in a store body) — the legacy tokens are
    // gone either way.
    const emitted = emit(result.ir);
    expect(emitted).toContain(`store(s) 'ñAA'`);
    expect(emitted).not.toMatch(/\bd\d{1,3}\b/);
    expect(emitted).not.toMatch(/\bx[0-9a-fA-F]{1,4}\b/);
  });

  it("d### / x### decode in rule context and output", () => {
    const result = parse(kmn(stdPrelude(), `d241 + [K_A] > x42\n`), "kb");
    const rule = result.ir.groups[0]?.rules[0];
    expect(rule?.context).toContainEqual({ kind: "char", value: "\u00f1" });
    expect(rule?.output).toEqual([{ kind: "char", value: "B" }]);
    expect(rewritesOf(result, "legacy-value-format")).toHaveLength(2);
    expect(emit(result.ir)).toContain(`U+00F1 + [K_A] > U+0042`);
  });

  it("out-of-range values stay raw and are not recorded", () => {
    const result = parse(kmn(stdPrelude(), `store(s) d999 x10000\n`), "kb");
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.items).toEqual([
      { kind: "raw", text: "d999" },
      { kind: "raw", text: "x10000" },
    ]);
    expect(rewritesOf(result, "legacy-value-format")).toHaveLength(0);
  });

  it("quoted strings and numeric arguments are not decoded", () => {
    const result = parse(
      kmn(stdPrelude(), `store(s) "d241"\n+ [K_A] > dk(1)\n`),
      "kb",
    );
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.items).toEqual([
      { kind: "char", value: "d" },
      { kind: "char", value: "2" },
      { kind: "char", value: "4" },
      { kind: "char", value: "1" },
    ]);
    expect(rewritesOf(result, "legacy-value-format")).toHaveLength(0);
  });

  it("in a begin ANSI section, values >= 128 are kept raw and escalated", () => {
    const src = [
      `store(&VERSION) '10.0'`,
      `begin ANSI > use(main)`,
      ``,
      `group(main) using keys`,
      ``,
      `store(s) d151 d65`,
      ``,
    ].join("\n");
    const result = parse(src, "kb");
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.items).toEqual([
      { kind: "raw", text: "d151" },
      { kind: "char", value: "A" }, // d65 < 128: decoded
    ]);
    const rw = rewritesOf(result, "legacy-value-format");
    expect(rw).toHaveLength(2);
    expect(rw.find((r) => r.sourceText === "d151")?.rewrittenText).toContain("code-page");
    expect(rw.find((r) => r.sourceText === "d65")?.rewrittenText).toBe("U+0041");
    // The escalated value stays in the emitted text — it is a deliberate
    // non-rewrite, not a silent pass-through.
    expect(emit(result.ir)).toContain("d151");
  });

  it("after a later begin Unicode, values >= 128 decode again", () => {
    const src = [
      `store(&VERSION) '10.0'`,
      `begin ANSI > use(main)`,
      `begin Unicode > use(main)`,
      ``,
      `group(main) using keys`,
      ``,
      `store(s) d151`,
      ``,
    ].join("\n");
    const result = parse(src, "kb");
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.items).toEqual([{ kind: "char", value: "\u0097" }]);
    const rw = rewritesOf(result, "legacy-value-format");
    expect(rw).toHaveLength(1);
    expect(rw[0]?.rewrittenText).toBe("U+0097");
  });
});

// ---------------------------------------------------------------------------
// 3. Target-selector prefixes
// ---------------------------------------------------------------------------

describe("deprecated target-selector prefixes", () => {
  it("$keyman: is dropped from a store and a rule", () => {
    const result = parse(
      kmn(stdPrelude(), `$keyman: store(s) 'a'\n$keyman: + [K_A] > 'b'\n`),
      "kb",
    );
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.targetSelector).toBeUndefined();
    const rule = result.ir.groups[0]?.rules[0];
    expect(rule?.targetSelector).toBeUndefined();
    // The '+' keystroke separator is consumed at parse time, not kept as an
    // element — the context is just the vkey.
    expect(rule?.context).toEqual([{ kind: "vkey", name: "K_A", modifiers: [] }]);
    expect(rewritesOf(result, "target-selector")).toHaveLength(2);
    const emitted = emit(result.ir);
    expect(emitted).not.toContain("$keyman:");
    expect(emitted).toContain(`store(s) 'a'`);
  });

  it("a paired store keeps the desktop body and drops the web body", () => {
    const result = parse(
      kmn(
        stdPrelude(),
        `$keymanweb: store(s) 'web'\n$keymanonly: store(s) 'desk'\n+ [K_A] > index(s, 1)\n`,
      ),
      "kb",
    );
    const stores = result.ir.stores.filter((s) => s.name === "s");
    expect(stores).toHaveLength(1);
    expect(stores[0]?.targetSelector).toBeUndefined();
    // The survivor consumes the dropped web twin's line (line 7): a splice
    // deletion of the survivor must remove it too, or a re-parse resurrects
    // the twin (main-CI run 42906157256).
    expect(stores[0]?.consumedSourceLines).toEqual([7]);
    expect(stores[0]?.items).toEqual([
      { kind: "char", value: "d" },
      { kind: "char", value: "e" },
      { kind: "char", value: "s" },
      { kind: "char", value: "k" },
    ]);
    const rw = rewritesOf(result, "target-selector");
    expect(rw).toHaveLength(2);
    expect(rw.some((r) => r.rewrittenText.includes("dropped"))).toBe(true);
    const emitted = emit(result.ir);
    expect(emitted).not.toContain("$keymanweb:");
    expect(emitted).not.toContain("$keymanonly:");
    expect(emitted).toContain(`store(s) 'desk'`);
  });

  it("a lone prefixed store is kept unprefixed", () => {
    const result = parse(kmn(stdPrelude(), `$keymanweb: store(s) 'web'\n`), "kb");
    const store = result.ir.stores.find((s) => s.name === "s");
    expect(store?.targetSelector).toBeUndefined();
    expect(rewritesOf(result, "target-selector")).toHaveLength(1);
    expect(emit(result.ir)).toContain(`store(s) 'web'`);
  });

  it("a $keymanonly: rule becomes one platform('desktop native') rule", () => {
    const result = parse(kmn(stdPrelude(), `$keymanonly: + [K_A] > 'a'\n`), "kb");
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.context[0]).toEqual({ kind: "raw", text: "platform('desktop native')" });
    expect(rules[0]?.context[1]).toEqual({ kind: "raw", text: "+" });
    expect(rules[0]?.context[2]).toEqual({ kind: "vkey", name: "K_A", modifiers: [] });
    expect(rewritesOf(result, "target-selector")).toHaveLength(1);
    const emitted = emit(result.ir);
    expect(emitted).not.toContain("$keymanonly:");
    expect(emitted).toContain(`platform('desktop native') + [K_A] > U+0061`);
  });

  it("a $keymanweb: rule becomes three platform-guarded copies", () => {
    const result = parse(kmn(stdPrelude(), `$keymanweb: + [K_A] > 'a'\n`), "kb");
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(3);
    expect(rules.map((r) => (r.context[0]?.kind === "raw" ? r.context[0].text : ""))).toEqual([
      "platform('web')",
      "platform('phone native')",
      "platform('tablet native')",
    ]);
    // The three copies share one output and distinct nodeIds — and one
    // source line: the splice deletes by line, so deleting one copy must
    // re-emit the survivors, not delete the line (main-CI 42906157256).
    expect(rules.map((r) => r.sourceLine)).toEqual([7, 7, 7]);
    expect(new Set(rules.map((r) => r.nodeId)).size).toBe(3);
    expect(rules.every((r) => r.output.length === 1)).toBe(true);
    expect(rewritesOf(result, "target-selector")).toHaveLength(1);
    const emitted = emit(result.ir);
    expect(emitted).not.toContain("$keymanweb:");
    expect(emitted).toContain(`platform('web') + [K_A] > U+0061`);
    expect(emitted).toContain(`platform('phone native') + [K_A] > U+0061`);
    expect(emitted).toContain(`platform('tablet native') + [K_A] > U+0061`);
  });

  it("a $keymanweb: rule with lookahead keeps the lookahead before the key", () => {
    const result = parse(kmn(stdPrelude(), `$keymanweb: any(s) + [K_A] > 'a'\n`), "kb");
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(3);
    // guard, any(s), '+', vkey — the '+' stays where the source put it.
    expect(rules[0]?.context.map((el) => el.kind)).toEqual(["raw", "any", "raw", "vkey"]);
    expect(emit(result.ir)).toContain(`platform('web') any(s) + [K_A] > U+0061`);
  });

  it("a guarded rule's index() offsets are bumped by one (guard is a position)", () => {
    // kmc pairs index(store, N) with the Nth context position (1-based,
    // counting zero-width if()/platform() calls) — a guard prepended
    // before the paired any() without the bump fails to compile (0x502032).
    // Verified against kmc 19.0.320-beta (exp61/exp67).
    const result = parse(
      kmn(
        stdPrelude(),
        `store(s) 'ab'\n$keymanonly: any(s) + [K_A] > index(s, 1)\n`,
      ),
      "kb",
    );
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.output).toEqual([{ kind: "index", storeRef: "s", offset: 2 }]);
    const rw = rewritesOf(result, "target-selector");
    expect(rw).toHaveLength(1);
    expect(rw[0]?.sourceText).toBe(`$keymanonly: any(s) + [K_A] > index(s, 1)`);
    expect(rw[0]?.rewrittenText).toContain(`index(s, 2)`);
    expect(emit(result.ir)).toContain(
      `platform('desktop native') any(s) + [K_A] > index(s, 2)`,
    );
  });

  it("a guarded any-key rule's index() offset is bumped too", () => {
    // eo_plus shape: the paired any() IS the key. The guard still goes
    // first and the offset still tracks the any() (exp36 showed the
    // unbumped form fails; exp61 the bumped form compiles).
    const result = parse(
      kmn(
        stdPrelude(),
        `store(s) 'ab'\n$keymanonly: ' ' + any(s) > index(s, 2) ' '\n`,
      ),
      "kb",
    );
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.output).toEqual([
      { kind: "index", storeRef: "s", offset: 3 },
      { kind: "char", value: " " },
    ]);
    expect(emit(result.ir)).toContain(
      `platform('desktop native') U+0020 + any(s) > index(s, 3) U+0020`,
    );
  });

  it("a guarded rule with two index() outputs bumps both offsets", () => {
    const result = parse(
      kmn(
        stdPrelude(),
        `store(a) 'ab'\nstore(b) 'cd'\n$keymanonly: any(a) any(b) + [K_A] > index(b, 1) index(b, 2)\n`,
      ),
      "kb",
    );
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.output).toEqual([
      { kind: "index", storeRef: "b", offset: 2 },
      { kind: "index", storeRef: "b", offset: 3 },
    ]);
    expect(emit(result.ir)).toContain(`index(b, 2) index(b, 3)`);
  });

  it("a guarded rule puts '+' before a non-vkey key, never before the guard", () => {
    // korean_rr shape: `+ any(noJamo) > context beep` in a using-keys
    // group. `+ platform(...)` is an invalid key part (exp12); the guard
    // must lead and the '+' must sit before the key element (exp71).
    const result = parse(
      kmn(stdPrelude(), `store(s) 'ab'\n$keymanonly: + any(s) > 'x'\n`),
      "kb",
    );
    const rules = result.ir.groups[0]?.rules ?? [];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.context.map((el) => (el.kind === "raw" ? el.text : el.kind))).toEqual([
      "platform('desktop native')",
      "+",
      "any",
    ]);
    const emitted = emit(result.ir);
    expect(emitted).toContain(`platform('desktop native') + any(s) > U+0078`);
    expect(emitted).not.toContain(`+ platform(`);
  });

  it("a paired nomatch keeps the desktop variant and drops the web variant", () => {
    const result = parse(
      kmn(stdPrelude(), `$keymanweb: nomatch > nul\n$keymanonly: nomatch > beep\n`),
      "kb",
    );
    const rules = (result.ir.groups[0]?.rules ?? []).filter((r) => r.matchKind === "nomatch");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.targetSelector).toBeUndefined();
    expect(rules[0]?.output).toEqual([{ kind: "raw", text: "beep" }]);
    // The survivor (line 8) consumes the dropped web twin's line (line 7):
    // deleting the survivor — or its group — must remove it too, or a
    // re-parse resurrects `nomatch > nul` in the preceding group
    // (korean_rr, main-CI run 42906157256).
    expect(rules[0]?.consumedSourceLines).toEqual([7]);
    expect(rewritesOf(result, "target-selector")).toHaveLength(2);
    const emitted = emit(result.ir);
    expect(emitted).toContain(`nomatch > beep`);
    expect(emitted).not.toContain("nul");
  });

  it("a lone prefixed match is kept unprefixed", () => {
    const result = parse(kmn(stdPrelude(), `$keymanweb: match > use(main)\n`), "kb");
    const rules = (result.ir.groups[0]?.rules ?? []).filter((r) => r.matchKind === "match");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.targetSelector).toBeUndefined();
    expect(rewritesOf(result, "target-selector")).toHaveLength(1);
  });

  it("a prefixed system store is emitted once, unprefixed, with its value", () => {
    const result = parse(
      kmn(stdPrelude(), `$keymanonly: store(&mnemonicLayout) "1"\n`),
      "kb",
    );
    const store = result.ir.stores.find((s) => s.name === "MNEMONICLAYOUT");
    expect(store).toBeDefined();
    expect(store?.targetSelector).toBeUndefined();
    expect(store?.items).toEqual([{ kind: "char", value: "1" }]);
    // System store names are uppercased by the parser (pre-existing).
    expect(emit(result.ir)).toContain(`store(&MNEMONICLAYOUT) '1'`);
  });

  it("target-separated &CasedKeys + &mnemonicLayout keeps the web store", () => {
    // sil_euro_latin shape: $keymanweb: &CasedKeys + $keymanonly:
    // &mnemonicLayout are legal apart but cannot coexist unprefixed
    // (kmc 0x50206b) — the merge keeps the web store and drops the
    // desktop-only one so the file compiles.
    const result = parse(
      kmn(
        stdPrelude(),
        `$keymanonly: store(&mnemonicLayout) "1"\n$keymanweb: store(&CasedKeys) [K_A] [K_B]\n`,
      ),
      "kb",
    );
    expect(result.ir.stores.find((s) => s.name === "CasedKeys")).toBeDefined();
    expect(result.ir.stores.find((s) => s.name === "MNEMONICLAYOUT")).toBeUndefined();
    // The kept web store (line 8) consumes the dropped desktop line (line 7).
    expect(result.ir.stores.find((s) => s.name === "CasedKeys")?.consumedSourceLines).toEqual([7]);
    const rw = rewritesOf(result, "target-selector");
    expect(rw.some((r) => r.sourceText.includes("mnemonicLayout") && r.rewrittenText.includes("dropped"))).toBe(true);
    expect(rw.some((r) => r.rewrittenText.includes("cannot coexist"))).toBe(true);
    const emitted = emit(result.ir);
    expect(emitted).toContain(`store(&CasedKeys)`);
    expect(emitted).not.toContain(`MNEMONICLAYOUT`);
  });

  it("target-separated &CasedKeys + &mnemonicLayout keeps whichever is web", () => {
    const result = parse(
      kmn(
        stdPrelude(),
        `$keymanweb: store(&mnemonicLayout) "1"\n$keymanonly: store(&CasedKeys) [K_A] [K_B]\n`,
      ),
      "kb",
    );
    expect(result.ir.stores.find((s) => s.name === "MNEMONICLAYOUT")).toBeDefined();
    expect(result.ir.stores.find((s) => s.name === "CasedKeys")).toBeUndefined();
    expect(emit(result.ir)).toContain(`store(&MNEMONICLAYOUT) '1'`);
    expect(emit(result.ir)).not.toContain(`CasedKeys`);
  });

  it("an unprefixed &CasedKeys + &mnemonicLayout pair is left alone", () => {
    // Both applied to every target in the source already — a pre-existing
    // conflict, not one the merge created.
    const result = parse(
      kmn(
        stdPrelude(),
        `store(&mnemonicLayout) "1"\nstore(&CasedKeys) [K_A] [K_B]\n`,
      ),
      "kb",
    );
    expect(result.ir.stores.find((s) => s.name === "MNEMONICLAYOUT")).toBeDefined();
    expect(result.ir.stores.find((s) => s.name === "CasedKeys")).toBeDefined();
    expect(rewritesOf(result, "target-selector")).toHaveLength(0);
  });

  it("an opaque prefixed rule is kept verbatim (with its prefix) and escalated", () => {
    // call(foo, 1): a bare call(foo) is a typed call element since spec 116
    // (parse-opaque.test.ts pins it), so the opaque example is the
    // argument-list form the typed member cannot hold — still a
    // call-return fragment (parse-opaque.test.ts pins that too).
    const result = parse(
      kmn(stdPrelude(), `$keymanweb: + [K_A] > call(foo, 1)\n`),
      "kb",
    );
    expect(result.ir.raw).toHaveLength(1);
    expect(result.ir.raw[0]?.sourceText).toContain("$keymanweb:");
    const rw = rewritesOf(result, "target-selector");
    expect(rw).toHaveLength(1);
    expect(rw[0]?.rewrittenText).toContain("kept as-is");
    // Faithful emit: the one place a $keyman*: prefix may still appear.
    expect(emit(result.ir)).toContain(`$keymanweb: + [K_A] > call(foo, 1)`);
  });

  it("emit never writes a $keyman*: prefix for a stale hand-built IR", () => {
    const result = parse(kmn(stdPrelude(), `+ [K_A] > 'a'\nstore(s) 'x'\n`), "kb");
    const rule = result.ir.groups[0]?.rules[0];
    if (rule) rule.targetSelector = "keymanonly";
    const store = result.ir.stores.find((s) => s.name === "s");
    if (store) store.targetSelector = "keymanweb";
    const emitted = emit(result.ir);
    expect(emitted).not.toContain("$keyman");
    expect(emitted).toContain(`+ [K_A] > U+0061`);
  });
});

// ---------------------------------------------------------------------------
// 4. Version raise for platform() guards
// ---------------------------------------------------------------------------

describe("version raise for platform() guards", () => {
  it("raises store(&VERSION) below 9.0 to '9.0' when a guard is added", () => {
    const result = parse(
      kmn(`store(&VERSION) '5.0'\nstore(&NAME) 'Test'\n`, `$keymanweb: + [K_A] > 'a'\n`),
      "kb",
    );
    expect(result.ir.header.version).toBe("9.0");
    const rw = rewritesOf(result, "version-raise");
    expect(rw).toHaveLength(1);
    expect(rw[0]).toMatchObject({
      sourceText: `store(&VERSION) '5.0'`,
      rewrittenText: expect.stringContaining(`store(&VERSION) '9.0'`),
    });
    expect(emit(result.ir)).toContain(`store(&VERSION) '9.0'`);
  });

  it("does not raise a version already at or above 9.0", () => {
    const result = parse(
      kmn(stdPrelude(), `$keymanweb: + [K_A] > 'a'\n`),
      "kb",
    );
    expect(result.ir.header.version).toBe("10.0");
    expect(rewritesOf(result, "version-raise")).toHaveLength(0);
  });

  it("does not raise (or invent) a version when none is declared", () => {
    const result = parse(
      kmn(`store(&NAME) 'Test'\n`, `$keymanweb: + [K_A] > 'a'\n`),
      "kb",
    );
    expect(result.ir.stores.find((s) => s.name === "VERSION")).toBeUndefined();
    expect(rewritesOf(result, "version-raise")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Round-trip stability (I2): parse → emit → parse is stable
// ---------------------------------------------------------------------------

describe("round-trip stability after rewrite", () => {
  const src = [
    `NAME "Foo"`,
    `VERSION 10.0`,
    `HOTKEY "^%A"`,
    `LANGUAGE "en"`,
    ``,
    `store(&VERSION) '10.0'`,
    `begin Unicode > use(main)`,
    ``,
    `group(main) using keys`,
    ``,
    `store(s) d241 x41 101`,
    `$keymanweb: store(w) 'web'`,
    `$keymanonly: store(w) 'desk'`,
    `$keymanonly: + [K_A] > 'a'`,
    `$keymanweb: + [K_B] > 'b'`,
    `$keyman: + [K_C] > 'c'`,
    `+ [K_D] > d242`,
    `+ [K_E] > index(s, 1)`,
    `+ [K_F] > index(w, 1)`,
    ``,
  ].join("\n");

  it("the second parse records no rewrites and the emitted text is stable", () => {
    const first = parse(src, "kb");
    expect(first.rewrites.length).toBeGreaterThan(0);
    const emitted = emit(first.ir);
    expect(hasDeprecatedForm(emitted)).toBe(false);
    const second = parse(emitted, "kb");
    expect(second.rewrites).toEqual([]);
    expect(emit(second.ir)).toBe(emitted);
  });

  it("the rewritten IR is unchanged by a second parse (modulo nodeIds)", () => {
    const first = parse(src, "kb");
    const second = parse(emit(first.ir), "kb");
    expect(normaliseForComparison(second.ir)).toEqual(normaliseForComparison(first.ir));
  });
});
