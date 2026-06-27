// Studio root — hash-based router + nav bar.
//
// Routes:
//   #survey  (default)  — full authoring wizard: identity → base → track →
//                         [project_name (copy)] → characters (prefill/B) →
//                         carve → mechanisms → touch → help → done
//   #preview            — PreviewScreen: "try it" — OSK preview + diagnostics
//                         (no Download button, no SignUpPanel)
//   #output             — OutputScreen: "ship it" — Download .zip +
//                         SignUpPanel (no interactive OSK)

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useResizablePanes } from "./hooks/useResizablePanes.ts";
import type { BaseKeyboard, Pattern, SurveyPhaseResult, TouchAssignment } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "./lib/buildTouchLayoutJson.ts";
import { useWorkingCopyStore, bindManifest } from "./stores/workingCopyStore.ts";
import { instantiateFromBaseIfConfirmed } from "./lib/confirmRebase.ts";
import { IdentityLite, Prefill, PhaseB, PhaseF, type IdentityLiteResult } from "./survey/index.ts";
import { BaseResolution } from "./editors/panels/BaseResolution.tsx";
import { UnsupportedScriptStub } from "./components/UnsupportedScriptStub.tsx";
import type { SuggestTarget } from "./lib/suggestBase.ts";
import type { SurveyContext } from "./survey/types.ts";
import { CarveGallery } from "./editors/carve/CarveGallery.tsx";
import { MechanismGallery } from "./editors/assignLoop/MechanismGallery.tsx";
import { TouchGallery } from "./editors/assignLoop/TouchGallery.tsx";
import { type RouteId } from "./lib/navigate.ts";
import { useKeyboardArtifact, type OnInstantiateCallback, type ScaffoldSpec } from "./hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "./hooks/useWorkingCopyTransform.ts";
import { OSKFrame } from "./components/OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./components/OskModeToggle.tsx";
import { TrackStep, type Track } from "./editors/panels/TrackStep.tsx";
import { ProjectNameStep } from "./editors/panels/ProjectNameStep.tsx";
import { useValidator } from "./hooks/useValidator.ts";
import { usePlacementPriors } from "./hooks/usePlacementPriors.ts";
import { findKmnPath } from "./lib/findKmnPath.ts";
import { resolveBaseTouchJson } from "./lib/resolveBaseTouchJson.ts";
import { buildFindingsByQuestionId, selectUnmappedFindings } from "./lint/lintToQuestion.ts";
import { LintSummary } from "./lint/index.ts";
import { getPatternLibraryService } from "./lib/services.ts";
import { physicalAssignmentsOf } from "./lib/physicalAssignments.ts";
import { FlowMapView } from "./dashboard/DashboardView.tsx";
import { runCompleteness } from "./dashboard/completeness.ts";
import { PreviewScreen } from "./components/PreviewScreen.tsx";
import { OutputScreen } from "./components/OutputScreen.tsx";
import { navigateTo } from "./lib/navigate.ts";
import { manifest } from "./steps/manifest.ts";
import { applyStepCompletion, type ReducerDeps } from "./steps/reducer.ts";

// Bind the manifest into the store's staleness actions.
// Called once at module load; avoids a circular static import in the store
// (stores/ → steps/manifest.ts → steps/registerEditorSteps.ts → editors/ → stores/).
bindManifest(manifest);

// The Flow Map is a developer aid. It shows automatically in `vite dev`; in
// hosted builds (Vercel previews, future production) it is gated by
// VITE_SHOW_FLOWMAP=1 so the kill switch lives in env config, not code.
const SHOW_FLOWMAP =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_FLOWMAP === "1";

const VALID_ROUTES = new Set<RouteId>(
  (["survey", "preview", "output", "flowmap"] as const).filter(
    (r) => r !== "flowmap" || SHOW_FLOWMAP,
  ),
);

function isRouteId(v: string): v is RouteId {
  return VALID_ROUTES.has(v as RouteId);
}

// ---------------------------------------------------------------------------
// useRoute — reads window.location.hash and reacts to hashchange events
// ---------------------------------------------------------------------------

function useRoute(): RouteId {
  const hashToRoute = (): RouteId => {
    const raw = window.location.hash.slice(1);
    return isRouteId(raw) ? raw : "survey";
  };

  const [route, setRoute] = useState<RouteId>(hashToRoute);

  useEffect(() => {
    const handler = () => setRoute(hashToRoute());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);  // empty deps: register once on mount; handler captures hashToRoute by closure

  return route;
}

// ---------------------------------------------------------------------------
// NavBar
// ---------------------------------------------------------------------------

interface NavItem {
  id: RouteId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "survey", label: "Studio" },
  { id: "preview", label: "Preview" },
  { id: "output", label: "Output" },
  ...(SHOW_FLOWMAP ? [{ id: "flowmap" as const, label: "Flow Map" }] : []),
];

interface NavBarProps {
  active: RouteId;
}

function NavBar({ active }: NavBarProps) {
  return (
    <nav
      aria-label="Studio navigation"
      style={{
        height: 48,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 16px",
        background: "var(--bg)",
        borderBottom: "1px solid #283040",
        boxSizing: "border-box",
      }}
    >
      {NAV_ITEMS.map(({ id, label }) => {
        const isActive = id === active;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={isActive ? "page" : undefined}
            style={{
              padding: "4px 12px",
              fontSize: 14,
              fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
              textDecoration: "none",
              color: isActive ? "#6ea8fe" : "#e6edf3",
              borderBottom: isActive ? "2px solid #6ea8fe" : "2px solid transparent",
              lineHeight: "40px",
              whiteSpace: "nowrap",
              transition: "color 120ms ease, border-bottom-color 120ms ease",
            }}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// SurveyView — manifest-driven survey runtime (T028, FR-009, M1)
//
// Step order, spine membership, lock placement, and branching all derive from
// steps/manifest.ts. No SurveyStage union remains — the active step is tracked
// as a manifest step id (ActiveStepId) with one sub-stage for the "characters"
// step (which contains an internal prefill→B flow — intra-phase routing handled
// by the SurveyRunner, legitimately not promoted to manifest steps).
//
// Manifest spine order (FR-012, M2):
//   identity → choose_base → track → characters → carve →
//   mechanisms[lock:physical] → touch[lock:touch] → help → package[reserved]
//
// Off-spine (spine:false) steps in array order:
//   project_name  — copy-track CYOA fork; joinTarget:"characters"
//   touch_seed_source — touch-seed fork; joinTarget:"touch"
//
// Track/project_name routing:
//   copy-track:  choose_base → track → project_name → characters
//   adapt-track: choose_base → track → (skip project_name) → characters
//
// Characters internal flow (intra-phase — not manifest steps):
//   prefill → B-questions
//
// Side effects on step completion are all dispatched through applyStepCompletion()
// (steps/reducer.ts) — editors are pure (FR-011, R4).
//
// Double-instantiation guard (P1 fix):
//   setScaffoldSpec() causes a second compile run whose onInstantiate callback
//   would fire applyStepCompletion("choose_base", ...) a second time. An
//   instantiatedRef flag prevents the R3 side effect from running more than once
//   per session; it resets on start-over.
// ---------------------------------------------------------------------------

const SURVEY_DIVIDER_WIDTH = 6;
const SURVEY_LEFT_MIN_PCT = 25;
const SURVEY_LEFT_MAX_PCT = 65;
const SURVEY_LEFT_INIT_PCT = 45;

// ---------------------------------------------------------------------------
// ActiveStepId — the set of manifest step ids the runtime advances through,
// plus terminal states "done" and "unsupported" not present in the manifest.
//
// track and project_name are real manifest steps (P0 fix); they appear here.
// touch_seed_source is spine:false and skipped by nextSpineStepAfter — not listed.
// package is reserved and maps to "done" in nextSpineStepAfter — not listed.
// ---------------------------------------------------------------------------

type ActiveStepId =
  | "identity"
  | "choose_base"
  | "track"
  | "project_name"
  | "characters"
  | "carve"
  | "mechanisms"
  | "touch"
  | "help"
  | "done"
  | "unsupported";

// Sub-stage within the characters manifest step (intra-phase routing).
// prefill→B is legitimately internal to the Phase A/B SurveyRunner;
// synthesis confirmed these should NOT be promoted to manifest steps.
type CharactersSubStage = "prefill" | "B";

// ---------------------------------------------------------------------------
// validateManifestShape — throw-on-mismatch structural guard (M2, M3, M4).
// Called once at module load; a misshapen manifest is a hard error, not a
// logged warning — fail fast so CI catches it before any render occurs.
// ---------------------------------------------------------------------------

function validateManifestShape(): void {
  const ids = manifest.map((s) => s.id);
  const spineIds = manifest.filter((s) => s.spine !== false).map((s) => s.id);

  // M2 — spine order.
  const expectedSpine = [
    "identity", "choose_base", "track", "characters",
    "carve", "mechanisms", "touch", "help", "package",
  ];
  for (let i = 0; i < expectedSpine.length; i++) {
    const expected = expectedSpine[i];
    if (expected === undefined) break;
    const actual = spineIds[i];
    if (actual !== expected) {
      throw new Error(
        `[SurveyView] manifest spine[${i}] expected "${expected}", got "${actual ?? "(none)"}"`,
      );
    }
  }

  // M3 — exactly one lock:physical and one lock:touch, in that order.
  const locks = manifest.filter((s) => s.lock !== undefined).map((s) => s.lock);
  if (locks[0] !== "physical" || locks[1] !== "touch" || locks.length !== 2) {
    throw new Error(
      `[SurveyView] manifest locks expected ["physical","touch"], got [${locks.join(",")}]`,
    );
  }

  // M4 — touch_seed_source is spine:false with joinTarget "touch".
  const seedSource = manifest.find((s) => s.id === "touch_seed_source");
  if (seedSource === undefined || seedSource.spine !== false || seedSource.joinTarget !== "touch") {
    throw new Error(`[SurveyView] manifest touch_seed_source missing or misconfigured`);
  }

  // M4b — project_name is spine:false with joinTarget "characters".
  const projName = manifest.find((s) => s.id === "project_name");
  if (projName === undefined || projName.spine !== false || projName.joinTarget !== "characters") {
    throw new Error(`[SurveyView] manifest project_name missing or misconfigured (must be spine:false, joinTarget:"characters")`);
  }

  // M5 — unique ids.
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`[SurveyView] manifest duplicate step id: "${id}"`);
    }
    seen.add(id);
  }
}

validateManifestShape();

// ---------------------------------------------------------------------------
// manifestIndexOf / nextSpineStepAfter — manifest traversal helpers
// ---------------------------------------------------------------------------

/** Return the manifest index for a given step id, or -1 if not found. */
function manifestIndexOf(id: string): number {
  return manifest.findIndex((s) => s.id === id);
}

/**
 * Advance to the next spine step in the manifest after currentId, skipping
 * spine:false side-trail steps. Returns the ActiveStepId of the next spine
 * step, or "done" when the reserved "package" step or end-of-manifest is reached.
 */
function nextSpineStepAfter(currentId: string): ActiveStepId {
  const currentIdx = manifestIndexOf(currentId);
  for (let i = currentIdx + 1; i < manifest.length; i++) {
    const step = manifest[i];
    if (step === undefined) break;
    // Skip side-trail (spine:false) steps — adapt-track skips project_name this way.
    if (step.spine === false) continue;
    const id = step.id;
    if (
      id === "identity" ||
      id === "choose_base" ||
      id === "track" ||
      id === "project_name" ||
      id === "characters" ||
      id === "carve" ||
      id === "mechanisms" ||
      id === "touch" ||
      id === "help"
    ) {
      return id;
    }
    // "package" is reserved — terminal, map to "done".
    if (id === "package") return "done";
  }
  return "done";
}

/** Build the downstream SurveyContext from the identity-lite result. */
function contextFromIdentity(identity: IdentityLiteResult): SurveyContext {
  return {
    language_name: identity.english || identity.autonym,
    routing_group: identity.prefill.routingGroup,
    script_family: identity.prefill.script,
    // identity.bcp47 is the full BCP47 target tag (e.g. "yo-Latn", "ha-Latn").
    // Empty string when the user left the language code blank; omit the field
    // in that case so SuggestionPanel can gate on bcp47_tag being non-empty.
    ...(identity.bcp47 !== "" ? { bcp47_tag: identity.bcp47 } : {}),
  };
}

interface SurveyViewProps {
  /**
   * The instantiated base keyboard from the working-copy store.
   * Null before the first base selection completes its compile cycle.
   * Passed to the OSK preview in the right pane.
   */
  baseKeyboard: BaseKeyboard | null;
}

export function SurveyView({ baseKeyboard }: SurveyViewProps) {
  // ---------------------------------------------------------------------------
  // Manifest-driven step state (T028 — no SurveyStage union)
  //
  // activeStepId: current manifest step id (or terminal "done"/"unsupported").
  // ---------------------------------------------------------------------------
  const [activeStepId, setActiveStepId] = useState<ActiveStepId>("identity");

  // Sub-stage for the characters manifest step (intra-phase: prefill → B).
  const [charactersSub, setCharactersSub] = useState<CharactersSubStage>("prefill");

  const [identityResult, setIdentityResult] = useState<IdentityLiteResult | null>(null);
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({});
  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, handleHovered, onPointerDown, setHandleHovered } =
    useResizablePanes({ minPct: SURVEY_LEFT_MIN_PCT, maxPct: SURVEY_LEFT_MAX_PCT, initPct: SURVEY_LEFT_INIT_PCT });

  // Corpus placement priors — loaded lazily from docs/placement-priors.json.
  // Null while loading or on error (gallery degrades gracefully without it).
  const corpusPlacementMap = usePlacementPriors();

  // Track 1 (Copy) vs Track 2 (Adapt) — set at the track manifest step.
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  // ScaffoldSpec for Track 1: populated after the project_name step.
  // Null for Track 2 (adapt uses the base's existing id/name).
  const [scaffoldSpec, setScaffoldSpec] = useState<ScaffoldSpec | null>(null);

  // Local base selection that drives the compile pipeline immediately on pick.
  // This is separate from baseKeyboard (the store's instantiated base) so that:
  //   (a) the pipeline starts as soon as BaseResolution resolves, not after
  //       the store updates (which only happens after compile completes); and
  //   (b) the OSK preview shows the base the user just picked, while compile runs.
  // Once onInstantiate fires (compile succeeds), both values will agree.
  const [localBase, setLocalBase] = useState<BaseKeyboard | null>(baseKeyboard);

  // Sync localBase when the store's baseKeyboard prop changes (e.g. after a
  // start-over that sets a new base, the wizard sees it).
  useEffect(() => {
    setLocalBase(baseKeyboard);
  }, [baseKeyboard]);

  // Working-copy store actions.
  const recordPhase = useWorkingCopyStore((s) => s.recordPhase);
  const resetSurvey = useWorkingCopyStore((s) => s.reset);
  const setStoreIdentity = useWorkingCopyStore((s) => s.setIdentity);
  const lockDesktop = useWorkingCopyStore((s) => s.lockDesktop);
  const setTouchLayoutJson = useWorkingCopyStore((s) => s.setTouchLayoutJson);
  const instantiateFromBase = useWorkingCopyStore((s) => s.instantiateFromBase);
  const instantiateFromExisting = useWorkingCopyStore((s) => s.instantiateFromExisting);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);

  // selectedTrack captured in a ref so the memoised onInstantiate callback
  // always sees the current value even when the async compile completes after
  // selectedTrack changes.
  const selectedTrackRef = useRef<Track | null>(null);
  useEffect(() => {
    selectedTrackRef.current = selectedTrack;
  }, [selectedTrack]);

  // ---------------------------------------------------------------------------
  // P1 fix: double-instantiation guard.
  //
  // For Track 1 (copy), setScaffoldSpec() causes a second compile run whose
  // onInstantiate fires applyStepCompletion("choose_base")/instantiate a second
  // time. The rebase-guard in instantiateFromBaseIfConfirmed may no-op the
  // second call, but edit-state-dependent behavior is non-deterministic.
  // Gate: the R3 side effect fires exactly once per session; reset on start-over.
  // ---------------------------------------------------------------------------
  const instantiatedRef = useRef<boolean>(false);

  // ---------------------------------------------------------------------------
  // ReducerDeps — injected into applyStepCompletion (steps/reducer.ts).
  // All store actions and lib helpers are injected here; the reducer itself has
  // no static imports from stores/ or lib/ (boundary compliance).
  //
  // The wrapper lambdas delegate to stable module-level imports (buildTouchLayoutJson,
  // resolveBaseTouchJson, instantiateFromBaseIfConfirmed) that are not React state,
  // so they are intentionally omitted from the dependency array.
  // ---------------------------------------------------------------------------
  const reducerDeps: ReducerDeps = useMemo(
    () => ({
      lockDesktop,
      setTouchLayoutJson,
      instantiateFromBase,
      instantiateFromExisting,
      buildTouchLayoutJson: (baseIrArg, assignments, baseTouchJson) =>
        buildTouchLayoutJson(baseIrArg, assignments, baseTouchJson),
      resolveBaseTouchJson: (vfs) => resolveBaseTouchJson(vfs),
      instantiateFromBaseIfConfirmed: (base, opts) =>
        instantiateFromBaseIfConfirmed(base, opts),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Wrapper lambdas delegate to stable module imports — excluded from deps intentionally.
    [lockDesktop, setTouchLayoutJson, instantiateFromBase, instantiateFromExisting],
  );

  // Keep reducerDepsRef current so the async onInstantiate callback always
  // sees the latest deps without being re-created on every render.
  const reducerDepsRef = useRef<ReducerDeps>(reducerDeps);
  useEffect(() => {
    reducerDepsRef.current = reducerDeps;
  }, [reducerDeps]);

  // ---------------------------------------------------------------------------
  // onInstantiate — compile-pipeline callback (R3: choose_base side effect).
  //
  // Fires when the compile pipeline produces an IR + VFS for the chosen base.
  // Dispatches applyStepCompletion("choose_base", ...) which routes Track 2 →
  // instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
  //
  // instantiatedRef gates this to fire exactly once per session — a second
  // compile triggered by setScaffoldSpec will not re-run the instantiate side
  // effect (P1 fix).
  // ---------------------------------------------------------------------------
  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir, removalCapabilities }) => {
    if (instantiatedRef.current) return;
    instantiatedRef.current = true;

    const track = selectedTrackRef.current;
    applyStepCompletion(
      "choose_base",
      { base, vfs, ir, removalCapabilities, track: track ?? null },
      reducerDepsRef.current,
    );
  }, []);

  // Pattern map for the working-copy transform — needed from Phase F onwards so
  // mechanism assignments are projected into the OSK preview.
  const phaseResults = useWorkingCopyStore((s) => s.phaseResults);
  const sessionAssignments = useMemo(() => physicalAssignmentsOf(phaseResults), [phaseResults]);
  const [surveyPatternMap, setSurveyPatternMap] = useState<Map<string, Pattern>>(new Map());
  useEffect(() => {
    const ids = new Set(sessionAssignments.flatMap((a) => a.mechanisms.map((m) => m.patternId)));
    if (ids.size === 0) return;
    const svc = getPatternLibraryService();
    Promise.all([...ids].map((id) => svc.getById(id)))
      .then((patterns) => {
        const map = new Map<string, Pattern>();
        for (const p of patterns) {
          if (p !== undefined) map.set(p.id, p);
        }
        setSurveyPatternMap(map);
      })
      .catch((err: unknown) => {
        console.error("[SurveyView] pattern load for preview failed:", err);
      });
  }, [sessionAssignments]);

  // Working-copy transform — projects carve + assignments + identity into the OSK.
  // surveyPatternMap is empty until Phase C completes; null patternMap → skip assignments.
  const workingCopyTransform = useWorkingCopyTransform({
    patternMap: surveyPatternMap.size > 0 ? surveyPatternMap : null,
  });

  // Use localBase (immediately updated on selection) to drive the pipeline.
  // Pass scaffoldSpec so Track 1 routes through scaffold() instead of fetchKeyboardSourceToVfs.
  const { stage: artifactStage, retry } = useKeyboardArtifact(localBase, scaffoldSpec, workingCopyTransform, onInstantiate);
  const rightPct = 100 - leftPct;

  // Derive KMN source from the working copy's base VFS for the validator.
  const kmnSource = useMemo(() => {
    if (!baseVfs) return null;
    const path = findKmnPath(baseVfs);
    if (!path) return null;
    const raw = baseVfs.get(path)?.content ?? null;
    return typeof raw === "string" ? raw : null;
  }, [baseVfs]);
  const { findings } = useValidator(kmnSource);
  const findingsByQuestionId = useMemo(
    () => buildFindingsByQuestionId(findings),
    [findings],
  );
  const globalFindings = useMemo(() => selectUnmappedFindings(findings), [findings]);

  // The (language, script) target for base suggestion — keyed on the CHOSEN script.
  const suggestTarget: SuggestTarget | null =
    identityResult !== null
      ? {
          script: identityResult.prefill.script,
          ...(identityResult.bcp47 !== "" ? { bcp47: identityResult.bcp47 } : {}),
        }
      : null;

  // ---------------------------------------------------------------------------
  // Step completion handlers — all side effects dispatched through applyStepCompletion.
  // FR-011: editor components are pure; only these handlers call applyStepCompletion.
  // ---------------------------------------------------------------------------

  /** identity step completes → choose_base (or unsupported). */
  function handleIdentityComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    recordPhase(result);
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    setActiveStepId(identity.supported ? nextSpineStepAfter("identity") : "unsupported");
  }

  /** choose_base step completes — start pipeline, advance to track manifest step. */
  function handleBaseResolved(base: BaseKeyboard) {
    setLocalBase(base);
    setActiveStepId(nextSpineStepAfter("choose_base"));
  }

  /**
   * track step completes.
   * copy-track → project_name (spine:false manifest step).
   * adapt-track → skip project_name (spine:false) → characters (nextSpineStepAfter("track")).
   */
  function handleTrackSelected(track: Track) {
    setSelectedTrack(track);
    if (track === "copy") {
      // Copy-track takes the project_name side-trail.
      setActiveStepId("project_name");
    } else {
      // Adapt-track: no scaffoldSpec needed — adapt uses base's own id/displayName.
      setScaffoldSpec(null);
      // Skip project_name (spine:false) — nextSpineStepAfter("track") jumps to characters.
      setActiveStepId(nextSpineStepAfter("track"));
      setCharactersSub("prefill");
    }
  }

  /**
   * project_name step completes (copy-track only).
   * Sets scaffoldSpec so useKeyboardArtifact routes through scaffold(), pushes
   * identity into the store, then advances to characters (project_name's joinTarget).
   */
  function handleProjectNameNext(displayName: string, keyboardId: string) {
    setScaffoldSpec({ keyboardId, displayName });
    setStoreIdentity({ keyboardId, displayName });
    // project_name.joinTarget is "characters" — advance there directly.
    setActiveStepId("characters");
    setCharactersSub("prefill");
  }

  // --- characters internal sub-stage handlers (intra-phase routing) ---

  /** Prefill confirmed — advance to B (Phase B question battery). */
  function handlePrefillConfirm() {
    setCharactersSub("B");
  }

  /**
   * Phase B (characters) completes — record phase result, dispatch R5 (no-op),
   * advance to carve (FR-012: characters BEFORE carve).
   */
  function handlePhaseBComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    applyStepCompletion("characters", result, reducerDeps);
    setActiveStepId(nextSpineStepAfter("characters"));
  }

  // --- Spine gallery/phase completion handlers ---

  /** carve step completes → mechanisms. */
  function handleCarveComplete() {
    applyStepCompletion("carve", undefined, reducerDeps);
    setActiveStepId(nextSpineStepAfter("carve"));
  }

  /**
   * mechanisms step completes — applyStepCompletion fires lockDesktop (R1),
   * then advance to touch.
   */
  function handleMechanismsComplete() {
    applyStepCompletion("mechanisms", undefined, reducerDeps);
    setActiveStepId(nextSpineStepAfter("mechanisms"));
  }

  /**
   * touch (Phase E) step completes — applyStepCompletion fires buildTouchLayoutJson (R2),
   * then advance to help.
   */
  function handlePhaseEComplete(assignments: TouchAssignment[]) {
    applyStepCompletion(
      "touch",
      { assignments, baseIr, baseVfs },
      reducerDeps,
    );
    setActiveStepId(nextSpineStepAfter("touch"));
  }

  /** help (Phase F) step completes → done, navigate to output. */
  function handlePhaseFComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    applyStepCompletion("help", result, reducerDeps);
    setActiveStepId("done");
    navigateTo("output");
  }

  /** Start over — reset all wizard state to initial. */
  function handleStartOver() {
    resetSurvey();
    setIdentityResult(null);
    setSurveyContext({});
    setLocalBase(null);
    setSelectedTrack(null);
    setScaffoldSpec(null);
    instantiatedRef.current = false;
    setActiveStepId("identity");
    setCharactersSub("prefill");
  }

  // ---------------------------------------------------------------------------
  // Back navigation handlers — purely local (no side effects via reducer).
  // ---------------------------------------------------------------------------

  /** Back from choose_base → identity. */
  function handleBaseBack() { setActiveStepId("identity"); }

  /** Back from track → choose_base. */
  function handleTrackBack() { setActiveStepId("choose_base"); }

  /**
   * Back from project_name → track.
   * (project_name is a manifest step with its own back affordance.)
   */
  function handleProjectNameBack() { setActiveStepId("track"); }

  /**
   * Back from characters/prefill.
   * copy-track: → project_name (its preceding manifest step).
   * adapt-track: → track (project_name was skipped on the adapt path).
   */
  function handlePrefillBack() {
    setActiveStepId(selectedTrack === "copy" ? "project_name" : "track");
  }

  /** Back from characters/B → prefill (stays in characters intra-phase). */
  function handlePhaseBBack() { setCharactersSub("prefill"); }

  /** Back from carve → characters/B. */
  function handleCarveBack() {
    setActiveStepId("characters");
    setCharactersSub("B");
  }

  /** Back from mechanisms → carve. */
  function handleMechanismsBack() { setActiveStepId("carve"); }

  /** Back from touch (E) → mechanisms. */
  function handleTouchBack() { setActiveStepId("mechanisms"); }

  /** Back from help (F) → touch (E). */
  function handleHelpBack() { setActiveStepId("touch"); }

  // ---------------------------------------------------------------------------
  // Style constants
  // ---------------------------------------------------------------------------

  const questionsPaneStyle: CSSProperties = {
    flexBasis: `calc(${leftPct}% - ${SURVEY_DIVIDER_WIDTH / 2}px)`,
    flexShrink: 0,
    flexGrow: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflowY: "auto",
    padding: 24,
    boxSizing: "border-box",
    color: "#e6edf3",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  };

  // ---------------------------------------------------------------------------
  // Full-screen steps (carve, mechanisms, touch) — render without the two-pane layout.
  // ---------------------------------------------------------------------------

  if (activeStepId === "carve") {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <CarveGallery
          onComplete={handleCarveComplete}
          onBack={handleCarveBack}
        />
      </div>
    );
  }

  if (activeStepId === "mechanisms") {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <MechanismGallery
          selectedBaseKeyboard={localBase}
          onComplete={handleMechanismsComplete}
          onBack={handleMechanismsBack}
          {...(corpusPlacementMap !== null ? { placementMap: corpusPlacementMap } : {})}
        />
      </div>
    );
  }

  if (activeStepId === "touch") {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <TouchGallery
          onComplete={handlePhaseEComplete}
          onBack={handleTouchBack}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Done / "survey complete" panel content
  // ---------------------------------------------------------------------------

  const donePaneContent = (
    <div
      style={{
        padding: 24,
        border: "1px solid #30363d",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        alignItems: "flex-start",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Survey complete
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
        All authoring steps have been completed. Head to Output to download or
        submit your keyboard.
      </p>
      <button
        type="button"
        onClick={handleStartOver}
        style={{
          padding: "8px 18px",
          background: "transparent",
          border: "1px solid #30363d",
          borderRadius: 6,
          color: "#8b949e",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Start over
      </button>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Two-pane layout: questions (left) + OSK preview (right)
  // ---------------------------------------------------------------------------

  // Steps rendered full-screen (not in the two-pane layout) — handled as early
  // returns above. Only the remaining ids reach the two-pane pane renderer.
  type TwoPaneStepId = Exclude<ActiveStepId, "carve" | "mechanisms" | "touch">;

  /**
   * Render the left-pane content for the current active step.
   * Receives the activeStepId narrowed to TwoPaneStepId (carve/mechanisms/touch
   * are returned early before this is called). Exhaustiveness guard at the bottom
   * renders a visible error panel rather than a blank pane for an unhandled id.
   */
  function renderQuestionsPane(stepId: TwoPaneStepId): ReactNode {
    if (stepId === "done") {
      return donePaneContent;
    }

    if (stepId === "identity") {
      return (
        <IdentityLite
          context={surveyContext}
          onComplete={handleIdentityComplete}
          findingsByQuestionId={findingsByQuestionId}
        />
      );
    }

    // §9 three-group routing — not yet supported stub (CJK/Ethiopic).
    if (stepId === "unsupported") {
      return identityResult !== null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
          <UnsupportedScriptStub script={identityResult.targetScriptRaw} />
          <button
            type="button"
            onClick={handleStartOver}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Start over
          </button>
        </div>
      ) : null;
    }

    // Manifest step: choose_base — base picker only.
    if (stepId === "choose_base") {
      return suggestTarget !== null ? (
        <BaseResolution
          target={suggestTarget}
          onResolved={handleBaseResolved}
          onBack={handleBaseBack}
        />
      ) : null;
    }

    // Manifest step: track — copy vs adapt choice.
    if (stepId === "track") {
      return localBase !== null ? (
        <TrackStep
          base={localBase}
          onNext={handleTrackSelected}
          onBack={handleTrackBack}
        />
      ) : null;
    }

    // Manifest step: project_name — copy-track CYOA fork (spine:false).
    if (stepId === "project_name") {
      return identityResult !== null ? (
        <ProjectNameStep
          defaultDisplayName={identityResult.autonym || identityResult.english}
          onNext={handleProjectNameNext}
          onBack={handleProjectNameBack}
        />
      ) : null;
    }

    // Manifest step: characters — intra-phase routing: prefill → B.
    if (stepId === "characters") {
      if (charactersSub === "prefill" && identityResult !== null && localBase !== null) {
        return (
          <Prefill
            identity={identityResult}
            base={localBase}
            onConfirm={handlePrefillConfirm}
            onBack={handlePrefillBack}
          />
        );
      }
      if (charactersSub === "B") {
        // NOTE: placementMap is intentionally not supplied here in v1 (see D-INT-2).
        return (
          <PhaseB
            context={surveyContext}
            onComplete={handlePhaseBComplete}
            onBack={handlePhaseBBack}
            findingsByQuestionId={findingsByQuestionId}
          />
        );
      }
      return null;
    }

    // Manifest step: help (Phase F).
    if (stepId === "help") {
      return (
        <PhaseF
          context={surveyContext}
          onComplete={handlePhaseFComplete}
          onBack={handleHelpBack}
          findingsByQuestionId={findingsByQuestionId}
        />
      );
    }

    // Exhaustiveness guard: unknown TwoPaneStepId — this step has no renderer yet.
    // Renders a visible error panel rather than a silent blank pane.
    // If you see this, wire the new manifest step into SurveyView.
    const _exhaustive: never = stepId;
    return (
      <div
        role="alert"
        style={{ padding: 24, color: "#f85149", fontFamily: "monospace", fontSize: 13 }}
      >
        {`[SurveyView] unhandled step id: "${String(_exhaustive)}" — wire this manifest step into SurveyView`}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "var(--bg)",
        overflow: "hidden",
      }}
    >
      {/* Left pane: survey questions */}
      <section aria-label="Survey questions" style={questionsPaneStyle}>
        {globalFindings.length > 0 && (
          <LintSummary findings={globalFindings} />
        )}
        {renderQuestionsPane(activeStepId as TwoPaneStepId)}
      </section>

      {/* Drag handle */}
      <div
        role="separator"
        aria-label="Resize panes"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onMouseEnter={() => setHandleHovered(true)}
        onMouseLeave={() => setHandleHovered(false)}
        style={{
          width: SURVEY_DIVIDER_WIDTH,
          flexShrink: 0,
          background: handleHovered ? "#3d5070" : "#283040",
          cursor: "col-resize",
          userSelect: "none",
          transition: "background 120ms ease",
        }}
      />

      {/* Right pane: live OSK preview */}
      <section
        aria-label="Keyboard preview"
        style={{
          flexBasis: `calc(${rightPct}% - ${SURVEY_DIVIDER_WIDTH / 2}px)`,
          flexGrow: 1,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
          color: "#e6edf3",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {localBase === null ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 12,
              color: "#9aa7b8",
              fontSize: 14,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 32, opacity: 0.4, fontFamily: "monospace" }}>[kb]</span>
            <span>Choose a base keyboard in the wizard to see a live preview here.</span>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
                {localBase.displayName}
              </h2>
              <OskModeToggle value={oskMode} onChange={setOskMode} />
            </div>
            <OSKFrame
              baseKeyboard={localBase}
              oskMode={oskMode}
              stage={artifactStage}
              retry={retry}
            />
          </>
        )}
      </section>
    </div>
  );
}


// ---------------------------------------------------------------------------
// StudioShell — top-level layout: nav bar + route content
// ---------------------------------------------------------------------------

export function StudioShell() {
  const route = useRoute();

  const selectedBaseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);

  // ---------------------------------------------------------------------------
  // Completeness report — T042/US3.
  // Computed here (where the store is reachable) and passed down to DashboardView
  // as a prop. DashboardView has NO stores/ import (dashboard-layer boundary).
  // ---------------------------------------------------------------------------
  const desktopLocked = useWorkingCopyStore((s) => s.desktopLocked);
  const touchLayoutJson = useWorkingCopyStore((s) => s.touchLayoutJson);
  const staleSteps = useWorkingCopyStore((s) => s.staleSteps);
  const completenessReport = useMemo(
    () =>
      runCompleteness(
        manifest,
        { desktopLocked, touchLayoutJson },
        staleSteps,
      ),
    [desktopLocked, touchLayoutJson, staleSteps],
  );

  let content: ReactNode;
  switch (route) {
    case "survey":
      content = <SurveyView baseKeyboard={selectedBaseKeyboard} />;
      break;
    case "preview":
      content = <PreviewScreen />;
      break;
    case "output":
      content = <OutputScreen />;
      break;
    case "flowmap":
      content = <FlowMapView completeness={completenessReport} />;
      break;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
        background: "var(--bg)",
      }}
    >
      <NavBar active={route} />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {content}
      </div>
    </div>
  );
}
