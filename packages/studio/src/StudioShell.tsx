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
import type { BaseKeyboard, Pattern } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "./lib/buildTouchLayoutJson.ts";
import { useWorkingCopyStore, bindManifest } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { instantiateFromBaseIfConfirmed } from "./lib/confirmRebase.ts";
import { type RouteId } from "./lib/navigate.ts";
import { useKeyboardArtifact, type OnInstantiateCallback } from "./hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "./hooks/useWorkingCopyTransform.ts";
import { OSKFrame } from "./components/OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./components/OskModeToggle.tsx";
import { useValidator } from "./hooks/useValidator.ts";
import { findKmnPath } from "./lib/findKmnPath.ts";
import { resolveBaseTouchJson } from "./lib/resolveBaseTouchJson.ts";
import { selectUnmappedFindings } from "./lint/lintToQuestion.ts";
import { LintSummary } from "./lint/index.ts";
import { getPatternLibraryService } from "./lib/services.ts";
import { physicalAssignmentsOf } from "./lib/physicalAssignments.ts";
import { FlowMapView } from "./dashboard/DashboardView.tsx";
import { runCompleteness } from "./dashboard/completeness.ts";
import { PreviewScreen } from "./components/PreviewScreen.tsx";
import { OutputScreen } from "./components/OutputScreen.tsx";
import { WelcomeScreen } from "./components/WelcomeScreen.tsx";
import { ProfileScreen } from "./components/ProfileScreen.tsx";
import { AccountControl } from "./components/AccountControl.tsx";
import { navigateTo } from "./lib/navigate.ts";
import { manifest } from "./steps/manifest.ts";
import { applyStepCompletion, type ReducerDeps } from "./steps/reducer.ts";
import { StepHost } from "./components/StepHost.tsx";

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
  (["welcome", "survey", "preview", "output", "flowmap", "profile"] as const).filter(
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
      {/* Left group — tab links */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
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
      </div>

      {/* Right group — account control (hidden on the welcome route) */}
      {active !== "welcome" && <AccountControl />}
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
// ActiveStepId — imported from surveySessionStore (the traversal vocabulary
// owner). See stores/surveySessionStore.ts (research D-R1).
// ---------------------------------------------------------------------------

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

  // Layout guard (spec 028 Stage 5, T016): layout:"full" is now LOAD-BEARING —
  // StepHost reads step.layout to select full-screen vs two-pane chrome (R4).
  // EXACTLY {carve, mechanisms, touch} must declare layout:"full"; all others
  // must be "pane" or omit layout. This assertion is retained (not removed) as
  // a correctness gate: a mismatched layout would silently change the chrome.
  const FULL_LAYOUT_IDS = new Set(["carve", "mechanisms", "touch"]);
  for (const step of manifest) {
    if (step.layout === "full") {
      if (!FULL_LAYOUT_IDS.has(step.id)) {
        throw new Error(
          `[SurveyView] unexpected layout:"full" on step "${step.id}" — only carve/mechanisms/touch may be full-screen (spec 024 Stage 0)`,
        );
      }
    }
  }
  for (const expectedId of FULL_LAYOUT_IDS) {
    const step = manifest.find((s) => s.id === expectedId);
    if (step?.layout !== "full") {
      throw new Error(
        `[SurveyView] step "${expectedId}" must declare layout:"full" (spec 024 Stage 0)`,
      );
    }
  }
}

validateManifestShape();

// manifestIndexOf and nextSpineStepAfter have moved to steps/advance.ts
// (spec 028 Stage 5, T006). They are no longer needed in SurveyView.

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
  // Traversal state — sourced from surveySessionStore (spec 026 Stage 3).
  // StepHost reads activeStepId directly; SurveyView only needs scaffoldSpec
  // (for the compile pipeline) and localBase (for the OSK right pane).
  // ---------------------------------------------------------------------------
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  const scaffoldSpec = useSurveySessionStore((s) => s.scaffoldSpec);
  const localBase = useSurveySessionStore((s) => s.localBase);
  const surveyContext = useSurveySessionStore((s) => s.surveyContext);

  // Store actions needed by SurveyView (not delegated to StepHost).
  const sessionReset = useSurveySessionStore((s) => s.reset);
  const setLocalBase = useSurveySessionStore((s) => s.setLocalBase);

  // Derive whether the active step declares layout:"full" (load-bearing per Stage 5,
  // FR-002, R4). SurveyView uses this to skip the two-pane shell for full-screen steps.
  const activeStepIsFullScreen = useMemo(() => {
    const step = manifest.find((s) => s.id === activeStepId);
    return step?.layout === "full";
  }, [activeStepId]);

  // Reset the session store on mount — the store is a module-level singleton that
  // persists across React tree unmounts/remounts (e.g. navigating away from the
  // survey route and back creates a new SurveyView mount = a new wizard session).
  // Without this reset the singleton would resume from stale prior state rather
  // than starting at "identity". Component-local useState used to give this
  // mount-fresh reset for free; this call restores that invariant for the store.
  useEffect(() => {
    useSurveySessionStore.getState().reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: runs exactly once on mount
  }, []);

  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, handleHovered, onPointerDown, setHandleHovered } =
    useResizablePanes({ minPct: SURVEY_LEFT_MIN_PCT, maxPct: SURVEY_LEFT_MAX_PCT, initPct: SURVEY_LEFT_INIT_PCT });

  // Sync localBase when the prop changes (e.g. after a start-over that sets a new base).
  // localBase lives in the session store; we update it when the working-copy's baseKeyboard
  // prop changes so the wizard stays in sync with the pipeline-settled base.
  useEffect(() => {
    setLocalBase(baseKeyboard);
  }, [baseKeyboard, setLocalBase]);

  // Working-copy store actions needed by SurveyView (not delegated to StepHost).
  const resetSurvey = useWorkingCopyStore((s) => s.reset);
  const lockDesktop = useWorkingCopyStore((s) => s.lockDesktop);
  const setTouchLayoutJson = useWorkingCopyStore((s) => s.setTouchLayoutJson);
  const instantiateFromBase = useWorkingCopyStore((s) => s.instantiateFromBase);
  const instantiateFromExisting = useWorkingCopyStore((s) => s.instantiateFromExisting);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
  const setValidatorFindings = useWorkingCopyStore((s) => s.setValidatorFindings);

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
      // spec-014 mutate seam (T014): read/write the working-copy carve IR for
      // the reducer's path-scoped mutate() apply. Read via getState() (stable,
      // no re-render churn); write via the OVERLAY-PRESERVING setWorkingIR action.
      // These are INCREMENTAL patches to the working IR (mutate-apply US1 +
      // touch re-propagation US2), not base replacements, so they must NOT clear
      // the carve-deletion overlay (setIR would). See workingCopyStore.setWorkingIR.
      getWorkingIR: () => useWorkingCopyStore.getState().ir,
      setWorkingIR: (next) => useWorkingCopyStore.getState().setWorkingIR(next),
      // spec-014 US2 (T024): the staleness closure drives touch re-propagation
      // on physical-step completion. Read via getState() (no re-render churn).
      getStaleSteps: () => useWorkingCopyStore.getState().staleSteps,
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

    // Reads via getState() escape hatch (not a selector) to avoid a stale closure — the callback is memoised with empty deps.
    const track = useSurveySessionStore.getState().selectedTrack;
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

  // Derive KMN source from the working copy's base VFS for the validator.
  const kmnSource = useMemo(() => {
    if (!baseVfs) return null;
    const path = findKmnPath(baseVfs);
    if (!path) return null;
    const raw = baseVfs.get(path)?.content ?? null;
    return typeof raw === "string" ? raw : null;
  }, [baseVfs]);
  const { findings } = useValidator(kmnSource);
  // spec-014 US5/T034 — publish the SINGLE debounced `useValidator` findings to
  // the store so the sibling `StudioShell` can feed C4 spine-prefix shippability
  // the REAL Layer-A findings WITHOUT a second `useValidator`/debounce (V3 /
  // Article IV). This is a store-bridge publish, not a new validation source.
  useEffect(() => {
    setValidatorFindings(findings);
  }, [findings, setValidatorFindings]);
  const globalFindings = useMemo(() => selectUnmappedFindings(findings), [findings]);

  // ---------------------------------------------------------------------------
  // Start over — reset session store first (clears all traversal slots + history),
  // then reset the working-copy store and local component state.
  // Ordering: session.reset() before instantiatedRef.current = false so the
  // guard is clear before any re-instantiation can fire (research D-R5).
  // ---------------------------------------------------------------------------
  function handleStartOver() {
    sessionReset();
    resetSurvey();
    instantiatedRef.current = false;
    // sessionReset() calls reset() which already clears charactersSubStage to
    // "prefill" (spec 027 Stage 4 — the store slot is the authoritative owner).
  }

  // ---------------------------------------------------------------------------
  // Style constants (shared by full-screen and two-pane layouts)
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
  // Render: StepHost drives all survey step rendering (spec 028 Stage 5, T012).
  //
  // StepHost reads activeStepId from surveySessionStore, resolves the manifest
  // step, and selects chrome by step.layout (FR-002, R4):
  //   layout:"full" → full-screen container (returned directly, wrapping the panes)
  //   otherwise    → left pane content (returned inside the two-pane shell below)
  //
  // The host handles done/unsupported terminals and the unknown-id error panel.
  // SurveyView retains: resizable panes, OSK right pane, validator, oskMode,
  // pattern-map effect, instantiatedRef, onInstantiate (FR-009).
  // ---------------------------------------------------------------------------

  const stepHost = (
    <StepHost
      reducerDeps={reducerDeps}
      onStartOver={handleStartOver}
      ctx={surveyContext}
    />
  );

  const rightPct = 100 - leftPct;

  // Full-screen steps (carve/mechanisms/touch) bypass the two-pane layout.
  // StepHost returns the full-screen container; SurveyView renders it directly.
  // This reproduces the pre-Stage-5 early-return pattern without per-step branches
  // in SurveyView — the decision is data-driven via step.layout (R4, FR-002).
  if (activeStepIsFullScreen) {
    return stepHost;
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
      {/* Left pane: survey questions (StepHost renders pane content) */}
      <section aria-label="Survey questions" style={questionsPaneStyle}>
        {globalFindings.length > 0 && (
          <LintSummary findings={globalFindings} />
        )}
        {stepHost}
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
  // spec-014 US5/T034: C4 spine-prefix shippability has GRADUATED at the
  // function level — runCompleteness/checkSpinePrefixShippability now accept the
  // REAL Layer-A validator findings and strand lock-reaching prefixes on a
  // blocking finding (see dashboard/completeness.ts; V1/V2 proved in
  // completeness.test.ts, V3 in tests/dashboard/articleIVProbe.test.ts).
  //
  // LIVE WIRING (T034): those findings now flow through. The single debounced
  // `useValidator` cycle lives in the sibling `SurveyView` component (line ~545),
  // which publishes its output into `useWorkingCopyStore.validatorFindings` via
  // an effect. `StudioShell` reads that slice here and passes it into the single
  // `runCompleteness` call, so a blocking Layer-A finding live-strands the
  // lock-reaching spine prefixes. This honors V3 (Article IV — no SECOND
  // debounce / parallel validation path): there is exactly ONE `useValidator`
  // call site (in SurveyView) and exactly ONE `runCompleteness` call site (here),
  // and the latter consumes the former's output via the store bridge — no second
  // 300 ms timer. With the seam off (or before any validation cycle resolves),
  // `validatorFindings` defaults to `[]` ⇒ the pure structural proxy, byte-
  // identical to P4b / flag-off.
  const validatorFindings = useWorkingCopyStore((s) => s.validatorFindings);
  // #890 — default-fill provenance, published by MechanismGallery's
  // pattern-loading effect. Passed down to FlowMapView -> StrategyTreeView as
  // a prop for the same dashboard-layer boundary reason as completenessReport
  // below (DashboardView/StrategyTreeView have NO stores/ import).
  const axisFills = useWorkingCopyStore((s) => s.axisFills);
  const completenessReport = useMemo(
    () =>
      runCompleteness(
        manifest,
        { desktopLocked, touchLayoutJson },
        staleSteps,
        validatorFindings,
      ),
    [desktopLocked, touchLayoutJson, staleSteps, validatorFindings],
  );

  let content: ReactNode;
  switch (route) {
    case "welcome":
      content = <WelcomeScreen />;
      break;
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
      content = <FlowMapView completeness={completenessReport} axisFills={axisFills} />;
      break;
    case "profile":
      content = <ProfileScreen />;
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
