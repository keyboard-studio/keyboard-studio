// Studio root — hash-based router + nav bar.
//
// Routes:
//   #survey  (default)  — full authoring wizard: identity → base → prefill →
//                         B (inventory) → carve (Phase D) →
//                         mechanisms (Phase C) → E → help (Phase F) → done
//   #preview            — PreviewScreen: "try it" — OSK preview + diagnostics
//                         (no Download button, no SignUpPanel)
//   #output             — OutputScreen: "ship it" — Download .zip +
//                         SignUpPanel (no interactive OSK)

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useResizablePanes } from "./hooks/useResizablePanes.ts";
import type { BaseKeyboard, Pattern, SurveyPhaseResult, TouchAssignment } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "./lib/buildTouchLayoutJson.ts";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
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
import { FlowMapView } from "./flowmap/FlowMapView.tsx";
import { PreviewScreen } from "./components/PreviewScreen.tsx";
import { OutputScreen } from "./components/OutputScreen.tsx";
import { navigateTo } from "./lib/navigate.ts";
import { manifest } from "./steps/manifest.ts";
import { applyStepCompletion, type ReducerDeps } from "./steps/reducer.ts";

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
// as the manifest step id plus optional sub-stage state for steps that contain
// an internal multi-screen flow (choose_base, characters).
//
// Manifest spine order (FR-012, M2):
//   identity → choose_base → characters → carve → mechanisms[lock:physical] →
//   touch_seed_source[spine:false] → touch[lock:touch] → help → package[reserved]
//
// Complex-step internal flows:
//   choose_base: base-picker → track → [project-name (copy)] → characters-entry
//   characters:  prefill → B-questions
//
// Side effects on step completion are all dispatched through applyStepCompletion()
// (steps/reducer.ts) — editors are pure (FR-011, R4).
// ---------------------------------------------------------------------------

const SURVEY_DIVIDER_WIDTH = 6;
const SURVEY_LEFT_MIN_PCT = 25;
const SURVEY_LEFT_MAX_PCT = 65;
const SURVEY_LEFT_INIT_PCT = 45;

// ---------------------------------------------------------------------------
// Manifest step ids — the set of ids we advance through (subset of manifest).
// Unlisted manifest steps (touch_seed_source, package) are handled as part of
// their adjacent spine step or are reserved/out-of-scope.
// ---------------------------------------------------------------------------

// The running survey advances through these ids in manifest order.
// "unsupported" and "done" are terminal states not present in the manifest.
type ActiveStepId =
  | "identity"
  | "choose_base"
  | "characters"
  | "carve"
  | "mechanisms"
  | "touch"
  | "help"
  | "done"
  | "unsupported";

// Sub-stage within the choose_base manifest step (covers the old base/track/project-name stages).
// The choose_base step completes when this sub-stage transitions to "complete".
type ChooseBaseSubStage = "base" | "track" | "project-name";

// Sub-stage within the characters manifest step (covers the old prefill/B stages).
// The characters step completes when PhaseB reports done.
type CharactersSubStage = "prefill" | "B";

// ---------------------------------------------------------------------------
// Derive the initial spine index from the manifest so future reorderings
// in manifest.ts are automatically reflected in the runtime.
// ---------------------------------------------------------------------------

/** Return the step id at a given manifest position, or undefined if out of range. */
function manifestStepIdAt(idx: number): string | undefined {
  return manifest[idx]?.id;
}

/** Return the manifest index for a given step id, or -1 if not found. */
function manifestIndexOf(id: string): number {
  return manifest.findIndex((s) => s.id === id);
}

/**
 * Advance to the next spine step in the manifest, skipping spine:false steps.
 * Returns the id of the next spine step, or "done" if none remain.
 */
function nextSpineStepAfter(currentId: string): ActiveStepId {
  const currentIdx = manifestIndexOf(currentId);
  for (let i = currentIdx + 1; i < manifest.length; i++) {
    const step = manifest[i];
    if (step === undefined) break;
    // Skip side-trail (spine:false) steps — they are not part of the linear spine.
    if (step.spine === false) continue;
    // Map manifest ids to ActiveStepId values we handle.
    const id = step.id;
    if (
      id === "identity" ||
      id === "choose_base" ||
      id === "characters" ||
      id === "carve" ||
      id === "mechanisms" ||
      id === "touch" ||
      id === "help"
    ) {
      return id;
    }
    // "package" is reserved — skip to done.
    if (id === "package") {
      return "done";
    }
  }
  return "done";
}

// Validate manifest step assertions at module load time (M2, M3, M4).
// These assertions fail loudly if the manifest diverges from expectations —
// they are structural guards, not feature-flag switches.
(function assertManifestShape() {
  const ids = manifest.map((s) => s.id);
  const spineIds = manifest.filter((s) => s.spine !== false).map((s) => s.id);

  // M2 — spine order.
  const expectedSpine = ["identity", "choose_base", "characters", "carve", "mechanisms", "touch", "help", "package"];
  for (let i = 0; i < expectedSpine.length; i++) {
    const expected = expectedSpine[i];
    if (expected === undefined) break;
    const actual = spineIds[i];
    if (actual !== expected) {
      console.error(`[SurveyView] manifest spine[${i}] expected "${expected}", got "${actual ?? "(none)"}"`);
    }
  }

  // M3 — exactly one lock:physical and one lock:touch, in that order.
  const locks = manifest.filter((s) => s.lock !== undefined).map((s) => s.lock);
  if (locks[0] !== "physical" || locks[1] !== "touch" || locks.length !== 2) {
    console.error(`[SurveyView] manifest locks expected ["physical","touch"], got`, locks);
  }

  // M4 — touch_seed_source is spine:false with joinTarget "touch".
  const seedSource = manifest.find((s) => s.id === "touch_seed_source");
  if (seedSource === undefined || seedSource.spine !== false || seedSource.joinTarget !== "touch") {
    console.error(`[SurveyView] manifest touch_seed_source missing or misconfigured`);
  }

  // M5 — unique ids.
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) console.error(`[SurveyView] manifest duplicate step id: "${id}"`);
    seen.add(id);
  }
})();

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
  // Manifest-driven step state (T028 — replaces SurveyStage union)
  //
  // activeStepId: current manifest step id (or "done"/"unsupported" terminal).
  // The first spine step in the manifest is always "identity".
  // ---------------------------------------------------------------------------
  const [activeStepId, setActiveStepId] = useState<ActiveStepId>("identity");

  // Sub-stage state for the choose_base manifest step (internal flow).
  const [chooseBaseSub, setChooseBaseSub] = useState<ChooseBaseSubStage>("base");

  // Sub-stage state for the characters manifest step (internal flow).
  const [charactersSub, setCharactersSub] = useState<CharactersSubStage>("prefill");

  const [identityResult, setIdentityResult] = useState<IdentityLiteResult | null>(null);
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({});
  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, handleHovered, onPointerDown, setHandleHovered } =
    useResizablePanes({ minPct: SURVEY_LEFT_MIN_PCT, maxPct: SURVEY_LEFT_MAX_PCT, initPct: SURVEY_LEFT_INIT_PCT });

  // Corpus placement priors — loaded lazily from docs/placement-priors.json.
  // Null while loading or on error (gallery degrades gracefully without it).
  const corpusPlacementMap = usePlacementPriors();

  // Track 1 (Copy) vs Track 2 (Adapt) — set within choose_base.
  // Null until the user picks a track.
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  // ScaffoldSpec for Track 1: populated after the project-name sub-step.
  // Null for Track 2 (adapt uses the base's existing id/name).
  const [scaffoldSpec, setScaffoldSpec] = useState<ScaffoldSpec | null>(null);

  // Local base selection that drives the compile pipeline immediately on pick.
  // This is separate from baseKeyboard (the store's instantiated base) so that:
  //   (a) the pipeline starts as soon as BaseResolution resolves, not after
  //       the store updates (which only happens after compile completes); and
  //   (b) the OSK preview shows the base the user just picked, even while
  //       the compile is in progress.
  // Once onInstantiate fires (compile succeeds), the store's baseKeyboard
  // becomes the authoritative source and both values will agree.
  const [localBase, setLocalBase] = useState<BaseKeyboard | null>(baseKeyboard);

  // Sync localBase when the store's baseKeyboard prop changes (e.g. after a
  // start-over that sets a new base, the wizard sees it).
  useEffect(() => {
    setLocalBase(baseKeyboard);
  }, [baseKeyboard]);

  // Working-copy store actions — captured once for use in ReducerDeps.
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
  // ReducerDeps — injected into applyStepCompletion (steps/reducer.ts).
  // All store actions and lib helpers are injected here; the reducer itself
  // has no static imports from stores/ or lib/ (boundary compliance).
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
    [lockDesktop, setTouchLayoutJson, instantiateFromBase, instantiateFromExisting],
  );

  // ---------------------------------------------------------------------------
  // onInstantiate — compile-pipeline callback (routes choose_base side effects).
  //
  // In the manifest-driven model, onInstantiate fires when the compile pipeline
  // has produced an IR + VFS for the chosen base. It dispatches R3 via
  // applyStepCompletion('choose_base', ...) — which routes Track 2 →
  // instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
  // This replaces the old inline routing in StudioShell.tsx:240-253.
  // ---------------------------------------------------------------------------
  const reducerDepsRef = useRef<ReducerDeps>(reducerDeps);
  useEffect(() => {
    reducerDepsRef.current = reducerDeps;
  }, [reducerDeps]);

  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir, removalCapabilities }) => {
    const track = selectedTrackRef.current;
    applyStepCompletion(
      "choose_base",
      {
        base,
        vfs,
        ir,
        removalCapabilities,
        track: track ?? null,
      },
      reducerDepsRef.current,
    );
  }, []);

  // Pattern map for the working-copy transform — needed from Phase F onwards so
  // mechanism assignments (Phase C) are projected into the OSK preview. Loaded
  // lazily once assignments exist in the store: by the time the user reaches
  // Phase F the patterns were already fetched during Phase C (service caches
  // them), so getById resolves in a single microtask tick and causes at most
  // one extra recompile cycle.
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
  // surveyPatternMap is empty until Phase C completes; useWorkingCopyTransform
  // treats a null patternMap as "skip assignments" (safe — no assignments exist yet).
  const workingCopyTransform = useWorkingCopyTransform({
    patternMap: surveyPatternMap.size > 0 ? surveyPatternMap : null,
  });

  // Use localBase (immediately updated on selection) to drive the pipeline,
  // not the store's baseKeyboard (updated only after compile completes).
  // Pass scaffoldSpec so Track 1 routes through scaffold() instead of fetchKeyboardSourceToVfs.
  const { stage: artifactStage, retry } = useKeyboardArtifact(localBase, scaffoldSpec, workingCopyTransform, onInstantiate);
  const rightPct = 100 - leftPct;

  // Derive KMN source from the working copy's base VFS (the scaffolded snapshot)
  // so the validator can produce findings while the survey is in progress.
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

  // ---------------------------------------------------------------------------
  // The (language, script) target for base suggestion — keyed on the CHOSEN
  // script (decoupled from the language; spec §8/§9).
  // ---------------------------------------------------------------------------
  const suggestTarget: SuggestTarget | null =
    identityResult !== null
      ? {
          script: identityResult.prefill.script,
          ...(identityResult.bcp47 !== ""
            ? { bcp47: identityResult.bcp47 }
            : {}),
        }
      : null;

  // ---------------------------------------------------------------------------
  // Step completion handlers — all side effects dispatched through applyStepCompletion.
  // FR-011: editor components are pure; only these handlers call applyStepCompletion.
  // ---------------------------------------------------------------------------

  /** Identity step completes — advance to choose_base OR unsupported. */
  function handleIdentityComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    recordPhase(result);
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    if (identity.supported) {
      setActiveStepId("choose_base");
      setChooseBaseSub("base");
    } else {
      setActiveStepId("unsupported");
    }
  }

  // --- choose_base internal sub-stage handlers ---

  /**
   * Base picker resolved — start compile pipeline and advance to track sub-stage.
   * The compile pipeline fires onInstantiate (→ applyStepCompletion choose_base) when done.
   */
  function handleBaseResolved(base: BaseKeyboard) {
    setLocalBase(base);
    setChooseBaseSub("track");
  }

  /**
   * Track selected — route to project-name (copy) or complete choose_base (adapt).
   * Adapt completes choose_base immediately; copy needs a project name first.
   */
  function handleTrackSelected(track: Track) {
    setSelectedTrack(track);
    if (track === "copy") {
      setChooseBaseSub("project-name");
    } else {
      // Track 2: no scaffoldSpec needed — adapt uses base's own id/displayName.
      setScaffoldSpec(null);
      // choose_base step complete — advance to characters (prefill sub-stage).
      setActiveStepId("characters");
      setCharactersSub("prefill");
    }
  }

  /**
   * Project name confirmed (Track 1 only) — set scaffold spec, push identity,
   * complete choose_base, and advance to characters.
   */
  function handleProjectNameNext(displayName: string, keyboardId: string) {
    setScaffoldSpec({ keyboardId, displayName });
    setStoreIdentity({ keyboardId, displayName });
    // choose_base step complete — advance to characters (prefill sub-stage).
    setActiveStepId("characters");
    setCharactersSub("prefill");
  }

  // --- characters internal sub-stage handlers ---

  /** Prefill confirmed — advance to B (Phase B question battery). */
  function handlePrefillConfirm() {
    setCharactersSub("B");
  }

  /**
   * Phase B (characters) completes — dispatch R5 (no side effect for question
   * steps), record phase result, and advance to the next spine step (carve).
   * FR-012 functional order: Characters BEFORE Carve (intended reorder — T028).
   */
  function handlePhaseBComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    // characters step completes — no side effect (applyStepCompletion no-op for this id).
    applyStepCompletion("characters", result, reducerDeps);
    // Advance to carve (next spine step after characters in the manifest).
    setActiveStepId(nextSpineStepAfter("characters"));
  }

  // --- Spine gallery/phase completion handlers ---

  /** Carve step completes — advance to mechanisms. */
  function handleCarveComplete() {
    applyStepCompletion("carve", undefined, reducerDeps);
    setActiveStepId(nextSpineStepAfter("carve"));
  }

  /**
   * Mechanisms step completes — applyStepCompletion fires lockDesktop (R1),
   * then advance to touch (the next spine step after mechanisms).
   */
  function handleMechanismsComplete() {
    // R1: lockDesktop() is fired inside applyStepCompletion for "mechanisms".
    applyStepCompletion("mechanisms", undefined, reducerDeps);
    setActiveStepId(nextSpineStepAfter("mechanisms"));
  }

  /**
   * Touch (Phase E) step completes — applyStepCompletion fires the
   * buildTouchLayoutJson block (R2), then advance to help.
   */
  function handlePhaseEComplete(assignments: TouchAssignment[]) {
    // R2: buildTouchLayoutJson + setTouchLayoutJson fired inside applyStepCompletion.
    // assignments arriving here are already filtered to non-inherited by TouchGallery.
    applyStepCompletion(
      "touch",
      { assignments, baseIr, baseVfs },
      reducerDeps,
    );
    setActiveStepId(nextSpineStepAfter("touch"));
  }

  /**
   * Help (Phase F) step completes — record phase result, advance to done,
   * and navigate to the output route.
   */
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
    setActiveStepId("identity");
    setChooseBaseSub("base");
    setCharactersSub("prefill");
  }

  // ---------------------------------------------------------------------------
  // Back navigation handlers — all purely local (no side effects via reducer).
  // ---------------------------------------------------------------------------

  /** Back from choose_base/base → identity. */
  function handleBaseBack() {
    setActiveStepId("identity");
  }

  /** Back from choose_base/track → base picker. */
  function handleTrackBack() {
    setChooseBaseSub("base");
  }

  /** Back from choose_base/project-name → track. */
  function handleProjectNameBack() {
    setChooseBaseSub("track");
  }

  /** Back from characters/prefill → choose_base (project-name sub-stage for copy, track for adapt). */
  function handlePrefillBack() {
    setActiveStepId("choose_base");
    setChooseBaseSub(selectedTrack === "copy" ? "project-name" : "track");
  }

  /** Back from characters/B → prefill (stays in characters step). */
  function handlePhaseBBack() {
    setCharactersSub("prefill");
  }

  /** Back from carve → characters/B. */
  function handleCarveBack() {
    setActiveStepId("characters");
    setCharactersSub("B");
  }

  /** Back from mechanisms → carve. */
  function handleMechanismsBack() {
    setActiveStepId("carve");
  }

  /** Back from touch (E) → mechanisms. */
  function handleTouchBack() {
    setActiveStepId("mechanisms");
  }

  /** Back from help (F) → touch (E). */
  function handleHelpBack() {
    setActiveStepId("touch");
  }

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
  // Full-screen stages (carve, mechanisms, touch) — these render without the
  // two-pane layout.
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

        {/* Terminal: done */}
        {activeStepId === "done" && donePaneContent}

        {/* Manifest step: identity */}
        {activeStepId === "identity" && (
          <IdentityLite
            context={surveyContext}
            onComplete={handleIdentityComplete}
            findingsByQuestionId={findingsByQuestionId}
          />
        )}

        {/* Terminal: unsupported script (§9 three-group routing — not yet supported stub) */}
        {activeStepId === "unsupported" && identityResult !== null && (
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
        )}

        {/* Manifest step: choose_base — internal sub-stages: base → track → [project-name] */}
        {activeStepId === "choose_base" && chooseBaseSub === "base" && suggestTarget !== null && (
          <BaseResolution
            target={suggestTarget}
            onResolved={handleBaseResolved}
            onBack={handleBaseBack}
          />
        )}
        {activeStepId === "choose_base" && chooseBaseSub === "track" && localBase !== null && (
          <TrackStep
            base={localBase}
            onNext={handleTrackSelected}
            onBack={handleTrackBack}
          />
        )}
        {activeStepId === "choose_base" && chooseBaseSub === "project-name" && identityResult !== null && (
          <ProjectNameStep
            defaultDisplayName={identityResult.autonym || identityResult.english}
            onNext={handleProjectNameNext}
            onBack={handleProjectNameBack}
          />
        )}

        {/* Manifest step: characters — internal sub-stages: prefill → B */}
        {activeStepId === "characters" && charactersSub === "prefill" && identityResult !== null && localBase !== null && (
          <Prefill
            identity={identityResult}
            base={localBase}
            onConfirm={handlePrefillConfirm}
            onBack={handlePrefillBack}
          />
        )}
        {activeStepId === "characters" && charactersSub === "B" && (
          // NOTE: `placementMap` is intentionally not supplied here in v1.
          // Per decision D-INT-2 the seeder never runs inside the SPA; the real
          // PlacementMap comes from a pinned placement-priors artifact produced
          // offline and shipped as static data (tracked separately). The prop
          // stays optional and unsupplied in production.
          <PhaseB
            context={surveyContext}
            onComplete={handlePhaseBComplete}
            onBack={handlePhaseBBack}
            findingsByQuestionId={findingsByQuestionId}
          />
        )}

        {/* Manifest step: help (Phase F) */}
        {activeStepId === "help" && (
          <PhaseF
            context={surveyContext}
            onComplete={handlePhaseFComplete}
            onBack={handleHelpBack}
            findingsByQuestionId={findingsByQuestionId}
          />
        )}
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
      content = <FlowMapView />;
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

// Suppress unused-variable lint for manifestStepIdAt which serves as a
// compile-time documentation anchor for the manifest ordering.
void manifestStepIdAt;
