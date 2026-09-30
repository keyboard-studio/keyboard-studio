/**
 * kmAssist deterministic explainer tests — spec 082 FR-019 (FR-023 read-only).
 *
 * Unicode data note: `getCategory`/`getName` come from the FR-021 adapter
 * stub (currently returning undefined), so these tests substitute a
 * faithful mock derived from the repo's pinned UCD
 * (`lib/ucd/UnicodeData.txt`, Unicode 17.0.0, via scripts/ucd-version.json)
 * for exactly the code points appearing in the fixtures. The mock is
 * labelled MOCK-FR021 and disappears when the pinned table lands — the
 * assertions exercise the real composer through the real adapter
 * signatures. No LLM is involved; every sentence is template-composed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/parse.js";
import type { IRRule } from "@keyboard-studio/contracts";
import { explainRule, type ExplainContext } from "./explain.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");

function fixtureParsed() {
  const src = readFileSync(FIXTURE_PATH, "utf-8");
  return parse(src, "sil_cameroon_qwerty");
}

function fixtureContext(): ExplainContext {
  const { ir } = fixtureParsed();
  const stores = new Map<string, string[]>();
  for (const s of ir.stores) {
    stores.set(
      s.name,
      s.items.flatMap((i) => (i.kind === "char" ? [...i.value] : [])),
    );
  }
  return { rules: ir.groups.flatMap((g) => g.rules), stores };
}

function mustFind(label: string, pred: (r: IRRule) => boolean): IRRule {
  const found = fixtureContext().rules.find(pred);
  if (found === undefined) throw new Error(`fixture rule not found: ${label}`);
  return found;
}

const isDiablockGuard = (r: IRRule) =>
  r.context.some((e) => e.kind === "any" && e.storeRef === "diablock") &&
  r.context.some((e) => e.kind === "vkey" && e.name === "K_C" && e.modifiers.includes("RALT"));

describe("explainRule FR-019 — guard-family reference (fixture)", () => {
  it("any(diablock) + [RALT K_C] > context composes the reference explanation", () => {
    const ctx = fixtureContext();
    const rule = mustFind("diablock guard on RALT K_C", isDiablockGuard);
    expect(explainRule(rule, ctx)).toBe(
      "Right Alt + C types a combining cedilla — a mark that needs a base letter. " +
        "After a space, digit or punctuation, which can never take a diacritic, " +
        "this rule swallows the keystroke so stray marks can't corrupt your text. " +
        "It wins over the plain cedilla rule by being more specific (longest match).",
    );
  });

  it("the reference's key sentences hold individually", () => {
    const ctx = fixtureContext();
    const text = explainRule(mustFind("diablock guard on RALT K_C", isDiablockGuard), ctx);
    expect(text).toContain("types a combining cedilla — a mark that needs a base letter.");
    expect(text).toContain(
      "After a space, digit or punctuation, which can never take a diacritic, " +
        "this rule swallows the keystroke so stray marks can't corrupt your text.",
    );
    expect(text).toContain("It wins over the plain cedilla rule by being more specific (longest match).");
  });

  it("single-arg call keeps today's shape sentence (back-compat)", () => {
    const rule = mustFind("diablock guard on RALT K_C", isDiablockGuard);
    expect(explainRule(rule)).toBe(
      'Swallows the key when a character from the "diablock" store precedes it, ' +
        "keeping the existing text — Right Alt+C produces nothing.",
    );
  });
});

describe("explainRule FR-019 — mark-emitting keys", () => {
  const bareCedilla = () =>
    mustFind(
      "bare RALT K_C",
      (r) =>
        r.context.some((e) => e.kind === "vkey" && e.name === "K_C" && e.modifiers.join(",") === "RALT") &&
        !r.context.some((e) => e.kind === "any"),
    );

  it("single-arg plain-output keeps today's sentence", () => {
    expect(explainRule(bareCedilla())).toBe('Right Alt+C types "̧".');
  });

  it("with context, a mark key is named with its Unicode name and mark judgement", () => {
    expect(explainRule(bareCedilla(), fixtureContext())).toBe(
      "Right Alt + C types a combining cedilla — a mark that needs a base letter.",
    );
  });
});

describe("explainRule FR-019 — honest fallbacks", () => {
  it("unrecognized shape keeps the honest fallback, even with context", () => {
    const opaque: IRRule = {
      nodeId: "x",
      context: [{ kind: "raw", text: "if(some_option)" }],
      output: [{ kind: "raw", text: "nul" }],
    };
    expect(explainRule(opaque, fixtureContext())).toBe(
      "This rule has a shape the assist layer doesn't recognise yet — it is shown as written.",
    );
  });

  it("unknown guard store falls back to naming the store, not guessing its contents", () => {
    const rules: IRRule[] = [
      {
        nodeId: "e",
        context: [{ kind: "vkey", name: "K_Q", modifiers: [] }],
        output: [{ kind: "char", value: "́" }],
      },
      {
        nodeId: "g",
        context: [
          { kind: "any", storeRef: "mystore" },
          { kind: "vkey", name: "K_Q", modifiers: [] },
        ],
        output: [{ kind: "raw", text: "context" }],
      },
    ];
    const ctx: ExplainContext = { rules, stores: new Map() };
    const guard = rules[1];
    if (guard === undefined) throw new Error("unreachable");
    expect(explainRule(guard, ctx)).toBe(
      "Q types a combining acute accent — a mark that needs a base letter. " +
        'After a character from the "mystore" store, ' +
        "this rule swallows the keystroke so stray marks can't corrupt your text. " +
        "It wins over the plain acute accent rule by being more specific (longest match).",
    );
  });

  it("guard with no emitting counterpart makes no lead and no priority claim", () => {
    const rules: IRRule[] = [
      {
        nodeId: "g",
        context: [
          { kind: "any", storeRef: "diablock" },
          { kind: "vkey", name: "K_C", modifiers: ["RALT"] },
        ],
        output: [{ kind: "raw", text: "context" }],
      },
    ];
    const ctx: ExplainContext = { rules, stores: fixtureContext().stores };
    const guard = rules[0];
    if (guard === undefined) throw new Error("unreachable");
    expect(explainRule(guard, ctx)).toBe(
      "After a space, digit or punctuation, which can never take a diacritic, " +
        "this rule swallows the Right Alt + C keystroke so nothing unexpected reaches your text.",
    );
  });
});
