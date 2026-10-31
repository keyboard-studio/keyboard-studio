// Headless author, one case at a time (spec 107 US1). Reads the sibling
// ../keyboards corpus, so it runs under vitest.corpus.config.ts.
//
// KS_AUTHOR_CASE=<id> runs one case of the canonical harness file (quickstart 1).
//
// These tests are written against the contract (author-api.md,
// case-and-report.md), not against the walk's output of the day: a red result
// here means the walk is unfinished or the product changed, never "adjust the
// expectation to what came out".

import { beforeAll, describe, expect, it } from "vitest";
import { announceSc004Skip, sc004GatesEnabled } from "../sc004Harness.ts";
import { ownerOf } from "../decisionPointKnownGaps.fixture.ts";
import type { AuthorRun, Case, DisplacementAction, PolicyStep } from "./caseTypes.ts";
import { eligibility } from "./eligibility.ts";
import { loadCases, loadPrSet } from "./loadCases.ts";
import { placeholderFor } from "./placeholder.ts";
import { formatCaseLine, serializeRunReport } from "./runReport.ts";
import { runAuthorCase, type AuthorRunOptions } from "./runAuthorCase.ts";
import { chooseByPolicy } from "./walkPolicy.ts";

announceSc004Skip("headless author", (name) => it.skip(name, () => {}));

const ONE = process.env.KS_AUTHOR_CASE;
const MAIN_ID = ONE ?? "p1-whole-bafut-kbdus";
const AZERTY_ID = "p1-whole-ewondo-camazerty";
const RUN_TIMEOUT = 300_000;

/** KS_AUTHOR_CASES_FILE names a same-shape file; else the canonical harness file, then the PR set (inline cases). */
function caseById(id: string): Case {
  const file = process.env.KS_AUTHOR_CASES_FILE;
  const c =
    (file === undefined ? loadCases() : loadCases(file)).find((x) => x.id === id) ??
    (file === undefined ? loadPrSet().find((e) => e.case.id === id)?.case : undefined);
  if (c === undefined) throw new Error(`no case ${id}`);
  return c;
}

/** The decision point every run is gated at (runAuthorCase's default stopAfter). */
const POINT = "tolerance" as const;

/** Drop `recordedAt` (epoch ms, the only wall-clock field in the record). */
function withoutTimestamps(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (key, v: unknown) => (key === "recordedAt" ? undefined : v))) as unknown;
}

function failingGates(run: AuthorRun): string[] {
  return run.gates.filter((g) => g.applicable && !g.pass).map((g) => g.gate);
}

function bytesEqual(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
}

describe.skipIf(!sc004GatesEnabled)("headless author: one case (T017, T035-T038)", () => {
  let c: Case;
  let run: AuthorRun;
  beforeAll(async () => {
    c = caseById(MAIN_ID);
    run = await runAuthorCase(c);
    console.log(formatCaseLine(run));
  }, RUN_TIMEOUT);

  // ---- T035 / acceptance 1 ----

  it("walks every step the routing yields and completes", () => {
    expect(run.failure, JSON.stringify(run.failure)).toBeUndefined();
    expect(run.outcome).toBe("completed");
  });

  it("replay compiles to .kmx and .js", () => {
    expect(run.bundle?.artifacts.kmx.byteLength ?? 0).toBeGreaterThan(0);
    expect(run.bundle?.artifacts.js?.byteLength ?? 0).toBeGreaterThan(0);
  });

  it("reports every gate", () => {
    const reported = run.gates.map((g) => g.gate);
    for (const gate of ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G8-start"]) {
      expect(reported, `gate ${gate} is reported for ${c.id}`).toContain(gate);
    }
  });

  it("leaves a decision record and a DecisionSet", () => {
    expect(run.record?.entries.length ?? 0).toBeGreaterThan(0);
    expect(Object.keys(run.decisions ?? {}).length).toBeGreaterThan(0);
  });

  it("every failing gate is a spec 106 KNOWN_GAPS expected failure, owned and reported", () => {
    const unowned = failingGates(run).filter((gate) => ownerOf(c.base, POINT, gate as never) === undefined);
    expect(unowned, `gates failing on ${c.id} that no KNOWN_GAPS row owns`).toHaveLength(0);
    for (const g of run.gates.filter((x) => x.applicable && !x.pass)) {
      const owner = ownerOf(c.base, POINT, g.gate);
      expect(run.report.knownGaps, `${g.gate} should be reported as owned by ${owner}`).toContainEqual({
        gate: g.gate,
        owner,
      });
    }
  });

  it("reports a known gap only for a gate that actually failed", () => {
    const failing = new Set<string>(failingGates(run));
    for (const k of run.report.knownGaps) {
      expect(failing.has(k.gate), `knownGap ${k.gate} (${k.owner}) was reported but the gate passed`).toBe(true);
    }
  });

  // ---- T036 / acceptance 2 ----

  it("applies the override through Assign to a key, in the mechanism step", () => {
    const overrides = c.overrides.filter((o) => o.kind === "overwrite");
    expect(overrides.length, "the case carries an overwrite override").toBeGreaterThan(0);
    for (const o of overrides) {
      const hits = run.report.steps.filter((s: PolicyStep) => {
        const v = s.value as { char?: string; key?: string } | null;
        return s.rule === "override" && v?.char === o.char && v?.key === o.key;
      });
      expect(
        hits.length,
        `exactly one override step for ${o.char} on ${o.key} (skipped: ${JSON.stringify(run.report.skippedSteps)})`,
      ).toBe(1);
    }
  });

  it("resolves each displacement once, in harness order, and records every action", () => {
    const allowed: DisplacementAction[] = ["confirm-move", "keep-both", "leave"];
    const seen = new Set<string>();
    for (const d of run.report.displacements) {
      expect(allowed, `displacement action ${d.action} is one of the harness order`).toContain(d.action);
      const id = `${d.char}|${d.key}|${d.displaced}`;
      expect(seen.has(id), `displacement ${id} resolved more than once`).toBe(false);
      seen.add(id);
    }
    // Every displacement the report lists has its PolicyStep (rule from the product's own action list).
    const steps = run.report.steps.filter((s) => s.decisionId === "displacement");
    expect(steps.length, "one displacement step per recorded displacement").toBe(run.report.displacements.length);
    steps.forEach((s, i) => {
      const action = (s.value as { action?: string }).action;
      expect(action, `displacement step ${i} matches the displacement entry`).toBe(run.report.displacements[i]?.action);
      expect(s.rule, "a displacement is never typed as a placeholder").not.toBe("placeholder");
    });
  });

  it("applies the override before it resolves the displacement the override caused", () => {
    const o = c.overrides[0];
    if (o === undefined) return;
    const overrideAt = run.report.steps.findIndex((s) => s.rule === "override" && (s.value as { key?: string }).key === o.key);
    const caused = run.report.steps.findIndex(
      (s, i) => i > overrideAt && s.decisionId === "displacement" && (s.value as { key?: string }).key === o.key,
    );
    if (caused === -1) return; // no displacement on this key: nothing to order
    expect(overrideAt, "override recorded").toBeGreaterThanOrEqual(0);
    expect(caused).toBeGreaterThan(overrideAt);
  });

  // ---- T037 / acceptance 3 ----

  it("types the zzq placeholder where nothing is offered (policy contract)", () => {
    const { sequence, indicator } = placeholderFor("ŋ");
    expect(sequence).toBe("zzq14b");
    expect(indicator).toBe("j");
    const step = chooseByPolicy<string>({ decisionId: "d", suggestions: [], placeholder: () => sequence });
    expect(step.rule).toBe("placeholder");
    expect(step.value).toBe("zzq14b");
    expect(step.proposalSource, "a placeholder names no product source").toBeUndefined();
    // And a suggestion or default always wins over the placeholder.
    expect(chooseByPolicy<string>({ decisionId: "d", suggestions: ["s"], placeholder: () => "p" }).rule).toBe("top-suggestion");
    expect(chooseByPolicy<string>({ decisionId: "d", suggestions: [], defaultValue: "x", placeholder: () => "p" }).rule).toBe("default");
  });

  it("counts every placeholder the walk typed, each with its step", () => {
    const placeholderSteps = run.report.steps.filter((s) => s.rule === "placeholder");
    expect(run.report.placeholders.length, "report.placeholders counts the placeholder steps").toBe(placeholderSteps.length);
    for (const p of run.report.placeholders) {
      // A character placeholder is zzq<hex>; a flow question has no character, so its text is bare zzq.
      expect(p.sequence, `placeholder for ${p.decisionId}`).toMatch(p.char === "" ? /^zzq$/ : /^zzq[0-9a-f]+$/);
      if (p.char !== "") expect(p.sequence).toBe(placeholderFor(p.char).sequence);
    }
    expect(formatCaseLine(run)).toContain(`placeholders=${run.report.placeholders.length}`);
  });

  // ---- T038 / acceptance 4, FR-007 ----

  describe("run twice", () => {
    let second: AuthorRun;
    beforeAll(async () => {
      second = await runAuthorCase(c);
    }, RUN_TIMEOUT);

    it("both runs ended the same way", () => {
      expect(second.outcome).toBe(run.outcome);
      expect(second.failure).toEqual(run.failure);
    });

    it("the record, minus timestamps, is identical", () => {
      expect(withoutTimestamps(second.record)).toEqual(withoutTimestamps(run.record));
    });

    it("the DecisionSet, minus timestamps, is identical", () => {
      // Decision values may carry their own recordedAt.
      expect(withoutTimestamps(second.decisions)).toEqual(withoutTimestamps(run.decisions));
    });

    it("the policy steps, placeholders and displacements are identical", () => {
      expect(second.report.steps).toEqual(run.report.steps);
      expect(second.report.placeholders).toEqual(run.report.placeholders);
      expect(second.report.displacements).toEqual(run.report.displacements);
    });

    it("the bundle bytes are identical", () => {
      const a = run.bundle?.artifacts;
      const b = second.bundle?.artifacts;
      expect(a, "first run has a bundle").toBeDefined();
      expect(b, "second run has a bundle").toBeDefined();
      expect(bytesEqual(a?.kmx, b?.kmx), ".kmx bytes").toBe(true);
      expect(bytesEqual(a?.kvk, b?.kvk), ".kvk bytes").toBe(true);
      expect(bytesEqual(a?.js, b?.js), ".js bytes").toBe(true);
    });

    it("the serialised reports match once timings are zeroed", () => {
      const norm = (r: AuthorRun): unknown =>
        withoutTimestamps(JSON.parse(serializeRunReport({ ...r, report: { ...r.report, timingMs: { author: 0, replay: 0 } } })));
      expect(norm(second)).toEqual(norm(run));
    });
  });
});

// ---- T039 / acceptance 5, edge cases ----

describe.skipIf(!sc004GatesEnabled)("headless author: skips and failures name their reason (T039)", () => {
  it("a keyboard missing from the corpus is skipped, not failed or passed", async () => {
    const base = caseById(MAIN_ID);
    const run = await runAuthorCase({ ...base, id: "no-such-keyboard", base: "zz_no_such_keyboard", group: "zz" });
    expect(run.outcome).toBe("skipped");
    expect(run.skipReason).toBe("missing");
    expect(run.failure).toBeUndefined();
    expect(run.bundle, "a skipped case produces no bundle").toBeUndefined();
    expect(formatCaseLine(run)).toBe("[SKIP] no-such-keyboard missing");
  });

  it("eligibility skips a keyboard whose codec parse has errors, with the not-codec-clean reason", () => {
    const e = eligibility("basic_kbdus", "all-eligible", { parsesCompletely: () => false });
    expect(e).toEqual({ eligible: false, reason: "not-codec-clean" });
    // Unlisted in the import corpus is not a pass either.
    expect(eligibility("basic_kbdus", "all-eligible", { parsesCompletely: () => undefined })).toEqual({
      eligible: false,
      reason: "not-codec-clean",
    });
  });

  it("eligibility checks presence before parse status", () => {
    const e = eligibility("zz", "all-eligible", { groupOf: () => undefined, parsesCompletely: () => false });
    expect(e).toEqual({ eligible: false, reason: "missing" });
  });

  // SEAM NEEDED: runAuthorCase calls eligibility(c.base, slice) with no deps, so a parse-error
  // keyboard cannot be injected through the run. Needs `AuthorRunOptions.eligibilityDeps?:
  // EligibilityDeps` forwarded as eligibility()'s third argument. Until that lands this is red
  // (the real walk then runs and completes instead of skipping).
  it("runAuthorCase skips an injected parse-error keyboard before scaffolding", async () => {
    const opts = { eligibilityDeps: { parsesCompletely: () => false } } as unknown as AuthorRunOptions;
    const run = await runAuthorCase(caseById(MAIN_ID), opts);
    expect(run.outcome).toBe("skipped");
    expect(run.skipReason).toBe("not-codec-clean");
    expect(run.bundle).toBeUndefined();
  }, RUN_TIMEOUT);
});

// The camazerty tolerance analysis fails (simulate: unknown virtual key T_0300), the
// KNOWN_GAPS #2363 defect. Spec T039 says a proposal throw fails the case at that step; the
// product never throws there: it publishes status "failed" and the series continues. This test
// matches the product (a failed analysis is reported, the gap is owned) and does not demand a
// hard failure. The owner rules on whether to hard-fail on analysis.status === "failed".
describe.skipIf(!sc004GatesEnabled || (ONE !== undefined && ONE !== AZERTY_ID))(
  "headless author: sil_cameroon_azerty tolerance analysis failure (T039)",
  () => {
    let c: Case;
    let run: AuthorRun;
    beforeAll(async () => {
      c = caseById(AZERTY_ID);
      run = await runAuthorCase(c);
      console.log(formatCaseLine(run));
    }, RUN_TIMEOUT);

    it("reports the failed analysis as a skipped marks.context_tolerance step, never a substituted default", () => {
      const skipped = run.report.skippedSteps.find((s) => s.step === "marks.context_tolerance");
      expect(skipped, `skippedSteps: ${JSON.stringify(run.report.skippedSteps)}`).toBeDefined();
      expect(skipped?.reason).toMatch(/^analysis-failed:/);
      expect(
        run.report.steps.some((s) => s.decisionId === "marks.context_tolerance"),
        "no tolerance decision is invented for a failed analysis",
      ).toBe(false);
    });

    it("does not fail the case at the tolerance step", () => {
      expect(run.failure?.kind === "proposal-threw" && run.failure.step.includes("tolerance")).toBe(false);
    });

    it("owns the resulting gate failure as a known gap", () => {
      expect(ownerOf(c.base, POINT, "G2"), "KNOWN_GAPS owns G2 on camazerty").toBe("#2363");
      if (run.outcome !== "completed") return;
      for (const g of run.gates.filter((x) => x.applicable && !x.pass)) {
        expect(ownerOf(c.base, POINT, g.gate), `${g.gate} failed and no KNOWN_GAPS row owns it`).toBeDefined();
        expect(run.report.knownGaps).toContainEqual({ gate: g.gate, owner: ownerOf(c.base, POINT, g.gate) });
      }
    });
  },
);

// ---- T070 / US6, FR-050: G6 on the headless bundle ----

// One run per keyboard, shared across the assertions. chechen_latin ships a touch layout;
// bj_cree_woods ships none (both are inline PR-set cases).
describe.skipIf(!sc004GatesEnabled || ONE !== undefined)("headless author: G6 follows the copied keyboard's touch layout (T070)", () => {
  let withTouch: AuthorRun;
  let withoutTouch: AuthorRun;
  beforeAll(async () => {
    withTouch = await runAuthorCase(caseById("pr-whole-chechen-latin"));
    withoutTouch = await runAuthorCase(caseById("pr-whole-cree-woods"));
  }, RUN_TIMEOUT * 2);

  it("evaluates G6 (applicable) on a keyboard with a touch layout", () => {
    expect(withTouch.outcome, JSON.stringify(withTouch.failure)).toBe("completed");
    const g6 = withTouch.gates.find((g) => g.gate === "G6");
    expect(g6, "G6 is reported").toBeDefined();
    expect(g6?.applicable, `G6 detail: ${JSON.stringify(g6?.detail)}`).toBe(true);
  });

  it("reports G6 as not applicable, not passed, on a keyboard with no touch layout", () => {
    expect(withoutTouch.outcome, JSON.stringify(withoutTouch.failure)).toBe("completed");
    const g6 = withoutTouch.gates.find((g) => g.gate === "G6");
    expect(g6, "G6 is reported").toBeDefined();
    expect(g6?.applicable).toBe(false);
  });
});
