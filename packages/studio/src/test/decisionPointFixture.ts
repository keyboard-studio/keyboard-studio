// buildDecisionPointFixture -- a base keyboard plus a DecisionSet cut at a
// decision point, run through the REAL download path (spec 106 US1, FR-001,
// contracts/decision-point-fixture.md).
//
// It seeds the studio stores exactly as a walk would leave them, then calls
// buildOutputBundle(): the same projection input, the same compile, the same
// VFS the author downloads. It never calls projectWorkingCopyVfs with
// hand-built options, so a fixture cannot drift from the product.
//
// `fallbackPolicy` is in no decision value (survey/carve/carveValue.ts), so a
// spec carries it separately. A spec that omits it runs with the store default,
// which is what every recorded walk before this field ran with.

import { makeStartKeyboard } from "@keyboard-studio/contracts";
import type {
  CompileResult,
  FallbackPolicy,
  KeyboardIR,
  MechanismAssignment,
  SimKeyInput,
  SimulationResult,
  SimulatorContextSeed,
  VirtualFS,
} from "@keyboard-studio/contracts";
import {
  applyFacetTransform,
  classifyRemovalCapabilities,
  dropUnbackedBitmapStore,
  parseKmn,
  parseTouchLayout,
  recognizePatterns,
  stripDanglingAssetStores,
} from "@keyboard-studio/engine";
import { simulate } from "@keyboard-studio/engine/simulator";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { resetRebuildTrail, rebuildWorkingCopyFromStores } from "../decisions/rebuildWorkingCopy.ts";
import type { DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";
import { buildOutputBundle } from "../lib/buildOutputBundle.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { analyseContextTolerance } from "../lib/contextToleranceAnalysis.ts";
import { applyContextToleranceDecision } from "../lib/contextToleranceApply.ts";
import { loadContextToleranceEngine } from "../lib/contextToleranceEngine.ts";
import { findTouchLayoutPath } from "../lib/findTouchLayoutPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import type { MarksTreatmentValue } from "../survey/marks/marksValue.ts";
import { checkConsistencyGates, type GateResult } from "./consistencyGates.ts";
import type { DecisionPoint } from "./decisionPointBases.ts";
import { loadVfs } from "./sc004Harness.ts";

export interface DecisionPointFixtureSpec {
  /** Corpus keyboard id. */
  base: string;
  /** Corpus group directory (`basic`, `sil`, ...). */
  group: string;
  script: string;
  displayName: string;
  track: "copy" | "adapt";
  point: DecisionPoint;
  /** Already cut at `point` (see recordToDecisionSet). */
  decisions: DecisionSet;
  /** The keyboard-wide carve fallback policy the walk ended with. Default: the store's. */
  fallbackPolicy?: FallbackPolicy;
}

export interface DecisionPointFixture {
  vfs: VirtualFS;
  keyboardId: string;
  compiled: CompileResult;
  gates: GateResult[];
  simulate(keys: SimKeyInput[], seed?: SimulatorContextSeed): SimulationResult;
  /** The starting keyboard's IR, for fidelity comparisons. */
  startIr: KeyboardIR;
}

function resetStores(): void {
  useWorkingCopyStore.getState().reset();
  useDecisionStore.getState().reset();
  useSurveySessionStore.getState().reset();
  resetRebuildTrail();
}

/**
 * Instantiate the way the open-base run does: the loader's asset clean-up, parse,
 * pattern recognition and the base's touch layout, then the track's entry point.
 */
function instantiate(spec: DecisionPointFixtureSpec): KeyboardIR {
  const vfs = loadVfs({ id: spec.base, group: spec.group });
  const kmnPath = `source/${spec.base}.kmn`;
  const fetched = readVfsText(vfs, kmnPath);
  if (fetched === undefined) throw new Error(`fixture ${kmnPath} did not load`);
  const { kmn: afterBitmap, dropped } = dropUnbackedBitmapStore(fetched, vfs);
  if (dropped !== null) vfs.set(kmnPath, afterBitmap, false);
  const { kmn, stripped } = stripDanglingAssetStores(afterBitmap, vfs);
  if (stripped.length > 0) vfs.set(kmnPath, kmn);

  let ir: KeyboardIR = recognizePatterns(parseKmn(kmn, spec.base).ir).ir;
  if (ir.touchLayout === undefined) {
    const touchPath = findTouchLayoutPath(vfs);
    const touchText = touchPath !== undefined ? readVfsText(vfs, touchPath) : undefined;
    if (touchText !== undefined) ir = { ...ir, touchLayout: parseTouchLayout(touchText) };
  }

  const base = makeStartKeyboard({
    id: spec.base,
    script: spec.script,
    path: `release/${spec.group}/${spec.base}`,
    targets: ["windows"],
    displayName: spec.displayName,
    version: "1.0",
  });
  const store = useWorkingCopyStore.getState();
  const opts = { vfs, ir, removalCapabilities: classifyRemovalCapabilities(ir) };
  if (spec.track === "copy") store.instantiateFromStart(base, opts);
  else store.instantiateFromExisting(base, opts);
  return ir;
}

/**
 * Install the slices the replay does not put where the projection reads them.
 * The carve slice is not one of them: replay installs it from `carved-layout`.
 */
function installUnreplayedSlices(decisions: DecisionSet): void {
  const store = useWorkingCopyStore.getState();

  // The replay applies the deadkey ops to the IR, but the projection replays the
  // store's overlay (serializeWorkingCopy reads `deadkeyOverlay`).
  const ops = (decisions["deadkeys-defined"]?.value as { ops?: unknown[] } | undefined)?.ops;
  if (ops !== undefined && ops.length > 0) {
    useWorkingCopyStore.setState({
      deadkeyOverlay: { ops: ops as ReturnType<typeof useWorkingCopyStore.getState>["deadkeyOverlay"]["ops"] },
    });
  }

  const assignments = (decisions["physical-layout"]?.value as { assignments?: MechanismAssignment[] } | undefined)
    ?.assignments;
  if (assignments !== undefined) store.recordAssignments(assignments);
}

/**
 * The context-tolerance overlay cannot be derived from the decision value: it is
 * the product of an async compile and simulation against the keyboard as
 * projected so far. Mirrors useContextToleranceApply.
 */
async function installToleranceOverlay(decisions: DecisionSet): Promise<void> {
  const decision = (decisions["marks-treatment"]?.value as MarksTreatmentValue | undefined)?.contextTolerance;
  if (decision === undefined || decision === null || decision.decision === "decline") return;

  const interim = await projectWorkingCopyForOutput();
  if (interim === null) throw new Error("tolerance: working copy not instantiated");
  const kmn = readVfsText(interim.vfs, `source/${interim.keyboardId}.kmn`);
  if (kmn === undefined) throw new Error("tolerance: projected .kmn missing");
  const ir = parseKmn(kmn, interim.keyboardId).ir;

  const analysed = await analyseContextTolerance(ir, () => true);
  if (analysed === null) return;
  const engine = await loadContextToleranceEngine();
  const outcome = await applyContextToleranceDecision(
    decision,
    { status: "ready", runId: 0, ...analysed },
    { engine, applyFacetTransform },
  );
  if (outcome.kind !== "applied") {
    throw new Error(`tolerance: recorded decision did not apply (${outcome.kind})`);
  }
  useWorkingCopyStore.getState().setContextToleranceOverlay({
    fingerprint: decision.fingerprint,
    acceptedSiteIds: [...decision.acceptedSiteIds],
    overlay: outcome.overlay,
  });
}

export async function buildDecisionPointFixture(spec: DecisionPointFixtureSpec): Promise<DecisionPointFixture> {
  // 1-3. clean stores, load the base, instantiate.
  resetStores();
  const startIr = instantiate(spec);

  // 4. replay every decision over the starting point.
  useDecisionStore.getState().recordAll(Object.values(spec.decisions).filter((d) => d !== undefined));
  rebuildWorkingCopyFromStores(Object.keys(spec.decisions) as DecisionId[]);

  // 5. install what replay leaves elsewhere.
  installUnreplayedSlices(spec.decisions);
  if (spec.fallbackPolicy !== undefined) useWorkingCopyStore.getState().setFallbackPolicy(spec.fallbackPolicy);
  if (spec.point === "tolerance") await installToleranceOverlay(spec.decisions);

  // 6. the real download path.
  const bundle = await buildOutputBundle();
  if (bundle === null) throw new Error("working copy not instantiated");
  // A second projection (no compile) for the G7 determinism gate.
  const again = await projectWorkingCopyForOutput();

  const compiled: CompileResult = {
    success: true,
    artifacts: Object.entries(bundle.artifacts).map(([ext, data]) => ({
      filename: `${bundle.keyboardId}.${ext}`,
      url: "",
      sizeBytes: data.byteLength,
      data,
    })),
    diagnostics: bundle.compileDiagnostics,
    compileMs: 0,
    isWarmCompile: true,
  };

  const gates = await checkConsistencyGates({
    vfs: bundle.vfs,
    keyboardId: bundle.keyboardId,
    compileDiagnostics: bundle.compileDiagnostics,
    decisions: spec.decisions,
    point: spec.point,
    startIr,
    ...(again !== null ? { repeatVfs: again.vfs } : {}),
  });

  // 7.
  return {
    vfs: bundle.vfs,
    keyboardId: bundle.keyboardId,
    compiled,
    gates,
    simulate: (keys, seed) => simulate(compiled, keys, seed),
    startIr,
  };
}
