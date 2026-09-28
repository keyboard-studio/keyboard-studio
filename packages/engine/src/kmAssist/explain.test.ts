/**
 * kmAssist explainer + inventory tests — spec 082 Track C read-only v1.
 *
 * The explainer works from rule SHAPE (the 076 FR-012 behaviour recogniser
 * is not built yet): every sentence below is asserted against shapes from
 * the sil_cameroon_qwerty fixture or explicit synthetic shapes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../codec/parse.js";
import type {
  ContextElement,
  IRRule,
  OutputElement,
  RawKmnFragment,
} from "@keyboard-studio/contracts";
import { explainFragment, explainRule } from "./explain.js";
import { summarizeInventory } from "./inventory.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");

function fixtureRules(): IRRule[] {
  const src = readFileSync(FIXTURE_PATH, "utf-8");
  const { ir } = parse(src, "sil_cameroon_qwerty");
  return ir.groups.flatMap((g) => g.rules);
}

function mustFind(label: string, pred: (r: IRRule) => boolean): IRRule {
  const found = fixtureRules().find(pred);
  if (found === undefined) throw new Error(`fixture rule not found: ${label}`);
  return found;
}

describe("explainRule — fixture shapes", () => {
  it("plain key→output: names the key and the character", () => {
    const rule = mustFind("plain a", (r) =>
      r.context.some((e) => e.kind === "vkey" && e.name === "K_A" && e.modifiers.length === 0),
    );
    expect(explainRule(rule)).toBe('A types "a".');
  });

  it("modified key→output: names modifiers and key", () => {
    const rule = mustFind("shift-ralt-0", (r) =>
      r.context.some(
        (e) => e.kind === "vkey" && e.name === "K_0" && e.modifiers.join(",") === "SHIFT,RALT",
      ),
    );
    expect(explainRule(rule)).toBe('Shift+Right Alt+0 types "”".');
  });

  it("beep suppression: `+ [SHIFT RALT K_1] > BEEP`", () => {
    const rule = mustFind("beep", (r) =>
      r.output.some((e) => e.kind === "beep") &&
      r.context.some((e) => e.kind === "vkey" && e.name === "K_1"),
    );
    expect(explainRule(rule)).toBe("Shift+Right Alt+1 beeps and produces nothing.");
  });

  it("nul suppression: `+ [T_CAM] > nul`", () => {
    const rule = mustFind("t-cam", (r) =>
      r.output.some((e) => e.kind === "raw" && e.text === "nul"),
    );
    expect(explainRule(rule)).toBe("touch key CAM produces nothing.");
  });

  it("diacritic guard: `any(diablock) + [RALT K_C] > context`", () => {
    const rule = mustFind("diablock", (r) =>
      r.context.some((e) => e.kind === "any" && e.storeRef === "diablock"),
    );
    expect(explainRule(rule)).toBe(
      'Swallows the key when a character from the "diablock" store precedes it, keeping the existing text — Right Alt+C produces nothing.',
    );
  });

  it("one-hop context: `any(composed) + [K_BKSP] > index(comp-dia,1)`", () => {
    const rule = mustFind("composed backspace", (r) =>
      r.context.some((e) => e.kind === "any" && e.storeRef === "composed"),
    );
    expect(explainRule(rule)).toBe(
      'After a character from the "composed" store and Backspace, outputs the corresponding character from the "comp-dia" store.',
    );
  });

  it("deadkey pair: `dk(003b) dk(003d) > U+003D`", () => {
    const rule = mustFind("deadkey pair", (r) =>
      r.context.filter((e) => e.kind === "deadkey").length === 2,
    );
    expect(explainRule(rule)).toBe('After deadkey 003b and deadkey 003d, outputs "=".');
  });

  it("group transition: `match > use(deadkeys)`", () => {
    const rule = mustFind("match", (r) => r.matchKind === "match");
    expect(explainRule(rule)).toBe(
      'When a rule in this group has matched, processing moves to the "deadkeys" group — a group transition, not a keystroke rule.',
    );
  });
});

describe("explainRule — synthetic shapes", () => {
  const mk = (context: ContextElement[], output: OutputElement[]): IRRule => ({
    nodeId: "r1",
    context,
    output,
  });

  it("reorder: context(N) output", () => {
    const rule = mk(
      [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      [
        { kind: "raw", text: "context(2)" },
        { kind: "raw", text: "context(1)" },
      ],
    );
    expect(explainRule(rule)).toBe(
      "Reorders the matched context, emitting context item 2 and context item 1.",
    );
  });

  it("deadkey-only output on a single key", () => {
    const rule = mk(
      [{ kind: "vkey", name: "K_X", modifiers: [] }],
      [{ kind: "deadkey", id: 0x3b }],
    );
    expect(explainRule(rule)).toBe("X sets deadkey 003b instead of typing a character.");
  });

  it("unrecognized shape says so honestly", () => {
    const rule = mk(
      [{ kind: "raw", text: "mystery(" }],
      [{ kind: "char", value: "x" }],
    );
    expect(explainRule(rule)).toBe(
      "This rule has a shape the assist layer doesn't recognise yet — it is shown as written.",
    );
  });
});

describe("explainFragment", () => {
  const frag = (sourceText: string, reason: string): RawKmnFragment => ({
    nodeId: "f1",
    origin: "imported",
    sourceText,
    reason,
  });

  it("warns on the `nomatch > nul` idiom in author language", () => {
    const text = explainFragment(frag("nomatch > nul", "unknown"));
    expect(text).toContain("swallows every unmatched keystroke");
    expect(text).toContain("Backspace and Enter");
    expect(text).toContain("Closed keyboard");
  });

  it("names opaque reasons in author language", () => {
    expect(explainFragment(frag("if(opt = '1') + [K_E] > nul", "if-option-store")))
      .toContain("keyboard option");
    expect(explainFragment(frag("dk(foo) + [K_A] > 'a'", "named-deadkey")))
      .toContain("named deadkey");
    expect(explainFragment(frag("+ [K_A] > outs(word)", "outs-expansion")))
      .toContain("entire store");
  });

  it("falls back to naming an unknown reason", () => {
    const text = explainFragment(frag("???", "future-construct"));
    expect(text).toContain("future-construct");
  });
});

describe("summarizeInventory", () => {
  it("draws store names and characters from the fixture IR", () => {
    const src = readFileSync(FIXTURE_PATH, "utf-8");
    const { ir } = parse(src, "sil_cameroon_qwerty");
    const inv = summarizeInventory(ir);

    // User stores present, in declaration order…
    expect(inv.stores).toContain("diablock");
    expect(inv.stores).toContain("word");
    expect(inv.stores).toContain("composed");
    expect(inv.stores).toContain("comp-dia");
    expect(inv.stores.indexOf("word")).toBeLessThan(inv.stores.indexOf("diablock"));
    // …system stores excluded.
    expect(inv.stores.some((s) => s.startsWith("&"))).toBe(false);

    // Characters drawn from rule outputs and user stores…
    expect(inv.chars).toContain("a");
    expect(inv.chars).toContain("ŋ"); // U+014B, produced by the fixture
    expect(inv.chars).toContain(" "); // U+0020
    // …deduplicated and sorted by code point.
    expect(new Set(inv.chars).size).toBe(inv.chars.length);
    const codes = inv.chars.map((c) => c.codePointAt(0) ?? 0);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
  });
});
