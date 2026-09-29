/**
 * FR-004 (076) round-trip fixtures: every typed form plus a two-entry-group
 * keyboard, parse→emit identity.
 *
 * Each fixture asserts the full cycle: parse → emit → re-parse yields a
 * structurally equal IR (via normaliseForComparison), and a second emit is
 * byte-identical to the first (the emit text stabilizes after one real parse).
 *
 * Typed forms covered:
 *   - output position: `nul`, bare `context`, `context(1)`, `context(2)`,
 *     and the loud forms `nul beep`, `context beep`
 *   - context position: `context(2)`, `context(3)` (N > 1)
 *   - two-entry-group keyboard: `begin` entry group + `NewContext` /
 *     `PostKeystroke` reserved groups (readonly), with typed forms inside
 */

import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { normaliseForComparison } from "./normalise-ir.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'FR-004 Round-Trip'

`;

function parseKmn(body: string, id = "fr004-roundtrip") {
  return parse(HEADER + body, id);
}

/** Parse → emit → re-parse; return both IRs and both emit texts. */
function roundTrip(src: string, id = "fr004-roundtrip") {
  const { ir: ir1 } = parseKmn(src, id);
  const text1 = emit(ir1);
  const { ir: ir2 } = parse(text1, id);
  const text2 = emit(ir2);
  return { ir1, ir2, text1, text2 };
}

/** Assert parse→emit identity: structural IR equality + byte-stable emit. */
function expectRoundTripIdentity(src: string, id = "fr004-roundtrip") {
  const { ir1, ir2, text1, text2 } = roundTrip(src, id);
  expect(normaliseForComparison(ir2)).toEqual(normaliseForComparison(ir1));
  expect(text2).toBe(text1);
  return { ir1, ir2, text1 };
}

const TYPED_FORMS = `begin Unicode > use(main)

group(main) using keys

+ [K_A] > nul
+ [K_B] > context
+ [K_C] > context(1)
+ [K_D] > context(2)
+ [K_E] > nul beep
+ [K_F] > context beep
dk(0001) context(2) > 'x'
dk(0001) context(3) > 'y'
`;

describe("FR-004 round-trip: every typed form", () => {
  it("parse → emit → re-parse is identity on all output-position typed forms", () => {
    const { text1 } = expectRoundTripIdentity(TYPED_FORMS);
    for (const line of [
      "+ [K_A] > nul",
      "+ [K_B] > context",
      "+ [K_C] > context(1)",
      "+ [K_D] > context(2)",
      "+ [K_E] > nul beep",
      "+ [K_F] > context beep",
    ]) {
      expect(text1).toContain(line);
    }
  });

  it("parse → emit → re-parse is identity on context-position context(N)", () => {
    const { ir2, text1 } = roundTrip(TYPED_FORMS);
    expect(text1).toContain("context(2)");
    expect(text1).toContain("context(3)");
    const main = ir2.groups.find((g) => g.name === "main");
    const ctxRules = (main?.rules ?? []).filter((r) =>
      r.context.some((c) => c.kind === "context"),
    );
    expect(ctxRules).toHaveLength(2);
    expect(ctxRules[0]?.context).toContainEqual({ kind: "context", offset: 2 });
    expect(ctxRules[1]?.context).toContainEqual({ kind: "context", offset: 3 });
  });

  it("typed output elements survive the cycle structurally", () => {
    const { ir1, ir2 } = roundTrip(TYPED_FORMS);
    const outputs = (ir: KeyboardIR) =>
      ir.groups
        .find((g) => g.name === "main")
        ?.rules.map((r) => r.output) ?? [];
    expect(outputs(ir2)).toEqual(outputs(ir1));
    // Spot-check the typed shapes are intact, not degraded to raw.
    const flat = outputs(ir2).flat();
    expect(flat).toContainEqual({ kind: "nul" });
    expect(flat).toContainEqual({ kind: "context", offset: 0 });
    expect(flat).toContainEqual({ kind: "context", offset: 1 });
    expect(flat).toContainEqual({ kind: "context", offset: 2 });
  });
});

const TWO_ENTRY_GROUPS = `begin Unicode > use(main)

group(main) using keys

+ [K_A] > nul
+ [K_B] > context(2)

group(NewContext) using keys

+ [K_C] > nul beep

group(PostKeystroke) using keys

dk(0001) context(2) > 'z'
`;

describe("FR-004 round-trip: two-entry-group keyboard", () => {
  it("parse → emit → re-parse is identity with reserved entry groups present", () => {
    const { ir1, ir2, text1 } = expectRoundTripIdentity(TWO_ENTRY_GROUPS);
    expect(text1).toContain("begin Unicode > use(main)");
    expect(text1).toContain("group(NewContext) using keys");
    expect(text1).toContain("group(PostKeystroke) using keys");
    expect(ir2.header.entryPoints).toEqual(ir1.header.entryPoints);
    expect(ir2.header.entryPoints).toEqual({
      main: "main",
      newContext: true,
      postKeystroke: true,
    });
  });

  it("readonly flags on the reserved groups survive the cycle", () => {
    const { ir1, ir2 } = roundTrip(TWO_ENTRY_GROUPS);
    const flags = (ir: KeyboardIR) =>
      ir.groups.map((g) => [g.name, g.readonly] as const);
    expect(flags(ir2)).toEqual(flags(ir1));
    expect(flags(ir2)).toContainEqual(["NewContext", true]);
    expect(flags(ir2)).toContainEqual(["PostKeystroke", true]);
    expect(flags(ir2)).toContainEqual(["main", false]);
  });

  it("typed forms inside reserved groups round-trip", () => {
    const { text1 } = expectRoundTripIdentity(TWO_ENTRY_GROUPS);
    expect(text1).toContain("+ [K_C] > nul beep");
    expect(text1).toContain("context(2)");
  });
});

const NON_FIRST_ENTRY = `begin ANSI > use(legacy)

group(main) using keys

+ [K_A] > 'a'

group(legacy) using keys

+ [K_B] > nul
+ [K_C] > context
`;

describe("FR-004 round-trip: non-first entry group", () => {
  it("the modelled entry group is preserved, not rebuilt from the first group", () => {
    const { ir1, ir2, text1 } = expectRoundTripIdentity(NON_FIRST_ENTRY);
    expect(text1).toContain("begin ANSI > use(legacy)");
    expect(text1).not.toContain("use(main)");
    expect(ir2.header.entryPoints?.main).toBe("legacy");
    expect(ir2.header.entryPoints?.main).toBe(ir1.header.entryPoints?.main);
  });
});
