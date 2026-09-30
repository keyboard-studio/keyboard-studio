/**
 * kmAssist classifier tests — spec 082 Track C read-only v1.
 *
 * Classifies the real rule shapes of the sil_cameroon_qwerty fixture plus
 * synthetic edge shapes. The fixture copy lives in __fixtures__/ so these
 * tests are hermetic (the notes-dir original is the shape reference).
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
} from "@keyboard-studio/contracts";
import { classifyRuleKind } from "./classify.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(__dir, "__fixtures__/sil_cameroon_qwerty.kmn");

interface FoundRule {
  rule: IRRule;
  group: string;
  usingKeys: boolean;
}

function loadFixtureRules(): FoundRule[] {
  const src = readFileSync(FIXTURE_PATH, "utf-8");
  const { ir } = parse(src, "sil_cameroon_qwerty");
  return ir.groups.flatMap((g) =>
    g.rules.map((rule) => ({ rule, group: g.name, usingKeys: g.usingKeys })),
  );
}

function mustFind(rules: FoundRule[], label: string, pred: (r: FoundRule) => boolean): FoundRule {
  const found = rules.find(pred);
  if (found === undefined) throw new Error(`fixture rule not found: ${label}`);
  return found;
}

const deepEqual = (a: unknown, b: unknown): boolean =>
  Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((x, i) => x === b[i])
    : a === b;

const hasCtx = (els: Array<Partial<ContextElement> & { kind: string }>) =>
  (r: FoundRule): boolean =>
    els.every((want) =>
      r.rule.context.some(
        (el) =>
          el.kind === want.kind &&
          Object.entries(want).every(([k, v]) => k === "kind" || deepEqual((el as Record<string, unknown>)[k], v)),
      ),
    );

const hasOut = (els: Array<Partial<OutputElement> & { kind: string }>) =>
  (r: FoundRule): boolean =>
    els.every((want) =>
      r.rule.output.some(
        (el) =>
          el.kind === want.kind &&
          Object.entries(want).every(([k, v]) => k === "kind" || deepEqual((el as Record<string, unknown>)[k], v)),
      ),
    );

const both = (...preds: Array<(r: FoundRule) => boolean>) =>
  (r: FoundRule): boolean => preds.every((p) => p(r));

describe("classifyRuleKind — sil_cameroon_qwerty shapes", () => {
  const rules = loadFixtureRules();

  it("classifies every fixture rule without throwing", () => {
    for (const { rule } of rules) {
      const kind = classifyRuleKind(rule);
      expect(["plain-output", "context", "blocking", "reorder", "opaque"]).toContain(kind);
    }
  });

  it("plain key→output: `+ [K_SPACE] > U+0020` is plain-output", () => {
    const r = mustFind(rules, "space", both(
      hasCtx([{ kind: "vkey", name: "K_SPACE", modifiers: [] }]),
      hasOut([{ kind: "char", value: " " }]),
      // Exclude the platform('touch') space rule, which also mentions K_SPACE.
      (fr) => !fr.rule.context.some((el) => el.kind === "any"),
    ));
    expect(classifyRuleKind(r.rule)).toBe("plain-output");
  });

  it("modified plain key→output: `+ [SHIFT RALT K_0] > U+201d` is plain-output", () => {
    const r = mustFind(rules, "shift-ralt-0", both(
      hasCtx([{ kind: "vkey", name: "K_0", modifiers: ["SHIFT", "RALT"] }]),
      hasOut([{ kind: "char", value: "”" }]),
    ));
    expect(classifyRuleKind(r.rule)).toBe("plain-output");
  });

  it("beep-only output: `+ [SHIFT RALT K_1] > BEEP` is blocking", () => {
    const r = mustFind(rules, "beep", both(
      hasCtx([{ kind: "vkey", name: "K_1" }]),
      hasOut([{ kind: "beep" }]),
    ));
    expect(classifyRuleKind(r.rule)).toBe("blocking");
  });

  it("nul output: `+ [T_CAM] > nul` is blocking", () => {
    const r = mustFind(rules, "t-cam nul", both(
      hasCtx([{ kind: "vkey", name: "T_CAM" }]),
      hasOut([{ kind: "nul" }]),
    ));
    expect(classifyRuleKind(r.rule)).toBe("blocking");
  });

  it("diacritic guard: `any(diablock) + [RALT K_C] > context` is blocking", () => {
    const r = mustFind(rules, "diablock guard", both(
      hasCtx([{ kind: "any", storeRef: "diablock" }, { kind: "vkey", name: "K_C" }]),
      hasOut([{ kind: "context", offset: 0 }]),
    ));
    expect(classifyRuleKind(r.rule)).toBe("blocking");
  });

  it("one-hop context: `any(composed) + [K_BKSP] > index(comp-dia,1)` is context", () => {
    const r = mustFind(rules, "composed backspace", both(
      hasCtx([{ kind: "any", storeRef: "composed" }, { kind: "vkey", name: "K_BKSP" }]),
      hasOut([{ kind: "index", storeRef: "comp-dia" }]),
    ));
    expect(classifyRuleKind(r.rule)).toBe("context");
  });

  it("platform-guarded touch rule is context, not opaque", () => {
    const r = mustFind(rules, "platform touch", (fr) =>
      fr.rule.context.some((el) => el.kind === "raw" && /platform/i.test(el.text ?? "")),
    );
    expect(classifyRuleKind(r.rule)).toBe("context");
  });

  it("deadkey lookup: `dk(003b) any(dkf003b) > index(dkt003b, 2)` is context", () => {
    const r = mustFind(rules, "deadkey lookup", both(
      hasCtx([{ kind: "deadkey", id: 0x3b }, { kind: "any", storeRef: "dkf003b" }]),
      hasOut([{ kind: "index", storeRef: "dkt003b" }]),
    ));
    expect(classifyRuleKind(r.rule)).toBe("context");
  });

  it("group transition: `match > use(deadkeys)` is opaque", () => {
    const r = mustFind(rules, "match transition", (fr) => fr.rule.matchKind === "match");
    expect(classifyRuleKind(r.rule)).toBe("opaque");
  });

  it("plain-output rules are the majority and blockers are all visible", () => {
    const kinds = rules.map(({ rule }) => classifyRuleKind(rule));
    const count = (k: string): number => kinds.filter((x) => x === k).length;
    expect(count("plain-output")).toBeGreaterThan(count("blocking"));
    expect(count("blocking")).toBeGreaterThan(10);
    // Every `> context` / `> nul` / `> BEEP` line in the fixture is blocking.
    // 076 FR-004 parses `nul` and `context` to typed output kinds; the
    // legacy raw-text encoding is matched too for hand-built rules.
    expect(count("blocking")).toBe(
      rules.filter(({ rule }) =>
        rule.output.some(
          (el) =>
            el.kind === "beep" ||
            el.kind === "nul" ||
            (el.kind === "context" && el.offset === 0) ||
            (el.kind === "raw" && /^(nul|context)$/i.test((el.text ?? "").trim())),
        ),
      ).length,
    );
  });
});

describe("classifyRuleKind — synthetic shapes", () => {
  const mk = (context: ContextElement[], output: OutputElement[]): IRRule => ({
    nodeId: "r1",
    context,
    output,
  });

  it("context(N) output is reorder", () => {
    const rule = mk(
      [{ kind: "char", value: "a" }, { kind: "char", value: "b" }],
      [
        { kind: "raw", text: "context(2)" },
        { kind: "raw", text: "context(1)" },
      ],
    );
    expect(classifyRuleKind(rule)).toBe("reorder");
  });

  it("unrecognised raw tokens are opaque", () => {
    const rule = mk(
      [{ kind: "raw", text: "mystery(" }],
      [{ kind: "char", value: "x" }],
    );
    expect(classifyRuleKind(rule)).toBe("opaque");
  });

  it("use(group) in output is opaque (control flow, not output)", () => {
    const rule = mk(
      [{ kind: "vkey", name: "K_X", modifiers: [] }],
      [{ kind: "useGroup", groupName: "other" }],
    );
    expect(classifyRuleKind(rule)).toBe("opaque");
  });

  it("empty output is opaque", () => {
    const rule = mk([{ kind: "vkey", name: "K_X", modifiers: [] }], []);
    expect(classifyRuleKind(rule)).toBe("opaque");
  });

  it("nomatch group transition is opaque", () => {
    const rule: IRRule = {
      nodeId: "r1",
      context: [],
      output: [{ kind: "raw", text: "use(other)" }],
      matchKind: "nomatch",
    };
    expect(classifyRuleKind(rule)).toBe("opaque");
  });

  it("single deadkey context with output is context, not plain-output", () => {
    const rule = mk(
      [{ kind: "deadkey", id: 0x3b }, { kind: "deadkey", id: 0x3d }],
      [{ kind: "char", value: "=" }],
    );
    expect(classifyRuleKind(rule)).toBe("context");
  });
});
