// Studio root — hash-based router + nav bar.
//
// Routes:
//   #survey  (default)  — full authoring wizard: identity → base → track →
//                         [project_name (copy)] → characters (prefill/B) →
//                         carve → mechanisms → sequences →
//                         touch → help → done
//   #preview            — PreviewScreen: "try it" — OSK preview + diagnostics
//                         (no Download button, no SignUpPanel)
//   #output             — OutputScreen: "ship it" — Download .zip +
//                         SignUpPanel (no interactive OSK)

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useResizablePanes } from "./hooks/useResizablePanes.ts";
import { ResizeHandle } from "./components/ResizeHandle.tsx";
import type { BaseKeyboard, Pattern, VirtualFS, KeyboardIR, RemovalCapability } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "./lib/buildTouchLayoutJson.ts";
import { shouldEmitTouchLayout, resolveTouchSeedSource } from "./lib/touchEmission.ts";
import { useWorkingCopyStore, bindManifest } from "./stores/workingCopyStore.ts";
import { useSurveySessionStore } from "./stores/surveySessionStore.ts";
import { instantiateFromBaseIfConfirmed } from "./lib/confirmRebase.ts";
import {
  deriveProjectKeyFromWorkingCopy,
  discardActiveDraft,
  installDraftAutosave,
  replaceActiveDraftIfDifferentProject,
  wasDraftRestoredThisBoot,
} from "./lib/draftPersistence.ts";
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
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import "./lib/i18n.ts"; // side-effect: load + activate the default (en) catalog
import { WelcomeScreen } from "./components/WelcomeScreen.tsx";
import { LocaleSwitcher } from "./components/LocaleSwitcher.tsx";
import { ProfileScreen } from "./components/ProfileScreen.tsx";
import { AccountControl } from "./components/AccountControl.tsx";
import { hasVisited } from "./lib/firstVisit.ts";
import { manifest, validateManifestShape } from "./steps/manifest.ts";
import { applyStepCompletion, type ReducerDeps } from "./steps/reducer.ts";
import { StepHost } from "./components/StepHost.tsx";
import { TEXT_MAIN, FONT } from "./survey/surveyStyles.ts";
import { CharacterMapPane } from "./survey/CharacterMapPane.tsx";
import { useBasePreviewStatusStore, type BasePreviewStatus } from "./stores/basePreviewStatusStore.ts";

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

// Where a visitor lands when the incoming hash does not dictate otherwise. A
// genuine first-time visitor (this browser has never entered the app) sees the
// WelcomeScreen; a returning visitor goes straight into the survey. The flag is
// durable in localStorage (lib/firstVisit.ts) so it survives reloads and the
// OAuth sign-in round trip. (main has no resumable-draft path yet, so unlike
// the dev branch this gate keys on visited-ness alone.)
function defaultLandingRoute(): RouteId {
  return hasVisited() ? "survey" : "welcome";
}

function useRoute(): RouteId {
  const hashToRoute = (): RouteId => {
    const raw = window.location.hash.slice(1);
    // A genuine newcomer always lands on welcome first — even on a deep-linked
    // hash (a shared #survey/#preview link, a stale bookmark). The gate lifts
    // the moment they leave welcome (markVisited), after which the incoming
    // hash is honored normally.
    if (defaultLandingRoute() === "welcome") {
      // Keep window.location.hash in sync with the forced route, so that
      // WelcomeScreen's navigateTo("welcome"→"survey") assignment fires a real
      // hashchange rather than a same-value no-op that soft-locks welcome.
      if (raw !== "welcome") {
        window.history.replaceState(window.history.state, "", "#welcome");
      }
      return "welcome";
    }
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

      {/* Right group — locale switcher (all routes) + account control
          (hidden on the welcome route) */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <LocaleSwitcher />
        {active !== "welcome" && <AccountControl />}
      </div>
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
//   identity → choose_base → track → characters → marks → carve →
//   mechanisms[lock:physical] → sequences →
//   touch[lock:touch] → help → package[reserved]
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
//   re-captures the artifact into pendingArtifactRef; the commit effect's
//   doCommit (below) would then run the choose_base side effect
//   (applyStepCompletion("choose_base", ...)) a second time. An
//   instantiatedRef flag prevents that side effect from running more than once
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

// validateManifestShape (M2/M3/M4/M4b/M5 structural guard) now lives in
// steps/manifest.ts (exported, unit-tested by spec 034 T003). Still invoked
// once here at module load so a misshapen manifest is a hard error before any
// render — fail fast so CI catches it.
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
  // Injected into reducerDeps (spec 035 R12) so reducer.ts can clear the
  // touch_seed_source fork choice on a genuine base re-instantiation without
  // steps/ importing stores/ directly.
  const setTouchSeedSource = useSurveySessionStore((s) => s.setTouchSeedSource);

  // Derive whether the active step declares layout:"full" (load-bearing per Stage 5,
  // FR-002, R4). SurveyView uses this to skip the two-pane shell for full-screen steps.
  const activeStepIsFullScreen = useMemo(() => {
    const step = manifest.find((s) => s.id === activeStepId);
    return step?.layout === "full";
  }, [activeStepId]);

  // Derived the same way as activeStepIsFullScreen: which right-pane content
  // the active step declares (default "preview" — the live OSK). Used below
  // to swap in CharacterMapPane for the Phase B build-list screen only, gated
  // further on discoveryMethod === "build-list" (the IntroChooser and the
  // manual step-by-step path keep the OSK preview — see steps/types.ts's
  // rightPane field and steps/manifest.ts's "characters" step).
  const activeRightPane = useMemo(() => {
    const step = manifest.find((s) => s.id === activeStepId);
    return step?.rightPane ?? "preview";
  }, [activeStepId]);
  const discoveryMethod = useSurveySessionStore((s) => s.discoveryMethod);
  const showCharacterMap = activeRightPane === "character-map" && discoveryMethod === "build-list";

  // Reset the session store on mount — the store is a module-level singleton that
  // persists across React tree unmounts/remounts (e.g. navigating away from the
  // survey route and back creates a new SurveyView mount = a new wizard session).
  // Without this reset the singleton would resume from stale prior state rather
  // than starting at "identity". Component-local useState used to give this
  // mount-fresh reset for free; this call restores that invariant for the store.
  //
  // DEVIATION 2 (spec 034 US3, research D4): a durable draft may have just been
  // restored in main.tsx (BEFORE this component — or any component — mounted),
  // patching both the working-copy AND survey-session stores so the author
  // resumes at their last `activeStepId`. An unconditional reset() here would
  // immediately clobber that restore. `wasDraftRestoredThisBoot()` reads the
  // module-level flag draftPersistence.loadDraft() sets on success; it is
  // stable across StrictMode's double-invoked mount effects because
  // loadDraft() itself only ever runs once, pre-mount, in main.tsx.
  useEffect(() => {
    if (!wasDraftRestoredThisBoot()) {
      useSurveySessionStore.getState().reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally empty: runs exactly once on mount
  }, []);

  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, onPointerDown } =
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
  const clearStale = useWorkingCopyStore((s) => s.clearStale);
  const setTouchLayoutJson = useWorkingCopyStore((s) => s.setTouchLayoutJson);
  const instantiateFromBase = useWorkingCopyStore((s) => s.instantiateFromBase);
  const instantiateFromExisting = useWorkingCopyStore((s) => s.instantiateFromExisting);
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
  // Preview-before-commit (choose_base step): the compile pipeline may settle
  // BEFORE the author clicks "Choose this keyboard" (they might preview
  // several bases first). `onInstantiate` below only CAPTURES the settled
  // artifact here; the actual instantiation (`doCommit`) is deferred until
  // `baseConfirmed` flips true, via the effect that follows `onInstantiate`.
  // Cleared alongside `instantiatedRef` on start-over.
  // ---------------------------------------------------------------------------
  const pendingArtifactRef = useRef<{
    base: BaseKeyboard;
    vfs: VirtualFS;
    ir: KeyboardIR | null;
    removalCapabilities: Map<string, RemovalCapability>;
  } | null>(null);

  // ---------------------------------------------------------------------------
  // T023 (spec 034 US3): teardown fn for the durable-draft autosave, installed
  // once the working copy is instantiated (see onInstantiate below) and torn
  // down on unmount / start-over / a fresh re-instantiation for a new project.
  // ---------------------------------------------------------------------------
  const autosaveTeardownRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      autosaveTeardownRef.current?.();
      autosaveTeardownRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- teardown-on-unmount only; the ref itself is stable
  }, []);

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
      clearStale,
      setTouchLayoutJson,
      instantiateFromBase,
      instantiateFromExisting,
      setTouchSeedSource,
      // Spec 035 R11: this wrapper is the ONE call site (of the two — the
      // other is TouchGallery's preview/lint memos) that applies the
      // emission matrix for the output path. It resolves the Entity-5
      // default seed source, decides whether to emit at all, and only then
      // calls the real buildTouchLayoutJson — so reducer.ts (steps/, which
      // may not import lib/) stays a thin pass-through.
      buildTouchLayoutJson: (baseIrArg, assignments, opts) => {
        const seedSource = resolveTouchSeedSource(opts.seedSource, opts.baseTouchJson !== undefined);
        const hasRealEdits = assignments.length > 0;
        if (!shouldEmitTouchLayout(seedSource, opts.mods, hasRealEdits)) {
          return { json: null, warnings: [] };
        }
        return buildTouchLayoutJson(baseIrArg, assignments, {
          // Reseed discards the shipped layout (R10) — never pass baseTouchJson
          // through on that path, even though buildTouchLayoutJson's own Case A
          // branch condition would ignore it anyway.
          ...(seedSource !== "reseed-from-desktop" && opts.baseTouchJson !== undefined
            ? { baseTouchJson: opts.baseTouchJson }
            : {}),
          mods: opts.mods,
          seedSource,
        });
      },
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
      // Spec 046 R10: record (never act on) the base-content migration need
      // when base-plus-mark output is chosen over a ready-made-form base.
      setMarksMigrationNeeded: (needed) =>
        useSurveySessionStore.getState().setMarksMigrationNeeded(needed),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Wrapper lambdas delegate to stable module imports — excluded from deps intentionally.
    [lockDesktop, clearStale, setTouchLayoutJson, instantiateFromBase, instantiateFromExisting, setTouchSeedSource],
  );

  // Keep reducerDepsRef current so the async onInstantiate callback always
  // sees the latest deps without being re-created on every render.
  const reducerDepsRef = useRef<ReducerDeps>(reducerDeps);
  useEffect(() => {
    reducerDepsRef.current = reducerDeps;
  }, [reducerDeps]);

  // ---------------------------------------------------------------------------
  // doCommit — the actual choose_base instantiation side effect (R3).
  //
  // Extracted verbatim from the pre-preview-before-commit `onInstantiate` body
  // so its internals are unchanged; it is now invoked from the single-
  // instantiation effect below (gated on `baseConfirmed`) rather than directly
  // from the compile-pipeline callback. Dispatches
  // applyStepCompletion("choose_base", ...), which routes Track 2 →
  // instantiateFromExisting, Track 1/default → instantiateFromBaseIfConfirmed.
  //
  // instantiatedRef still gates this to fire exactly once per session — a
  // second compile triggered by setScaffoldSpec (or a second confirm click)
  // will not re-run the instantiate side effect (P1 fix).
  // ---------------------------------------------------------------------------
  const doCommit = useCallback(
    (
      base: BaseKeyboard,
      { vfs, ir, removalCapabilities }: { vfs: VirtualFS; ir: KeyboardIR | null; removalCapabilities: Map<string, RemovalCapability> },
    ) => {
      if (instantiatedRef.current) return;
      instantiatedRef.current = true;

      // T025 (spec 034 US3, VR-5 / FR-009 / AS-4): a durable draft from a
      // DIFFERENT project may already be active (e.g. the author abandoned an
      // earlier in-progress keyboard without "start over" and picked a new
      // base). This is the instantiation entry point, so it is where a genuine
      // project switch first becomes visible — replace the prior project's
      // draft now, BEFORE this instantiation's own autosave (below) starts
      // writing under the new key. MVP policy: clean replace, never silent
      // merge (a confirm-before-overwrite UX is the non-MVP alternative the
      // contract also permits, deferred).
      replaceActiveDraftIfDifferentProject(base.id);

      // Reads via getState() escape hatch (not a selector) to avoid a stale closure — the callback is memoised with empty deps.
      const track = useSurveySessionStore.getState().selectedTrack;
      applyStepCompletion(
        "choose_base",
        { base, vfs, ir, removalCapabilities, track: track ?? null },
        reducerDepsRef.current,
      );

      // T023: install the durable-draft autosave now that the working copy is
      // instantiated. `deriveProjectKeyFromWorkingCopy` reads the JUST-WRITTEN
      // store state via getState() (identity.keyboardId falls back to
      // baseKeyboard.id — see draftPersistence.ts) so this resolves immediately
      // for both tracks, even before Track 1's Phase A sets a custom keyboardId.
      // `instantiatedRef` above already guards this whole callback body to run
      // at most once per mount, so `autosaveTeardownRef.current` is always null
      // here; the `?.()` is defensive, not load-bearing.
      const projectKey = deriveProjectKeyFromWorkingCopy(useWorkingCopyStore.getState());
      if (projectKey !== null) {
        autosaveTeardownRef.current?.();
        autosaveTeardownRef.current = installDraftAutosave(projectKey);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Same escape hatch as the pre-preview-before-commit onInstantiate: all
    // reads are via getState()/reducerDepsRef.current (stable refs), not
    // React state, so an empty dep array is intentional here too.
    [],
  );

  // ---------------------------------------------------------------------------
  // onInstantiate — compile-pipeline callback (R3: choose_base side effect).
  //
  // Preview-before-commit: fires whenever the compile pipeline produces an
  // IR + VFS for the CURRENTLY PREVIEWED base (every preview click restarts
  // the pipeline for its base). This callback ONLY captures the settled
  // artifact — it does NOT instantiate the working copy or advance the
  // wizard. `doCommit` (above) does that, invoked by the effect below once
  // the author clicks "Choose this keyboard" (`baseConfirmed` flips true).
  // This is what makes previewing several bases side-effect-free.
  // ---------------------------------------------------------------------------
  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir, removalCapabilities }) => {
    pendingArtifactRef.current = { base, vfs, ir, removalCapabilities };
  }, []);

  // Subscribed so the effect below re-checks whenever the author confirms.
  const baseConfirmed = useSurveySessionStore((s) => s.baseConfirmed);

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

  // ---------------------------------------------------------------------------
  // Single-instantiation effect (preview-before-commit).
  //
  // Runs `doCommit` at most once, and only once BOTH are true:
  //   - the author has confirmed (`baseConfirmed`, set by
  //     BaseResolutionAdapter's onConfirm — see editors/adapters/panelAdapters.tsx)
  //   - the compile pipeline has actually settled for THAT SAME base
  //     (`pendingArtifactRef`, filled by `onInstantiate` above).
  //
  // Confirm is now gated on `previewStatus === "ready"` in BaseResolution's
  // commit button, so in practice `baseConfirmed` only flips true once the
  // pipeline has already settled — the ref is already populated by the time
  // this effect sees `baseConfirmed`. The `artifactStage`-triggered re-run
  // (waiting for the ref to be filled after confirm) is retained purely as a
  // defensive fallback, not a load-bearing path. The `art.base.id === lb.id`
  // check guards against a stale ref from a PREVIOUS preview surviving a fast
  // re-preview.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!baseConfirmed || instantiatedRef.current) return;
    const art = pendingArtifactRef.current;
    const lb = useSurveySessionStore.getState().localBase;
    if (art && lb && art.base.id === lb.id) {
      doCommit(art.base, { vfs: art.vfs, ir: art.ir, removalCapabilities: art.removalCapabilities });
    }
    // else: compile still in flight for this base — onInstantiate will fill
    // pendingArtifactRef and the "ready" artifactStage transition below will
    // re-run this effect.
    // doCommit is stable (empty-deps useCallback, see its own definition
    // above) — omitted from deps to mirror the existing escape-hatch
    // convention in this file (e.g. the reducerDeps memo above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseConfirmed, artifactStage]);

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
    // T024 (spec 034 US3, research D5, G-3): clear the durable draft (and the
    // active-project pointer) BEFORE resetting the in-memory stores, so the
    // NEXT boot does not immediately re-rehydrate the just-abandoned session.
    discardActiveDraft();
    autosaveTeardownRef.current?.();
    autosaveTeardownRef.current = null;

    sessionReset();
    resetSurvey();
    instantiatedRef.current = false;
    pendingArtifactRef.current = null;
    // sessionReset() calls reset() which already clears charactersSubStage to
    // "prefill" (spec 027 Stage 4 — the store slot is the authoritative owner).
    // sessionReset() also clears baseConfirmed back to false via INITIAL_STATE.
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
    color: TEXT_MAIN,
    fontFamily: FONT,
  };

  // ---------------------------------------------------------------------------
  // basePreviewStatusStore value — a coarse projection of `artifactStage` (see
  // stores/basePreviewStatusStore.ts for the BasePreviewStatus union).
  // Published to the store below so BaseResolutionAdapter (reached through
  // StepHost while activeStepId === "choose_base") can read the live preview
  // status without importing useKeyboardArtifact directly, and without a
  // prop-drilling chain through StepHost's generic EditorStepProps.
  // ---------------------------------------------------------------------------
  const previewStatus: BasePreviewStatus = useMemo(() => {
    if (localBase === null) return "idle";
    switch (artifactStage.kind) {
      case "fetching":
      case "vfs-loading":
      case "compiling":
        return "loading";
      case "ready":
        return "ready";
      case "error":
        return "error";
      default:
        return "idle";
    }
  }, [localBase, artifactStage.kind]);

  const setBasePreviewStatus = useBasePreviewStatusStore((s) => s.setStatus);
  useEffect(() => {
    setBasePreviewStatus(previewStatus);
  }, [previewStatus, setBasePreviewStatus]);

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

  // Full-screen steps (carve/mechanisms/sequences/touch) bypass the two-pane layout.
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
      <ResizeHandle onPointerDown={onPointerDown} />

      {/* Right pane: live OSK preview, OR (Phase B build-list only) the
          interactive character map — see activeRightPane/showCharacterMap
          above. The mechanism gallery and every other full-screen step render
          their own preview and are unaffected (they never reach this branch:
          activeStepIsFullScreen returns early above). */}
      <section
        aria-label={showCharacterMap ? "Character map" : "Keyboard preview"}
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
          color: TEXT_MAIN,
          fontFamily: FONT,
        }}
      >
        {showCharacterMap ? (
          <CharacterMapPane />
        ) : localBase === null ? (
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
    <I18nProvider i18n={i18n}>
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
    </I18nProvider>
  );
}
