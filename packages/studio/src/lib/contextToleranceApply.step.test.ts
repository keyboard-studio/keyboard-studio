// Applying an accepted normalization-step decision (spec 086 FR-017): one
// all-or-nothing site, verified through the facet-transform gate, recorded as a
// `normalization-step` overlay batch the projection replays.

import { describe, expect, it } from "vitest";
import {
  applyContextToleranceOverlay,
  applyFacetTransform,
  emitKmn,
  isNormalizationStepBatch,
  parseKmn,
  removeContextToleranceOverlay,
} from "@keyboard-studio/engine";

import { analyseContextTolerance } from "./contextToleranceAnalysis.ts";
import { applyContextToleranceDecision, contextTolerancePatch } from "./contextToleranceApply.ts";
import { loadContextToleranceEngine } from "./contextToleranceEngine.ts";
import type { ContextToleranceState } from "../stores/workingCopyStore.ts";

type Ready = Extract<ContextToleranceState, { status: "ready" }>;

const KMN = [
  "store(&NAME) 'Apply'",
  "store(&VERSION) '14.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "begin Unicode > use(main)",
  "group(main) using keys",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

async function analyse(): Promise<{ analysis: Ready; ir: ReturnType<typeof parseKmn>["ir"] }> {
  const ir = parseKmn(KMN, "step_fixture").ir;
  const result = await analyseContextTolerance(ir, () => true);
  if (result === null) throw new Error("analysis was superseded");
  return { analysis: { status: "ready", runId: 1, ...result }, ir };
}

describe("applyContextToleranceDecision for a normalization step (spec 086)", () => {
  it("accept records one step batch that replays as the new entry point, original rules unchanged", async () => {
    const { analysis, ir } = await analyse();
    expect(analysis.normalizationStep).toBeDefined();
    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      { acceptedSiteIds: ["normalization-step"], fingerprint: analysis.fingerprint },
      analysis,
      { engine, applyFacetTransform },
    );
    expect(outcome.kind).toBe("applied");
    if (outcome.kind !== "applied") return;
    expect(outcome.overlay.batches).toHaveLength(1);
    expect(isNormalizationStepBatch(outcome.overlay.batches[0]!)).toBe(true);

    const fixed = applyContextToleranceOverlay(parseKmn(emitKmn(ir), "step_fixture").ir, outcome.overlay);
    const text = emitKmn(fixed.ir);
    expect(text).toContain("begin Unicode > use(generated_context_normalize)");
    expect(text).toContain("any(base) + any(key.act) > index(acute, 1)");
    expect(text).toContain("+ U+005D > U+00B4");

    // The working IR carries no step: the patch leaves its groups alone, both ways.
    const ops = { removeContextToleranceOverlay, applyContextToleranceOverlay };
    expect(contextTolerancePatch(ir, null, outcome.overlay, ops).groups).toEqual(ir.groups);
    expect(contextTolerancePatch(ir, outcome.overlay, null, ops).groups).toEqual(ir.groups);
  }, 60_000);

  it("a decline (no accepted site) applies nothing", async () => {
    const { analysis } = await analyse();
    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      { acceptedSiteIds: [], fingerprint: analysis.fingerprint },
      analysis,
      { engine, applyFacetTransform },
    );
    expect(outcome.kind).toBe("stale");
  }, 60_000);

  it("re-analysing with the step applied reports no gap and the same fingerprint", async () => {
    const { analysis, ir } = await analyse();
    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      { acceptedSiteIds: ["normalization-step"], fingerprint: analysis.fingerprint },
      analysis,
      { engine, applyFacetTransform },
    );
    if (outcome.kind !== "applied") throw new Error("expected applied");
    const projected = parseKmn(emitKmn(applyContextToleranceOverlay(ir, outcome.overlay).ir), "step_fixture").ir;
    const again = await analyseContextTolerance(projected, () => true, {
      fingerprint: analysis.fingerprint,
      acceptedSiteIds: ["normalization-step"],
      overlay: outcome.overlay,
    });
    expect(again?.fingerprint).toBe(analysis.fingerprint);
    expect(Object.values(again?.classification ?? {})).not.toContain("gap");
    expect(Object.values(again?.classification ?? {})).toContain("made-tolerant");
  }, 60_000);

  // Issue #2395: the decision fingerprint covers only the gap rules the step
  // fixes and the step's own content, so a later step that changes unrelated
  // IR (here the touch seed adding touch-only rules, as on sil_cameroon_qwerty)
  // must not drop the accepted normalization.
  it("an unrelated later-step change keeps the accepted decision applied", async () => {
    const { analysis } = await analyse();
    const decision = { acceptedSiteIds: ["normalization-step"], fingerprint: analysis.fingerprint };

    const touched = parseKmn(
      [KMN, "group(touch) using keys", "+ [T_A] > U+00B4", "+ [T_B] > U+00B4", ""].join("\n"),
      "step_fixture",
    ).ir;
    const later = await analyseContextTolerance(touched, () => true);
    if (later === null) throw new Error("analysis was superseded");
    // The fingerprint survives the unrelated change: same gap rules, same step.
    expect(later.fingerprint).toBe(analysis.fingerprint);
    expect(later.normalizationStep).toBeDefined();

    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      decision,
      { status: "ready", runId: 2, ...later },
      { engine, applyFacetTransform },
    );
    expect(outcome.kind).toBe("applied");
  }, 60_000);

  // Control for the above: a real change to one of the normalized (gap) rules
  // must still invalidate the decision.
  it("a change to a gap rule invalidates the decision", async () => {
    const { analysis } = await analyse();
    const decision = { acceptedSiteIds: ["normalization-step"], fingerprint: analysis.fingerprint };

    const edited = parseKmn(
      KMN.replace("any(base) + any(key.act) > index(acute,1)", "any(acute) + any(key.act) > index(acute,1)"),
      "step_fixture",
    ).ir;
    const later = await analyseContextTolerance(edited, () => true);
    if (later === null) throw new Error("analysis was superseded");
    expect(later.normalizationStep).toBeDefined();
    expect(later.fingerprint).not.toBe(analysis.fingerprint);

    const engine = await loadContextToleranceEngine();
    const outcome = await applyContextToleranceDecision(
      decision,
      { status: "ready", runId: 2, ...later },
      { engine, applyFacetTransform },
    );
    expect(outcome.kind).toBe("stale");
  }, 60_000);
});
