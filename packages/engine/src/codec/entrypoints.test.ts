/**
 * FR-004 (076): the `begin` entry-point set is modelled on the IR header.
 *
 * The parser keeps the `begin <encoding> > use(<group>)` entry group (no
 * longer dropped) and marks the reserved `NewContext` / `PostKeystroke`
 * groups `readonly`; the emitter reuses the modelled entry instead of
 * rebuilding a single entry from the first non-readonly group. Reserved
 * groups are fidelity-only — never reorder hooks.
 */

import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Entry Point Test'

`;

function parseKmn(body: string, id = "entrypoint-test") {
  return parse(HEADER + body, id);
}

describe("FR-004 entry-point set: parse", () => {
  it("models the full entry-point set on the IR header", () => {
    const { ir } = parseKmn(`begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'

group(NewContext) using keys

+ [K_B] > 'b'

group(PostKeystroke) using keys

+ [K_C] > 'c'
`);
    expect(ir.header.entryPoints).toEqual({
      main: "main",
      newContext: true,
      postKeystroke: true,
    });
    expect(ir.header.encoding).toBe("Unicode");
  });

  it("marks NewContext / PostKeystroke groups readonly, main not", () => {
    const { ir } = parseKmn(`begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'

group(NewContext) using keys

+ [K_B] > 'b'

group(PostKeystroke) using keys

+ [K_C] > 'c'
`);
    const byName = new Map(ir.groups.map(g => [g.name, g]));
    expect(byName.get("main")?.readonly).toBe(false);
    expect(byName.get("NewContext")?.readonly).toBe(true);
    expect(byName.get("PostKeystroke")?.readonly).toBe(true);
  });

  it("keeps a non-first entry group instead of dropping it", () => {
    const { ir } = parseKmn(`begin ANSI > use(legacy)

group(main) using keys

+ [K_A] > 'a'

group(legacy) using keys

+ [K_B] > 'b'
`);
    expect(ir.header.encoding).toBe("ANSI");
    expect(ir.header.entryPoints?.main).toBe("legacy");
  });

  it("leaves entryPoints absent when there is nothing to model", () => {
    const { ir } = parseKmn(`group(main) using keys

+ [K_A] > 'a'
`);
    expect(ir.header.entryPoints).toBeUndefined();
  });

  it("first begin directive wins when several are present", () => {
    const { ir } = parseKmn(`begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'

begin ANSI > use(other)

group(other) using keys

+ [K_B] > 'b'
`);
    expect(ir.header.encoding).toBe("Unicode");
    expect(ir.header.entryPoints?.main).toBe("main");
  });
});

describe("FR-004 entry-point set: emit", () => {
  it("reuses the modelled entry group instead of rebuilding a single entry", () => {
    const { ir } = parseKmn(`begin ANSI > use(legacy)

group(main) using keys

+ [K_A] > 'a'

group(legacy) using keys

+ [K_B] > 'b'
`);
    const out = emit(ir);
    expect(out).toContain("begin ANSI > use(legacy)");
    expect(out).not.toContain("use(main)");
  });

  it("still emits the reserved groups as groups (fidelity)", () => {
    const { ir } = parseKmn(`begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'

group(NewContext) using keys

+ [K_B] > 'b'

group(PostKeystroke) using keys

+ [K_C] > 'c'
`);
    const out = emit(ir);
    expect(out).toContain("begin Unicode > use(main)");
    expect(out).toContain("group(NewContext) using keys");
    expect(out).toContain("group(PostKeystroke) using keys");
  });

  it("falls back to the first non-readonly group when nothing is modelled", () => {
    const { ir } = parseKmn(`group(main) using keys

+ [K_A] > 'a'
`);
    const out = emit(ir);
    expect(out).toContain("begin Unicode > use(main)");
  });

  it("never selects a reserved group as the entry", () => {
    const { ir } = parseKmn(`begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'

group(NewContext) using keys

+ [K_B] > 'b'
`);
    // The reserved groups are readonly: entry-group selection
    // (first non-readonly group) can never land on them.
    const entryCandidate = ir.groups.find(g => !g.readonly);
    expect(entryCandidate?.name).toBe("main");
    const out = emit(ir);
    expect(out).toContain("begin Unicode > use(main)");
  });
});

describe("FR-004 entry-point set: round-trip", () => {
  const MULTI_ENTRY = `begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'

group(NewContext) using keys

+ [K_B] > 'b'

group(PostKeystroke) using keys

+ [K_C] > 'c'
`;

  it("parse → emit → parse preserves the entry-point set", () => {
    const { ir: ir1 } = parseKmn(MULTI_ENTRY);
    const text1 = emit(ir1);
    const { ir: ir2 } = parse(text1, "entrypoint-test");
    expect(ir2.header.entryPoints).toEqual(ir1.header.entryPoints);
    expect(ir2.groups.map(g => [g.name, g.readonly])).toEqual(
      ir1.groups.map(g => [g.name, g.readonly]),
    );
  });

  it("the emit text stabilizes after one real parse", () => {
    const { ir: ir1 } = parseKmn(MULTI_ENTRY);
    const text1 = emit(ir1);
    const { ir: ir2 } = parse(text1, "entrypoint-test");
    expect(emit(ir2)).toBe(text1);
  });
});

describe("FR-004 canonical emit of typed nul / context", () => {
  function emitBody(body: string): string {
    const { ir } = parseKmn(`begin Unicode > use(main)

group(main) using keys

${body}`);
    return emit(ir);
  }

  it("emits `nul` canonically", () => {
    expect(emitBody("+ [K_A] > nul\n")).toContain("+ [K_A] > nul");
  });

  it("emits bare `context` for offset 0", () => {
    expect(emitBody("+ [K_A] > context\n")).toContain("+ [K_A] > context");
  });

  it("emits `context(N)` for N >= 1", () => {
    expect(emitBody("+ [K_A] > context(2)\n")).toContain("+ [K_A] > context(2)");
    expect(emitBody("+ [K_A] > context(1)\n")).toContain("+ [K_A] > context(1)");
  });

  it("parse → emit is identity on the typed forms", () => {
    const src = `begin Unicode > use(main)

group(main) using keys

+ [K_A] > nul
+ [K_B] > context
+ [K_C] > context(2)
+ [K_D] > nul beep
`;
    const { ir } = parseKmn(src);
    const out = emit(ir);
    for (const line of ["+ [K_A] > nul", "+ [K_B] > context", "+ [K_C] > context(2)", "+ [K_D] > nul beep"]) {
      expect(out).toContain(line);
    }
  });
});
