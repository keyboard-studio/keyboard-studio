/**
 * FR-004 (076): typed `nul` / `context` / `context(N)` parsing.
 *
 * Output position: `nul` → {kind:"nul"}; bare `context` → {kind:"context",
 * offset:0} (whole matched context); `context(N)` (N >= 1) → {kind:"context",
 * offset:N}. Context position: `context(N)` with N > 1 → {kind:"context",
 * offset:N}. Degenerate offsets (`context(0)` anywhere; `context(1)` in
 * context position) are rejected — the rule goes opaque with the
 * indexed-context reason rather than fabricating a meaning.
 */

import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { OPAQUE_REASONS } from "./opaque-reasons.js";

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Nul Context Test'

begin Unicode > use(main)

group(main) using keys

`;

function parseBody(body: string) {
  const { ir } = parse(HEADER + body, "nul-context-test");
  const main = ir.groups.find(g => g.name === "main");
  return { ir, rules: main?.rules ?? [] };
}

describe("FR-004 output position: nul", () => {
  it("types bare `nul` as {kind:'nul'}", () => {
    const { rules } = parseBody("+ [K_A] > nul\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.output).toEqual([{ kind: "nul" }]);
  });

  it("is case-insensitive (`NUL`)", () => {
    const { rules } = parseBody("+ [K_A] > NUL\n");
    expect(rules[0]?.output).toEqual([{ kind: "nul" }]);
  });

  it("types the loud form `nul beep` as two elements", () => {
    const { rules } = parseBody("+ [K_A] > nul beep\n");
    expect(rules[0]?.output).toEqual([{ kind: "nul" }, { kind: "beep" }]);
  });

  it("does not type quoted 'nul' — it stays literal text", () => {
    const { rules } = parseBody("+ [K_A] > 'nul'\n");
    expect(rules[0]?.output).toEqual([
      { kind: "char", value: "n" },
      { kind: "char", value: "u" },
      { kind: "char", value: "l" },
    ]);
  });
});

describe("FR-004 output position: context", () => {
  it("types bare `context` as {kind:'context', offset:0}", () => {
    const { rules } = parseBody("+ [K_A] > context\n");
    expect(rules[0]?.output).toEqual([{ kind: "context", offset: 0 }]);
  });

  it("types `context(2)` as {kind:'context', offset:2}", () => {
    const { rules } = parseBody("+ [K_A] > context(2)\n");
    expect(rules[0]?.output).toEqual([{ kind: "context", offset: 2 }]);
  });

  it("types `context(1)` in output position as offset 1", () => {
    const { rules } = parseBody("+ [K_A] > context(1)\n");
    expect(rules[0]?.output).toEqual([{ kind: "context", offset: 1 }]);
  });

  it("is case-insensitive (`CONTEXT`, `Context(2)`)", () => {
    const { rules } = parseBody("+ [K_A] > CONTEXT\n");
    expect(rules[0]?.output).toEqual([{ kind: "context", offset: 0 }]);
    const again = parseBody("+ [K_A] > Context(2)\n");
    expect(again.rules[0]?.output).toEqual([{ kind: "context", offset: 2 }]);
  });

  it("types multi-digit `context(10)`", () => {
    const { rules } = parseBody("+ [K_A] > context(10)\n");
    expect(rules[0]?.output).toEqual([{ kind: "context", offset: 10 }]);
  });

  it("accepts whitespace inside the parens: `context( 2 )`", () => {
    const { rules } = parseBody("+ [K_A] > context( 2 )\n");
    expect(rules[0]?.output).toEqual([{ kind: "context", offset: 2 }]);
  });
  it("types the loud form `context beep` as two elements", () => {
    const { rules } = parseBody("+ [K_A] > context beep\n");
    expect(rules[0]?.output).toEqual([
      { kind: "context", offset: 0 },
      { kind: "beep" },
    ]);
  });

  it("rejects `context(0)` in output position: rule goes opaque", () => {
    const { ir, rules } = parseBody("+ [K_A] > context(0)\n");
    expect(rules).toHaveLength(0);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]?.reason).toBe(OPAQUE_REASONS.INDEXED_CONTEXT);
  });

  it("does not type quoted 'context' — it stays literal text", () => {
    const { rules } = parseBody("+ [K_A] > 'context'\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.output.every(e => e.kind === "char")).toBe(true);
  });
});

describe("FR-004 context position: context(N), N > 1", () => {
  it("types `context(2)` in context position", () => {
    const { rules } = parseBody("dk(0001) context(2) > U+0061\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.context).toEqual([
      { kind: "deadkey", id: 1 },
      { kind: "context", offset: 2 },
    ]);
  });

  it("types `context(3)` in context position", () => {
    const { rules } = parseBody("dk(0001) context(3) > U+0061\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.context).toEqual([
      { kind: "deadkey", id: 1 },
      { kind: "context", offset: 3 },
    ]);
  });

  it("types multi-digit `context(10)` in context position", () => {
    const { rules } = parseBody("dk(0001) context(10) > U+0061\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.context).toEqual([
      { kind: "deadkey", id: 1 },
      { kind: "context", offset: 10 },
    ]);
  });

  it("rejects `context(1)` in context position: rule goes opaque", () => {
    const { ir, rules } = parseBody("dk(0001) context(1) > U+0061\n");
    expect(rules).toHaveLength(0);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]?.reason).toBe(OPAQUE_REASONS.INDEXED_CONTEXT);
  });

  it("rejects `context(0)` in context position: rule goes opaque", () => {
    const { ir, rules } = parseBody("dk(0001) context(0) > U+0061\n");
    expect(rules).toHaveLength(0);
    expect(ir.raw).toHaveLength(1);
    expect(ir.raw[0]?.reason).toBe(OPAQUE_REASONS.INDEXED_CONTEXT);
  });

  it("leaves bare `context` in context position as raw (not valid KMN there)", () => {
    const { rules } = parseBody("dk(0001) context > U+0061\n");
    expect(rules).toHaveLength(1);
    expect(rules[0]?.context).toEqual([
      { kind: "deadkey", id: 1 },
      { kind: "raw", text: "context" },
    ]);
  });
});
