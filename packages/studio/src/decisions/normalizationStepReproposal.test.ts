// Tests for the spec 086/093 base-switch fix: a retained normalization-step
// acceptance is fingerprinted against the OLD base, so a starting-point
// change supersedes it (recalculate → re-derive → re-propose in Marks),
// drops the stale applied overlay as part of the switch, and never
// re-applies a step without a fresh author decision.

import { beforeEach, describe, expect, it } from "vitest";
import { makeTestIR } from "@keyboard-studio/contracts/fixtures";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parseKmn, type ContextToleranceOverlay } from "@keyboard-studio/engine";

import type { QuestionModule } from "../survey/types.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import type { ExtractContext } from "./extractContext.ts";
import { seedTrail } from "./replayCheckpoints.ts";
import { supersedeNormalizationStepAcceptance } from "./normalizationStepReproposal.ts";
import {
  rebuildWorkingCopy,
  recalculateForStartingPointChangeFromStores,
  resetRebuildTrail,
  type RebuildDeps,
} from "./rebuildWorkingCopy.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useWorkingCopyStore, type AppliedContextTolerance } from "../stores/workingCopyStore.ts";
import { analyseContextTolerance } from "../lib/contextToleranceAnalysis.ts";
import { resetNormalizationStepCacheForTests } from "../lib/normalizationStepCache.ts";

const mod = (partial: Partial<QuestionModule> & { id: string }): QuestionModule =>
  ({
    definition: { id: partial.id, type: "text", prompt: partial.id },
    fixtures: { valid: [], invalid: [] },
    ...partial,
  }) as QuestionModule;

const rec = (partial: Partial<Decision> & { id: DecisionId }): Decision =>
  ({ value: undefined, provenance: "asked", ...partial }) as Decision;

const CTX = { ir: null, catalog: null } as ExtractContext;

/** The old base's step fingerprint: `normalization-step|<cache key of the old source>`. */
const OLD_STEP_FINGERPRINT = "normalization-step|old-base-cache-key";

function stepAcceptance(applied: boolean): MarksTreatmentValue {
  return {
    answers: {},
    completion: null,
    contextTolerance: {
      decision: "accept",
      acceptedSiteIds: ["normalization-step"],
      proposedSiteIds: ["normalization-step"],
      fingerprint: OLD_STEP_FINGERPRINT,
      ...(applied ? { appliedFingerprint: OLD_STEP_FINGERPRINT } : {}),
    },
  };
}

function marksRecord(value: MarksTreatmentValue): Decision {
  return rec({ id: "marks-treatment", value, provenance: "asked" });
}

const nameModule = mod({
  id: "q_name",
  provides: ["language-name"],
  writes: [["header"]],
  apply: (value) => ({ ir: { header: { name: String(value ?? "") } } }),
});
// The marks module stand-in: its real apply reads only `completion`
// (null here), never `contextTolerance` — the tolerance patch lives with
// its effect, exactly as marksTreatment.ts documents. (The real module's
// `requires: ["character-inventory"]` is omitted: no test module here
// provides it, and the ordering rule rejects an unresolved requirement.)
const marksModule = mod({
  id: "marksTreatment",
  provides: ["marks-treatment"],
  writes: [["groups"], ["stores"]],
  apply: () => ({}),
});

function deps(): RebuildDeps {
  return { modules: [nameModule, marksModule], extractContext: CTX, source: "new_kb" };
}

function baseIR(): KeyboardIR {
  return makeTestIR({ header: { name: "new-base", keyboardId: "new_kb", version: "1.0" } });
}

describe("supersedeNormalizationStepAcceptance — the pure transform", () => {
  it("supersedes an applied step acceptance, keeping the rest of the value and record whole", () => {
    const value = stepAcceptance(true);
    const record = marksRecord(value);
    const set: DecisionSet = { "marks-treatment": record, "language-name": rec({ id: "language-name", value: "Lang" }) };
    const out = supersedeNormalizationStepAcceptance(set);
    expect(out.superseded).toBe(true);
    expect(out.decisions).not.toBe(set);
    const next = out.decisions["marks-treatment"];
    expect(next).not.toBe(record);
    expect(next?.provenance).toBe("asked");
    const nextValue = next?.value as MarksTreatmentValue;
    expect(nextValue.contextTolerance).toBeNull();
    expect(nextValue.answers).toBe(value.answers);
    expect(nextValue.completion).toBeNull();
    // Untouched records keep their references; the input set is not mutated.
    expect(out.decisions["language-name"]).toBe(set["language-name"]);
    expect((record.value as MarksTreatmentValue).contextTolerance).not.toBeNull();
  });

  it("supersedes an acceptance that was recorded but never applied (no appliedFingerprint)", () => {
    const set: DecisionSet = { "marks-treatment": marksRecord(stepAcceptance(false)) };
    const out = supersedeNormalizationStepAcceptance(set);
    expect(out.superseded).toBe(true);
    expect((out.decisions["marks-treatment"]?.value as MarksTreatmentValue).contextTolerance).toBeNull();
  });

  it("leaves a decline, a 062 acceptance, and no decision exactly as they stand", () => {
    const decline: MarksTreatmentValue = {
      answers: {},
      completion: null,
      contextTolerance: { decision: "decline", acceptedSiteIds: [], proposedSiteIds: ["normalization-step"], fingerprint: OLD_STEP_FINGERPRINT },
    };
    const variants: MarksTreatmentValue = {
      answers: {},
      completion: null,
      contextTolerance: { decision: "partial", acceptedSiteIds: ["k1"], proposedSiteIds: ["k1", "k2"], fingerprint: "fp-062", appliedFingerprint: "fp-062" },
    };
    const none: MarksTreatmentValue = { answers: {}, completion: null, contextTolerance: null, guardSpecification: null };
    for (const value of [decline, variants, none]) {
      const set: DecisionSet = { "marks-treatment": marksRecord(value) };
      const out = supersedeNormalizationStepAcceptance(set);
      expect(out.superseded).toBe(false);
      expect(out.decisions).toBe(set);
    }
    const empty: DecisionSet = {};
    expect(supersedeNormalizationStepAcceptance(empty)).toEqual({ decisions: empty, superseded: false });
  });
});

describe("rebuildWorkingCopy — the supersession rides the starting-point rebuild only", () => {
  function carriedSet(): DecisionSet {
    return {
      "language-name": rec({ id: "language-name", value: "Lang", provenance: "asked" }),
      "marks-treatment": marksRecord(stepAcceptance(true)),
    };
  }

  it("(a) visitAll (base switch): the acceptance is superseded and written back; nothing is applied", () => {
    const start = baseIR();
    const out = rebuildWorkingCopy(deps(), {
      decisions: carriedSet(),
      changed: new Set<DecisionId>(),
      startingPointIR: start,
      trail: seedTrail(start),
      visitAll: true,
    });
    expect(out.normalizationStepSuperseded).toBe(true);
    const written = out.recordsToWrite.filter((r) => r.id === "marks-treatment");
    expect(written).toHaveLength(1);
    expect((written[0]?.value as MarksTreatmentValue).contextTolerance).toBeNull();
    expect((out.recalculated.decisions["marks-treatment"]?.value as MarksTreatmentValue).contextTolerance).toBeNull();
    // The superseding record keeps the author's other marks answers whole.
    expect(out.recordsToWrite.map((r) => r.id)).toEqual(["marks-treatment"]);
  });

  it("(b) an ordinary rebuild (no visitAll) leaves the standing acceptance untouched", () => {
    const start = baseIR();
    const set = carriedSet();
    const out = rebuildWorkingCopy(deps(), {
      decisions: set,
      changed: new Set<DecisionId>(["language-name"]),
      startingPointIR: start,
      trail: seedTrail(start),
    });
    expect(out.normalizationStepSuperseded).toBe(false);
    expect(out.recalculated.decisions["marks-treatment"]).toBe(set["marks-treatment"]);
    expect(out.recordsToWrite.map((r) => r.id)).not.toContain("marks-treatment");
  });

  it("(b) a base switch with NO prior step acceptance changes nothing", () => {
    const start = baseIR();
    const set: DecisionSet = {
      "language-name": rec({ id: "language-name", value: "Lang", provenance: "asked" }),
      "marks-treatment": marksRecord({ answers: {}, completion: null, contextTolerance: null, guardSpecification: null }),
    };
    const out = rebuildWorkingCopy(deps(), {
      decisions: set,
      changed: new Set<DecisionId>(),
      startingPointIR: start,
      trail: seedTrail(start),
      visitAll: true,
    });
    expect(out.normalizationStepSuperseded).toBe(false);
    expect(out.recalculated.decisions["marks-treatment"]).toBe(set["marks-treatment"]);
    expect(out.recordsToWrite).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The live entry: stores seeded the way doCommit leaves them on a switch
// (new base instantiated, retained decisions still in the store).
// ---------------------------------------------------------------------------

function stepOverlay(): AppliedContextTolerance {
  const overlay: ContextToleranceOverlay = {
    batches: [
      {
        kind: "normalization-step",
        siteKey: "normalization-step",
        groupName: "generated_context_normalize",
        originalEntry: "main",
        stores: [],
        rules: [],
      },
    ],
  };
  return { fingerprint: OLD_STEP_FINGERPRINT, acceptedSiteIds: ["normalization-step"], overlay };
}

function rulesOverlay(): AppliedContextTolerance {
  const overlay: ContextToleranceOverlay = {
    batches: [{ siteKey: "k1", groupName: "main", beforeRuleText: null, comment: "", rules: [] }],
  };
  return { fingerprint: "fp-062", acceptedSiteIds: ["k1"], overlay };
}

function seedSwitch(marksValue: MarksTreatmentValue, applied: AppliedContextTolerance | null): void {
  const newStart = makeTestIR({
    header: { name: "French Basic", keyboardId: "basic_kbdfr", version: "1.0" },
  });
  useWorkingCopyStore.setState({
    startIr: newStart,
    ir: newStart,
    startKeyboard: {
      id: "basic_kbdfr",
      path: "release/basic/basic_kbdfr",
      script: "Latn",
      targets: ["windows"],
      displayName: "French Basic",
      version: "1.0",
      languages: ["fr"],
    } as never,
    contextToleranceOverlay: applied,
  });
  useDecisionStore.getState().recordAll([
    rec({ id: "authoring-track", value: "copy", provenance: "asked" }),
    marksRecord(marksValue),
  ]);
}

describe("recalculateForStartingPointChangeFromStores — base switch, live entry", () => {
  beforeEach(() => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    resetRebuildTrail();
  });

  it("(a) prior acceptance: decision superseded in the store and the stale step overlay dropped", () => {
    seedSwitch(stepAcceptance(true), stepOverlay());
    const out = recalculateForStartingPointChangeFromStores();
    expect(out?.normalizationStepSuperseded).toBe(true);
    const value = useDecisionStore.getState().decisions["marks-treatment"]?.value as MarksTreatmentValue;
    expect(value.contextTolerance).toBeNull();
    // The old base's step no longer replays into the new base's output.
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).toBeNull();
  });

  it("(b) no prior acceptance: the switch leaves the tolerance state exactly as it stands", () => {
    seedSwitch({ answers: {}, completion: null, contextTolerance: null, guardSpecification: null }, null);
    const before = useDecisionStore.getState().decisions["marks-treatment"];
    const out = recalculateForStartingPointChangeFromStores();
    expect(out?.normalizationStepSuperseded).toBe(false);
    expect(useDecisionStore.getState().decisions["marks-treatment"]).toBe(before);
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).toBeNull();
  });

  it("(b) a 062 acceptance and its overlay are not the step's: both stand", () => {
    const value: MarksTreatmentValue = {
      answers: {},
      completion: null,
      contextTolerance: { decision: "partial", acceptedSiteIds: ["k1"], proposedSiteIds: ["k1", "k2"], fingerprint: "fp-062", appliedFingerprint: "fp-062" },
    };
    const applied = rulesOverlay();
    seedSwitch(value, applied);
    const out = recalculateForStartingPointChangeFromStores();
    expect(out?.normalizationStepSuperseded).toBe(false);
    const after = useDecisionStore.getState().decisions["marks-treatment"]?.value as MarksTreatmentValue;
    expect(after.contextTolerance?.fingerprint).toBe("fp-062");
    expect(useWorkingCopyStore.getState().contextToleranceOverlay).toBe(applied);
  });
});

// ---------------------------------------------------------------------------
// Re-derivation against the NEW base: the analysis (the Marks station's
// input) derives a fresh proposal from the new base's source alone. The
// superseded decision plays no part — and a regressed verdict on the new
// base proposes no step at all.
// ---------------------------------------------------------------------------

// The analysis fixture from contextToleranceAnalysis.test.ts: a mnemonic
// keyboard whose acute key only works on the joined form (a gap).
const NEW_BASE_KMN = [
  "store(&NAME) 'Analysis'",
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

describe("re-derivation against the new base after supersession", () => {
  beforeEach(() => {
    resetNormalizationStepCacheForTests();
  });

  it("derives a fresh step proposal for the new base, under a new fingerprint", async () => {
    const ir = parseKmn(NEW_BASE_KMN, "analysis_fixture").ir;
    const result = await analyseContextTolerance(ir, () => true, null, {});
    if (result === null) throw new Error("analysis was superseded");
    expect(result.normalizationStep).toBeDefined();
    expect(result.fixableRuleIds).toEqual(["normalization-step"]);
    // The fresh offer is keyed to the NEW base — never the old decision's
    // fingerprint, so the station cannot mistake it for the prior decision
    // and the apply hook cannot apply it without a new decision.
    expect(result.fingerprint).not.toBe(OLD_STEP_FINGERPRINT);
  }, 60_000);

  it("(c) a regressed verdict on the new base proposes no step — the 062 fallback stands", async () => {
    const ir = parseKmn(NEW_BASE_KMN, "analysis_fixture").ir;
    const result = await analyseContextTolerance(ir, () => true, null, {
      verificationLookup: () => "regressed" as const,
    });
    if (result === null) throw new Error("analysis was superseded");
    expect(result.normalizationStep).toBeUndefined();
    expect(result.fallbackReason).toBe("verification-regressed");
    expect(result.fixableRuleIds).not.toContain("normalization-step");
    expect(result.proposal.variants.length).toBeGreaterThan(0);
  }, 60_000);
});
