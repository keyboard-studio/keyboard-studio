// Provenance-matrix tests for the recalculation rule (spec 093 T007):
// US1 scenarios 1 (extracted re-runs), 2 (default/derived recompute),
// 3 (asked kept when valid) and 6 (gated-off kept inactive, restored).

import { describe, it, expect } from "vitest";
import type { QuestionModule } from "../survey/types.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { providerFromModules } from "./replayKeyboard.ts";
import { recalculate, type RecalculateDeps } from "./recalculate.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule => ({
  definition: { id: partial.id, type: "text", prompt: partial.id },
  fixtures: { valid: [], invalid: [] },
  ...partial,
} as QuestionModule);

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

// A tiny chain: language-name → language-code → target-script, plus an
// unrelated author-name. The bundle's "evidence" is a mutable stand-in for
// the starting point, so a test can move it the way a change would.
let bundleScript = "Latn";
let bundleDefault = "default-a";

const nameModule = mod({ id: "q_name", provides: ["language-name"] });
const codeModule = mod({
  id: "q_code",
  provides: ["language-code"],
  requires: ["language-name"],
});
const scriptModule = mod({
  id: "q_script",
  provides: ["target-script"],
  requires: ["language-code"],
  extract: () => bundleScript,
  lookupDefault: () => ({ value: bundleDefault, source: "lookup" }),
});
const authorModule = mod({
  id: "q_author",
  provides: ["author-name"],
  requires: ["target-script"],
  validate: (v) => ({ ok: typeof v === "string" && v.length > 0 }),
});

const MODULES = [nameModule, codeModule, scriptModule, authorModule];
const ORDER: DecisionId[] = ["language-name", "language-code", "target-script", "author-name"];
const CTX = { ir: null, catalog: null } as ExtractContext;

function deps(extra: Partial<RecalculateDeps> = {}): RecalculateDeps {
  return {
    providerFor: providerFromModules(MODULES),
    modules: MODULES,
    extractContext: CTX,
    source: "base_kb",
    ...extra,
  };
}

function run(decisions: DecisionSet, changed: DecisionId[], extra?: Partial<RecalculateDeps>) {
  return recalculate(deps(extra), {
    decisions,
    changed: new Set(changed),
    order: ORDER,
  });
}

describe("recalculate — scenario 1: extracted re-runs extract", () => {
  it("re-extracts a downstream extracted record when an input changes", () => {
    bundleScript = "Latn";
    const decisions: DecisionSet = {
      "language-name": rec({ id: "language-name", value: "Lang", provenance: "asked" }),
      "language-code": rec({ id: "language-code", value: "lg", provenance: "asked" }),
      "target-script": rec({
        id: "target-script",
        value: "Latn",
        provenance: "extracted",
        source: "base_kb",
      }),
    };
    bundleScript = "Grek"; // the starting point's evidence moved
    const out = run(decisions, ["language-code"]);
    expect(out.recomputed).toEqual(["target-script"]);
    expect(out.decisions["target-script"]?.value).toBe("Grek");
    expect(out.decisions["target-script"]?.provenance).toBe("extracted");
    expect(out.decisions["target-script"]?.source).toBe("base_kb");
    // The changed record and upstream records are untouched references.
    expect(out.decisions["language-code"]).toBe(decisions["language-code"]);
    expect(out.decisions["language-name"]).toBe(decisions["language-name"]);
  });

  it("leaves an extracted record alone when the re-extract agrees", () => {
    bundleScript = "Latn";
    const decisions: DecisionSet = {
      "language-code": rec({ id: "language-code", value: "lg", provenance: "asked" }),
      "target-script": rec({
        id: "target-script",
        value: "Latn",
        provenance: "extracted",
        source: "base_kb",
      }),
    };
    const out = run(decisions, ["language-code"]);
    expect(out.recomputed).toEqual([]);
    expect(out.decisions["target-script"]).toBe(decisions["target-script"]);
  });
});

describe("recalculate — scenario 2: default/derived recompute", () => {
  it("re-runs a default's lookup when an input changes", () => {
    bundleDefault = "default-b";
    const decisions: DecisionSet = {
      "language-code": rec({ id: "language-code", value: "lg", provenance: "asked" }),
      "target-script": rec({
        id: "target-script",
        value: "default-a",
        provenance: "default",
        source: "lookup",
      }),
    };
    const out = run(decisions, ["language-code"]);
    expect(out.recomputed).toEqual(["target-script"]);
    expect(out.decisions["target-script"]?.value).toBe("default-b");
  });

  it("recomputes a derived record through the recompute seam", () => {
    // Its own module set: a derived provider with no extract/lookupDefault
    // hooks, so the recompute seam is the only fresh-value source.
    const derivedScript = mod({
      id: "q_script_derived",
      provides: ["target-script"],
      requires: ["language-code"],
    });
    const modules = [nameModule, codeModule, derivedScript];
    const decisions: DecisionSet = {
      "language-code": rec({ id: "language-code", value: "lg2", provenance: "asked" }),
      "target-script": rec({
        id: "target-script",
        value: "from-lg",
        provenance: "derived",
      }),
    };
    const out = recalculate(
      {
        providerFor: providerFromModules(modules),
        modules,
        extractContext: CTX,
        recomputeValue: (_mod, _record, current) =>
          `from-${String(current["language-code"]?.value)}`,
      },
      { decisions, changed: new Set<DecisionId>(["language-code"]), order: ORDER },
    );
    expect(out.recomputed).toEqual(["target-script"]);
    expect(out.decisions["target-script"]?.value).toBe("from-lg2");
    // The inputs snapshot refreshes to what the recompute actually read.
    expect(out.decisions["target-script"]?.inputs).toEqual({ "language-code": "lg2" });
  });

  it("keeps a derived record when no recompute source exists (never fabricates)", () => {
    const derivedScript = mod({
      id: "q_script_derived2",
      provides: ["target-script"],
      requires: ["language-code"],
    });
    const modules = [nameModule, codeModule, derivedScript];
    const decisions: DecisionSet = {
      "language-code": rec({ id: "language-code", value: "lg2", provenance: "asked" }),
      "target-script": rec({ id: "target-script", value: "from-lg", provenance: "derived" }),
    };
    const out = recalculate(
      {
        providerFor: providerFromModules(modules),
        modules,
        extractContext: CTX,
      },
      { decisions, changed: new Set<DecisionId>(["language-code"]), order: ORDER },
    );
    expect(out.recomputed).toEqual([]);
    expect(out.decisions["target-script"]).toBe(decisions["target-script"]);
  });
});

describe("recalculate — scenario 3: asked kept when valid", () => {
  it("keeps a still-valid asked record byte-for-byte (same reference)", () => {
    const decisions: DecisionSet = {
      "target-script": rec({ id: "target-script", value: "Latn", provenance: "extracted" }),
      "author-name": rec({
        id: "author-name",
        value: "Test Author",
        provenance: "asked",
        inputs: { "target-script": "Latn" },
      }),
    };
    bundleScript = "Grek"; // upstream moves; the asked value still validates
    const out = run(decisions, ["target-script"]);
    expect(out.decisions["author-name"]).toBe(decisions["author-name"]);
    expect(out.reproposed).toEqual([]);
  });
});

describe("recalculate — scenario 6: gated off → inactive; gate clears → restored", () => {
  it("marks a gated-off record inactive, keeping value and provenance whole", () => {
    const decisions: DecisionSet = {
      "language-code": rec({ id: "language-code", value: "lg", provenance: "asked" }),
      "target-script": rec({
        id: "target-script",
        value: "Latn",
        provenance: "extracted",
        source: "base_kb",
      }),
    };
    const out = run(decisions, ["language-code"], {
      isActive: (id) => id !== "target-script",
    });
    expect(out.inactivated).toEqual(["target-script"]);
    const record = out.decisions["target-script"];
    expect(record?.inactive).toBe(true);
    expect(record?.value).toBe("Latn");
    expect(record?.provenance).toBe("extracted");
    expect(out.recomputed).toEqual([]);
  });

  it("restores an inactive record unchanged when the gate clears", () => {
    const decisions: DecisionSet = {
      "language-code": rec({ id: "language-code", value: "lg", provenance: "asked" }),
      "target-script": rec({
        id: "target-script",
        value: "Latn",
        provenance: "extracted",
        source: "base_kb",
        inactive: true,
      }),
    };
    const out = run(decisions, ["language-code"], { isActive: () => true });
    expect(out.reactivated).toEqual(["target-script"]);
    const record = out.decisions["target-script"];
    expect(record?.inactive).toBeUndefined();
    expect(record?.value).toBe("Latn");
    // Restored unchanged — not recomputed in the same pass.
    expect(out.recomputed).toEqual([]);
  });

  it("does not revisit decisions outside the closure", () => {
    // A module set where author-name requires nothing: it is not
    // downstream of language-name, so the rule must not touch it.
    const standaloneAuthor = mod({ id: "q_author_solo", provides: ["author-name"] });
    const modules = [nameModule, codeModule, scriptModule, standaloneAuthor];
    const decisions: DecisionSet = {
      "language-name": rec({ id: "language-name", value: "Lang", provenance: "asked" }),
      "author-name": rec({
        id: "author-name",
        value: "Test Author",
        provenance: "asked",
      }),
    };
    const out = recalculate(
      {
        providerFor: providerFromModules(modules),
        modules,
        extractContext: CTX,
        validateValue: () => false, // would re-propose if visited — must not be
      },
      { decisions, changed: new Set<DecisionId>(["language-name"]), order: ORDER },
    );
    expect(out.reproposed).toEqual([]);
    expect(out.decisions["author-name"]).toBe(decisions["author-name"]);
  });
});
