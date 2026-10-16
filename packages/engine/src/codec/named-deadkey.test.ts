/**
 * Named deadkeys (#2238, implementing the #2232 ruling): dk(name) is typed
 * as { kind: "namedDeadkey", name } in all three element unions, the name
 * verbatim per occurrence; emit reproduces dk(name). Identity folds ASCII
 * case only (kmcmplib, settled by compiling cross-case probes against the
 * real compiler); the hex boundary does not move (all-hex tokens stay
 * numeric); the deadkey(name) long form stays unmodelled.
 */
import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

const HEAD = `store(&VERSION) '10.0'\nstore(&NAME) 'NDK'\nstore(&TARGETS) 'any'\n`;
const TAIL = `begin Unicode > use(main)\ngroup(main) using keys\n`;

function kmn(stores: string, rules: string): string {
  return HEAD + stores + TAIL + rules;
}

/** Every named-deadkey name in the IR, in document order, verbatim. */
function namedNames(ir: KeyboardIR): string[] {
  const out: string[] = [];
  const scan = (els: readonly { kind: string; name?: string }[]) => {
    for (const el of els) if (el.kind === "namedDeadkey") out.push(el.name!);
  };
  for (const s of ir.stores) scan(s.items);
  for (const g of ir.groups) for (const r of g.rules) { scan(r.context); scan(r.output); }
  for (const f of ir.raw) if (f.storeSketch) scan(f.storeSketch);
  return out;
}

/** Every numeric deadkey id >= the old sketch interning base (synthetic). */
function syntheticIds(ir: KeyboardIR): number[] {
  const out: number[] = [];
  const scan = (els: readonly { kind: string; id?: number }[]) => {
    for (const el of els) if (el.kind === "deadkey" && (el.id ?? 0) >= 0x7f000000) out.push(el.id!);
  };
  for (const s of ir.stores) scan(s.items);
  for (const g of ir.groups) for (const r of g.rules) { scan(r.context); scan(r.output); }
  for (const f of ir.raw) if (f.storeSketch) scan(f.storeSketch);
  return out;
}

describe("named deadkeys — typed in all three positions (#2238)", () => {
  it("types dk(name) in store, context, and output positions", () => {
    const { ir } = parse(
      kmn("store(marks) dk(acute) U+0301\n", "dk(acute) + [K_A] > dk(grave) 'a'\n"),
      "ndk",
    );
    expect(ir.stores.find((s) => s.name === "marks")?.items[0]).toEqual({
      kind: "namedDeadkey",
      name: "acute",
    });
    const rule = ir.groups[0]!.rules[0]!;
    expect(rule.context[0]).toEqual({ kind: "namedDeadkey", name: "acute" });
    expect(rule.output[0]).toEqual({ kind: "namedDeadkey", name: "grave" });
    expect(ir.raw.length).toBe(0);
  });

  it("mixed numeric + named in one output (hieroglyphic shape) stay distinct kinds", () => {
    const { ir } = parse(kmn("", "+ [K_A] > dk(ltn) dk(0) dk(4) dk(5)\n"), "mix");
    expect(ir.groups[0]!.rules[0]!.output).toEqual([
      { kind: "namedDeadkey", name: "ltn" },
      { kind: "deadkey", id: 0 },
      { kind: "deadkey", id: 4 },
      { kind: "deadkey", id: 5 },
    ]);
  });
});

describe("named deadkeys — hex boundary unmoved (#2238 constraint 3)", () => {
  it("all-hex tokens stay numeric, including hex words and zero-padded", () => {
    const { ir } = parse(
      kmn("", "+ [K_A] > dk(dead) dk(cafe) dk(123) dk(0300) dk(007e)\n"),
      "hex",
    );
    expect(ir.groups[0]!.rules[0]!.output).toEqual([
      { kind: "deadkey", id: 0xdead },
      { kind: "deadkey", id: 0xcafe },
      { kind: "deadkey", id: 0x123 },
      { kind: "deadkey", id: 0x300 },
      { kind: "deadkey", id: 0x7e },
    ]);
  });

  it("one non-hex letter tips the token to named (dk(deadg))", () => {
    const { ir } = parse(kmn("", "+ [K_A] > dk(deadg)\n"), "hex2");
    expect(ir.groups[0]!.rules[0]!.output).toEqual([
      { kind: "namedDeadkey", name: "deadg" },
    ]);
  });
});

describe("named deadkeys — case: spelling preserved, per occurrence (#2238 constraint 2)", () => {
  // embera_north / landuma ship this shape: armed lowercase, consumed
  // capitalised — ONE compiler deadkey (kmcmplib folds ASCII case), two
  // source spellings, both preserved verbatim through the round trip.
  const CASE_KMN = kmn(
    "",
    "+ [K_S] > dk(semicolon)\ndk(Semicolon) + [K_E] > 'e'\n",
  );

  it("parses both spellings as verbatim named elements", () => {
    const { ir } = parse(CASE_KMN, "case");
    expect(namedNames(ir)).toEqual(["semicolon", "Semicolon"]);
  });

  it("parse → emit → parse is name-identical (names and order unchanged)", () => {
    const once = parse(CASE_KMN, "case").ir;
    const text = emit(once);
    expect(text).toContain("dk(semicolon)");
    expect(text).toContain("dk(Semicolon)");
    const twice = parse(text, "case").ir;
    expect(namedNames(twice)).toEqual(namedNames(once));
    expect(emit(twice)).toBe(text);
  });

  it("non-ASCII case variants are DISTINCT deadkeys (café vs CAFÉ)", () => {
    // kmcmplib folds ASCII A–Z only: dk(café) and dk(CAFÉ) compile to two
    // KMX entries with no precedence warning (km-keyman probe, #2238).
    const { ir } = parse(kmn("", "+ [K_A] > dk(café) dk(CAFÉ)\n"), "cafe");
    expect(namedNames(ir)).toEqual(["café", "CAFÉ"]);
    const text = emit(ir);
    expect(text).toContain("dk(café)");
    expect(text).toContain("dk(CAFÉ)");
  });
});

describe("named deadkeys — boundaries held (#2238)", () => {
  it("dk(name)+ with no space before + stays a raw element — the same glue as numeric dk(0300)+", () => {
    // Pre-existing tokenizer behaviour, uniform across deadkey kinds:
    // `dk(x)+` is one raw token; only the spaced form tokenises. Pinned so
    // the named path is never "fixed" asymmetrically (embera_north and
    // landuma write their double-tap escape exactly this way, and emit
    // reproduces the raw text byte-identically).
    const { ir } = parse(kmn("", "dk(Semicolon)+ ';' > ';'\ndk(0300)+ 'a' > 'a'\n"), "glue");
    const [named, numeric] = ir.groups[0]!.rules;
    expect(named?.context[0]).toEqual({ kind: "raw", text: "dk(Semicolon)+" });
    expect(numeric?.context[0]).toEqual({ kind: "raw", text: "dk(0300)+" });
    const text = emit(ir);
    expect(text).toContain("dk(Semicolon)+ U+003B > U+003B");
    expect(text).toContain("dk(0300)+ U+0061 > U+0061");
  });

  it("the deadkey(name) long form stays unmodelled (raw element, no fragment)", () => {
    const { ir } = parse(kmn("", "+ [K_A] > deadkey(acute)\n"), "long");
    expect(ir.groups[0]!.rules[0]!.output).toEqual([
      { kind: "raw", text: "deadkey(acute)" },
    ]);
    expect(ir.raw.length).toBe(0);
  });

  it("a named item suppresses store range re-collapse for the whole store", () => {
    const { ir } = parse(
      kmn("store(mix) U+0300 U+0301 U+0302 dk(acute)\n", "+ [K_A] > U+0061\n"),
      "range",
    );
    const line = emit(ir).split("\n").find((l) => l.includes("store(mix)"));
    expect(line).toBe("store(mix) U+0300 U+0301 U+0302 dk(acute)");
    expect(line).not.toContain("..");
  });

  it("opaque-store sketches carry the name verbatim — no synthetic ids anywhere", () => {
    const { ir } = parse(
      kmn(
        "store(base) U+0300 dk(acute)\nstore(all) outs(base)\n",
        "+ [K_A] > U+0061\n",
      ),
      "sketch",
    );
    const frag = ir.raw.find((f) => f.sourceText.includes("store(all)"));
    expect(frag?.storeSketch).toContainEqual({ kind: "namedDeadkey", name: "acute" });
    expect(syntheticIds(ir)).toEqual([]);
  });
});
