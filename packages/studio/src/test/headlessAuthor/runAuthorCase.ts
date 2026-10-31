// runAuthorCase -- the headless scripted author (spec 107).
//
// Test-only. The author is the product with the React rendering layer removed:
// it bypasses the UI and nothing else (FR-013). Below the UI it runs the
// product's own unmodified code, at the seam the UI calls it from: step routing,
// proposals, ranking and pre-selection, store actions and provenance, the
// working-copy rebuild, projection, compile and output.
//
// Its own code is only:
//   1. case input (loadCases.ts);
//   2. the walk policy's choice among the options the product offered, applied
//      through the function the UI control's handler calls (walkPolicy.ts);
//   3. the `zzq` typing where nothing is offered (placeholder.ts);
//   4. reporting (runReport.ts).
//
// Anything the author cannot reach without the UI is lifted into product code
// the UI then calls (FR-040) or listed as Playwright-only below (FR-042). It is
// never re-stated here (FR-013): no copied rule, compensating branch, shim,
// mock, direct store write or second step list. boundary.test.ts and the
// depcruise rule `product-not-to-headless-author` enforce this.
//
// The walk: load the copied keyboard exactly as the decision-point replay does
// (no store sees it yet), then from `identity` hand each step to its driver and
// complete it through lib/completeStep.ts -- the code StepHost's onComplete
// runs, with the reducer deps StudioShell injects (lib/studioReducerDeps.ts) --
// and move the session to whatever step `advance` names. No step list: the
// order is the product's routing. As in the UI, the working copy is instantiated
// only once the base and the track are both decided (commitStartKeyboard), so
// identity runs with no start keyboard. After the last step, the decisions the walk recorded go to
// spec 106's replay (buildDecisionPointFixture: rebuild, download path,
// compile, gates), the one projection (FR-005).
//
// Playwright-only (FR-042): decisions the author cannot reach without a
// behaviour change. Data lives in playwrightOnly.ts; every run report names
// these rules as `notCovered`, and playwrightOnly.test.ts keeps this table in
// step with it.
//
// | rule | component | reason |
// | intro-manual-path | survey/PhaseB.tsx (IntroChooser) | the manual flow fills no inventory draft; the author takes the build-list path the chooser pre-selects |
// | escape-banner-toggles | editors/assignLoop/DeadkeyEscapesBanner.tsx | checkbox edits to a placed deadkey's trigger escapes are free-form edits with no proposal to accept |
// | mark-for-later-review | editors/assignLoop/MechanismGallery.tsx | defers a character instead of placing it; the author always places |
// | manual-s08-pickers | editors/assignLoop/MechanismGallery.tsx | the layer-token and custom-character key pickers are free-form entry, not a proposal |
// | deadkey-card-prefill | editors/assignLoop/MechanismGallery.tsx | a chip that only prefills the deadkey card for a manual Apply; the walk dismisses it and takes the next offer |
// | back-next-unlock | components/StepHost.tsx, editors/assignLoop/MechanismGallery.tsx, survey/convenience/ConvenienceCharsStep.tsx | the author only moves forward; Back, the pop navigation branch and unlocking a completed step are navigation state |
// | existing-method-removal | editors/assignLoop/MechanismGallery.tsx | removing a method the copied keyboard already has is a deliberate edit with no proposal |
// | touch-case-pair-proposal | editors/assignLoop/TouchGallery.tsx | raised only by a touch key edit; the touch step completes with no edits |
// | oauth-author-seed | editors/adapters/flowStepDeps.ts (authenticated-profile hook) | needs a connected GitHub session; the author is a guest |
// | rebase-confirm-prompt | survey/chooseStart/confirmStartKeyboard.ts (window.confirm) | a browser dialog; the author starts from a clean working copy so it never fires |
// | language-region-pick | survey/SurveyRunner.tsx (il_language_region, routed by identityResolution) | asked only for a region-ambiguous language, as a free pick among its regions; a case names no region, so the author leaves it blank |
// | debug-pin-chip | survey/SurveyRunner.tsx (debugPinsStore) | a debug-only affordance that pins a question's value, not part of an author's decisions |
// | help-docs-dialog | editors/adapters/PhaseFGate.tsx (ConfirmDialog) | a blocking dialog over the help-docs content; dismissing it records nothing |
// | documentation-fix-proposals | components/DocumentationFixProposals.tsx | per-finding fix proposals applied by button; no walk policy accepts them |
// | more-detail-gate-yes | survey/questions/f (pf_more_detail_gate) | answering Yes opens extra Phase F questions; the author keeps the lookup default (No) |

import type { DecisionPoint } from "../decisionPointBases.ts";
import { manifest } from "../../steps/manifest.ts";
import { bindManifest, useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { getDecisionSnapshot } from "../../stores/decisionStore.ts";
import { completeStep } from "../../lib/completeStep.ts";
import { deriveInventoryCoverageGate } from "../../lib/inventoryDiff.ts";
import {
  clearTouchSeedChoice,
  createStudioRecordDecision,
  createStudioReducerDeps,
  createStudioSnapshotter,
} from "../../lib/studioReducerDeps.ts";
import {
  buildDecisionPointFixture,
  loadStartingPoint,
  type DecisionPointFixtureSpec,
  type StartingPoint,
} from "../decisionPointFixture.ts";
import type { GateResult } from "../consistencyGates.ts";
import { ownerOf } from "../decisionPointKnownGaps.fixture.ts";
import type { AuthorRun, Case } from "./caseTypes.ts";
import { eligibility, type EligibilityDeps, type Slice } from "./eligibility.ts";
import { createRunReport } from "./runReport.ts";
import { readRunRecord } from "./recordWriter.ts";
import { resetAuthorStores } from "./resetStores.ts";
import { StepFailure } from "./stepFailure.ts";
import type { DriverContext, StepDrivers } from "./stepDrivers/types.ts";
import { identityDrivers } from "./stepDrivers/identity.ts";
import { windowsLayoutDrivers } from "./stepDrivers/windowsLayout.ts";
import { catalogStartKeyboard, commitStartKeyboard, trackDrivers } from "./stepDrivers/track.ts";
import { inventoryDrivers } from "./stepDrivers/inventory.ts";
import { marksDrivers } from "./stepDrivers/marks.ts";
import { convenienceDrivers } from "./stepDrivers/convenience.ts";
import { carveDrivers } from "./stepDrivers/carve.ts";
import { mechanismDrivers } from "./stepDrivers/mechanism.ts";
import { startShipsUsableTouch, touchSeedDrivers } from "./stepDrivers/touchSeed.ts";
import { capsDrivers } from "./stepDrivers/caps.ts";

export interface AuthorRunOptions {
  /** Eligibility slice for sweeps. Default: no slice filter (US1). */
  slice?: Slice;
  /** Decision point the gates are evaluated at. Default: every decision (`tolerance`). */
  stopAfter?: DecisionPoint;
  /** Overrides for eligibility's corpus lookups (tests inject a keyboard the corpus lacks). */
  eligibilityDeps?: EligibilityDeps;
  /** Called as each step starts (the sweep records it so a killed shard names where it was). */
  onStep?: (step: string) => void;
}

/** KS_AUTHOR_TRACE=1: `[TRACE] <case> step <id> start|end <ms>` on stderr (a hung step shows as a start with no end). */
const TRACE = process.env.KS_AUTHOR_TRACE === "1";
const trace = (caseId: string, step: string, edge: "start" | "end", ms: number): void => {
  process.stderr.write(`[TRACE] ${caseId} step ${step} ${edge} ${Math.round(ms)}\n`);
};

/** Dispatch by manifest step id. Which step comes next is the routing's call, never this table's. */
const DRIVERS: StepDrivers = {
  ...identityDrivers,
  ...windowsLayoutDrivers,
  ...trackDrivers,
  ...inventoryDrivers,
  ...marksDrivers,
  ...convenienceDrivers,
  ...carveDrivers,
  ...mechanismDrivers,
  ...touchSeedDrivers,
  ...capsDrivers,
};

const TERMINALS = new Set(["done", "unsupported"]);

/** The routing visits each step a bounded number of times; more means it is stuck. */
const MAX_STEP_VISITS = 64;

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

async function walk(base: DriverContext, point: StartingPoint, onStep?: (step: string) => void): Promise<void> {
  // One recorder, as StudioShell holds one: the reducer deps record each
  // completion through it and drivers record each non-final Next (per-screen
  // answers, the base contribution) through the same instance.
  const recorder = createStudioRecordDecision(createStudioSnapshotter());
  const reducerDeps = createStudioReducerDeps({
    instantiateFromStart: useWorkingCopyStore.getState().instantiateFromStart,
    clearTouchSeedChoice,
    recordDecision: recorder,
  });
  const ctx: DriverContext = { ...base, recorder };

  let committed = false;
  let step: string = useSurveySessionStore.getState().activeStepId;
  for (let visits = 0; !TERMINALS.has(step); visits++) {
    if (visits >= MAX_STEP_VISITS) {
      throw new StepFailure({ step, kind: "step-blocked", detail: `routing did not finish in ${MAX_STEP_VISITS} steps` });
    }
    const driver = DRIVERS[step];
    if (driver === undefined) {
      throw new StepFailure({ step, kind: "step-blocked", detail: `no driver for step "${step}"` });
    }

    onStep?.(step);
    const t0 = performance.now();
    if (TRACE) trace(base.case.id, step, "start", t0);
    let result: unknown;
    try {
      result = await driver(ctx);
    } catch (e) {
      if (e instanceof StepFailure) throw e;
      throw new StepFailure({ step, kind: "proposal-threw", detail: message(e) });
    }
    if (TRACE) trace(base.case.id, step, "end", performance.now() - t0);

    const wc = useWorkingCopyStore.getState();
    const gate = deriveInventoryCoverageGate(wc);
    const outcome = completeStep(step, result, reducerDeps, {
      recordPhase: wc.recordPhase,
      allCharactersImplemented: !gate.blocked,
    });
    if (outcome.next === step) {
      const uncovered = gate.blocked
        ? `; coverage gate: desktop [${gate.unimplementedDesktop.join(" ")}] touch [${gate.unimplementedTouch.join(" ")}]`
        : "";
      throw new StepFailure({ step, kind: "step-blocked", detail: `advance() stayed on "${step}"${uncovered}` });
    }

    // StudioShell's instantiation effect: fires once the base and the track are
    // both recorded, before the session moves on.
    if (!committed) committed = commitStartKeyboard({ point, reducerDeps, recorder });

    // StepHost steps 4-5: the session moves on through its own actions.
    const session = useSurveySessionStore.getState();
    session.advance(outcome.next);
    if (outcome.setCharactersSubStage !== undefined) session.setCharactersSubStage(outcome.setCharactersSubStage);
    step = outcome.next;
  }
  if (!committed) {
    throw new StepFailure({ step, kind: "step-blocked", detail: "the walk ended before the base and the track were both decided" });
  }
}

/** G6 is not applicable (never "passed") when the copied keyboard has no touch layout (FR-050). */
function withTouchApplicability(g: GateResult, hasShippedTouch: boolean): GateResult {
  if (g.gate !== "G6" || hasShippedTouch) return g;
  return { gate: "G6", applicable: false, pass: true, detail: ["the copied keyboard has no touch layout"] };
}

export async function runAuthorCase(c: Case, opts: AuthorRunOptions = {}): Promise<AuthorRun> {
  resetAuthorStores();
  const report = createRunReport(useWorkingCopyStore.getState().fallbackPolicy);
  const base = { caseId: c.id, gates: [], report: report.report };

  try {
    const elig = eligibility(c.base, opts.slice ?? "all-eligible", opts.eligibilityDeps);
    if (!elig.eligible) return { ...base, outcome: "skipped", skipReason: elig.reason };

    const authorStart = performance.now();
    let spec: DecisionPointFixtureSpec;
    let point: StartingPoint;
    try {
      bindManifest(manifest);
      // The start keyboard as the browser lists it: catalog name, script, languages.
      const catalog = catalogStartKeyboard(c.base, elig.group);
      spec = {
        base: c.base,
        group: elig.group,
        script: catalog.script,
        displayName: catalog.displayName,
        ...(catalog.languages !== undefined ? { languages: catalog.languages } : {}),
        track: c.track,
        point: opts.stopAfter ?? "tolerance",
        decisions: {},
      };
      point = loadStartingPoint(spec);
    } catch (e) {
      return { ...base, outcome: "failed", failure: { step: "choose_base", kind: "scaffold-failed", detail: message(e) } };
    }

    // Keyed on the copied keyboard's shipped touch file: a reseed emits a layout even
    // for a keyboard that had none, so the projected package cannot answer this.
    const hasShippedTouch = startShipsUsableTouch(point.vfs);

    try {
      await walk({ case: c, startIr: point.ir, report }, point, opts.onStep);
    } catch (e) {
      if (e instanceof StepFailure) return { ...base, outcome: "failed", failure: e.failure };
      throw e;
    }
    const decisions = getDecisionSnapshot();
    const record = readRunRecord();
    // What the touch step left in the working copy, read before the replay resets the stores.
    const touchLayoutJson = useWorkingCopyStore.getState().touchLayoutJson;
    const replayStart = performance.now();

    let fx;
    try {
      fx = await buildDecisionPointFixture({ ...spec, decisions, touchLayoutJson });
    } catch (e) {
      return {
        ...base,
        outcome: "failed",
        record,
        decisions,
        failure: { step: "output", kind: "compile-failed", detail: message(e) },
      };
    }
    const end = performance.now();
    report.setTiming({ author: Math.round(replayStart - authorStart), replay: Math.round(end - replayStart) });
    const gates = fx.gates.map((g) => withTouchApplicability(g, hasShippedTouch));
    for (const g of gates) {
      const owner = g.pass ? undefined : ownerOf(c.base, spec.point, g.gate);
      if (owner !== undefined) report.addKnownGap({ gate: g.gate, owner });
    }

    return { ...base, outcome: "completed", record, decisions, bundle: fx.bundle, gates };
  } finally {
    resetAuthorStores();
  }
}
