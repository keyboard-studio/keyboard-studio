// Studio root — hash-based router + nav bar.
//
// Routes:
//   #survey  (default)  — full authoring wizard: identity → base → prefill →
//                         B (inventory) → carve (Phase D) →
//                         mechanisms (Phase C) → E → help (Phase F) → done
//   #preview            — PreviewScreen: "try it" — OSK preview + diagnostics
//                         (no Download button, no GitHubSubmitPanel)
//   #output             — OutputScreen: "ship it" — Download .zip +
//                         GitHubSubmitPanel (no interactive OSK)

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { useResizablePanes } from "./hooks/useResizablePanes.ts";
import type { BaseKeyboard, Pattern, SurveyPhaseResult, TouchAssignment } from "@keyboard-studio/contracts";
import { buildTouchLayoutJson } from "./lib/buildTouchLayoutJson.ts";
import { useWorkingCopyStore } from "./stores/workingCopyStore.ts";
import { instantiateFromBaseIfConfirmed } from "./lib/confirmRebase.ts";
import { IdentityLite, Prefill, PhaseB, PhaseF, type IdentityLiteResult } from "./survey/index.ts";
import { BaseResolution } from "./components/BaseResolution.tsx";
import { UnsupportedScriptStub } from "./components/UnsupportedScriptStub.tsx";
import type { SuggestTarget } from "./lib/suggestBase.ts";
import type { SurveyContext } from "./survey/types.ts";
import { CarveGallery } from "./components/CarveGallery.tsx";
import { MechanismGallery } from "./components/MechanismGallery.tsx";
import { TouchGallery } from "./components/TouchGallery.tsx";
import { type RouteId } from "./lib/navigate.ts";
import { useKeyboardArtifact, type OnInstantiateCallback, type ScaffoldSpec } from "./hooks/useKeyboardArtifact.ts";
import { useWorkingCopyTransform } from "./hooks/useWorkingCopyTransform.ts";
import { OSKFrame } from "./components/OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./components/OskModeToggle.tsx";
import { TrackStep, type Track } from "./components/TrackStep.tsx";
import { ProjectNameStep } from "./components/ProjectNameStep.tsx";
import { useValidator } from "./hooks/useValidator.ts";
import { usePlacementPriors } from "./hooks/usePlacementPriors.ts";
import { findKmnPath } from "./lib/findKmnPath.ts";
import { resolveBaseTouchJson } from "./lib/resolveBaseTouchJson.ts";
import { buildFindingsByQuestionId } from "./lint/lintToQuestion.ts";
import { getPatternLibraryService } from "./lib/services.ts";
import { physicalAssignmentsOf } from "./lib/physicalAssignments.ts";
import { FlowMapView } from "./flowmap/FlowMapView.tsx";
import { PreviewScreen } from "./components/PreviewScreen.tsx";
import { OutputScreen } from "./components/OutputScreen.tsx";
import { navigateTo } from "./lib/navigate.ts";

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
// SurveyView — two-pane resizable layout: questions left, OSK preview right
// ---------------------------------------------------------------------------

const SURVEY_DIVIDER_WIDTH = 6;
const SURVEY_LEFT_MIN_PCT = 25;
const SURVEY_LEFT_MAX_PCT = 65;
const SURVEY_LEFT_INIT_PCT = 45;

// Studio wizard stage machine (spec §8 "Workflow ordering", issue #508):
//   identity → base → track → (project-name [copy only]) → prefill →
//   B → carve (Phase D) → mechanisms (Phase C) → E → F → done
// Gated scripts route to "unsupported".
type SurveyStage =
  | "identity"
  | "base"
  | "track"
  | "project-name"
  | "prefill"
  | "carve"
  | "B"
  | "mechanisms"
  | "E"
  | "F"
  | "done"
  | "unsupported";

/** Build the downstream SurveyContext from the identity-lite result. */
function contextFromIdentity(identity: IdentityLiteResult): SurveyContext {
  return {
    language_name: identity.english || identity.autonym,
    routing_group: identity.prefill.routingGroup,
    script_family: identity.prefill.script,
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
  const [stage, setStage] = useState<SurveyStage>("identity");
  const [identityResult, setIdentityResult] = useState<IdentityLiteResult | null>(null);
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({});
  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const { containerRef, leftPct, handleHovered, onPointerDown, setHandleHovered } =
    useResizablePanes({ minPct: SURVEY_LEFT_MIN_PCT, maxPct: SURVEY_LEFT_MAX_PCT, initPct: SURVEY_LEFT_INIT_PCT });

  // Corpus placement priors — loaded lazily from docs/placement-priors.json.
  // Null while loading or on error (gallery degrades gracefully without it).
  const corpusPlacementMap = usePlacementPriors();

  // Track 1 (Copy) vs Track 2 (Adapt) — set at the "track" stage.
  // Null until the user picks a track.
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  // ScaffoldSpec for Track 1: populated after the project-name step.
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

  // Working-copy store instantiation — routes to Track 1 (instantiateFromBase)
  // or Track 2 (instantiateFromExisting) based on which track the user selected.
  // selectedTrack is captured in a ref so the memoised callback always sees the
  // current value even when the async compile completes after selectedTrack changes.
  const selectedTrackRef = useRef<Track | null>(null);
  useEffect(() => {
    selectedTrackRef.current = selectedTrack;
  }, [selectedTrack]);

  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir }) => {
    const track = selectedTrackRef.current;
    if (track === "adapt") {
      // Track 2: preserve existing keyboard identity.
      if (ir === null || vfs === null) {
        console.warn("[studio] Track 2 instantiate skipped: no parsed IR (mock engine?)");
        return;
      }
      useWorkingCopyStore.getState().instantiateFromExisting(base, { vfs, ir });
    } else {
      // Track 1 (or null/default): new keyboard from base, with rebase guard.
      instantiateFromBaseIfConfirmed(base, { vfs, ir });
    }
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

  // Survey results are persisted into the working-copy store (the data bus the
  // gallery and §7.2 strategy selector read), not discarded on each phase transition.
  const recordPhase = useWorkingCopyStore((s) => s.recordPhase);
  const resetSurvey = useWorkingCopyStore((s) => s.reset);
  const setStoreIdentity = useWorkingCopyStore((s) => s.setIdentity);
  const lockDesktop = useWorkingCopyStore((s) => s.lockDesktop);
  const setTouchLayoutJson = useWorkingCopyStore((s) => s.setTouchLayoutJson);
  const baseIr = useWorkingCopyStore((s) => s.baseIr);

  // Derive KMN source from the working copy's base VFS (the scaffolded snapshot)
  // so the validator can produce findings while the survey is in progress.
  // Note: post-carve IR mutations are not reflected here; projectWorkingCopyVfs
  // would be needed to validate the fully-projected state.
  const baseVfs = useWorkingCopyStore((s) => s.baseVfs);
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

  // Identity-lite is the hybrid flow's head: it captures the language + the
  // INDEPENDENT target script, deriving the routing/A2 prefill. Gated scripts
  // (Ethi/Hani/Hang) end on the "not supported" stage. See spec §8/§9.
  //
  // The autonym-to-English-name default is handled in the survey UI layer:
  // IdentityLite passes getSeedValue to SurveyRunner so the English Name input
  // is pre-filled with the autonym when the user first arrives at that question.
  function handleIdentityComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    recordPhase(result);
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    setStage(identity.supported ? "base" : "unsupported");
  }

  // The base chosen in-survey is set on localBase so the pipeline starts
  // immediately (compile can run in the background while the user picks track).
  // The survey stage advances to "track" so the author chooses Copy vs Adapt.
  function handleBaseResolved(base: BaseKeyboard) {
    setLocalBase(base);
    setStage("track");
  }

  // Handle track selection. Copy → project-name step. Adapt → skip to prefill
  // (preserves base identity; pipeline already running in background).
  function handleTrackSelected(track: Track) {
    setSelectedTrack(track);
    if (track === "copy") {
      setStage("project-name");
    } else {
      // Track 2: no scaffoldSpec needed — adapt uses base's own id/displayName.
      setScaffoldSpec(null);
      setStage("prefill");
    }
  }

  // Handle project-name confirmation (Track 1 only).
  // Set the scaffoldSpec so useKeyboardArtifact routes through scaffold(),
  // AND push the new identity into the working-copy store so downstream
  // consumers (OSKFrame's setActiveKeyboard, serializeWorkingCopy's zip
  // filename, lint identity checks) see the scaffolded keyboardId rather
  // than the base id.
  function handleProjectNameNext(displayName: string, keyboardId: string) {
    setScaffoldSpec({ keyboardId, displayName });
    setStoreIdentity({ keyboardId, displayName });
    setStage("prefill");
  }

  function handleCarveComplete() {
    setStage("mechanisms");
  }
  function handlePhaseBComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    setStage("carve");
  }
  function handleMechanismsComplete() {
    lockDesktop();
    setStage("E");
  }
  function handlePhaseEComplete(assignments: TouchAssignment[]) {
    // assignments arriving here are already filtered to non-inherited by
    // TouchGallery.handleContinue — do NOT double-filter.
    //
    // Inject-only-when-real-edits policy: if there are no non-inherited
    // assignments, clear any previously stored touch layout and let KMW use
    // its own native default (or the keyboard's shipped .keyman-touch-layout).
    // Only generate and store a layout when there is something real to inject.
    if (assignments.length === 0 || baseIr === null) {
      setTouchLayoutJson(null);
    } else {
      try {
        // Case B: base ships a touch layout → apply faithfully onto raw JSON copy.
        // Case A: no shipped touch layout (or baseVfs not yet loaded) → IR-based path.
        const { json, warnings } = buildTouchLayoutJson(baseIr, assignments, resolveBaseTouchJson(baseVfs));
        if (warnings.length > 0) {
          console.error("[handlePhaseEComplete] buildTouchLayoutJson warnings:", warnings);
        }
        // json is null when the emit pipeline threw — omit the touch layout
        // rather than injecting null/empty. setStage("F") still runs below.
        setTouchLayoutJson(json);
      } catch (err) {
        console.error("[handlePhaseEComplete] buildTouchLayoutJson threw unexpectedly:", err);
        // Per spec, the transition to stage "F" proceeds regardless of touch-layout
        // build failure — omit the touch layout rather than blocking the phase.
        // Degradation is graceful: with no touch layout file, KMW falls back to the
        // keyboard's shipped .keyman-touch-layout (or its own native default).
        setTouchLayoutJson(null);
      }
    }
    setStage("F");
  }
  function handlePhaseFComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    setStage("done");
    navigateTo("output");
  }
  function handleStartOver() {
    resetSurvey();
    setIdentityResult(null);
    setSurveyContext({});
    setLocalBase(null);
    setSelectedTrack(null);
    setScaffoldSpec(null);
    setStage("identity");
  }

  // The (language, script) target for base suggestion — keyed on the CHOSEN
  // script (decoupled from the language; spec §8/§9). The BCP47 tag (e.g.
  // "ha-Latn", "hi-Deva") enables language-aware ranking in BaseResolution;
  // an empty bcp47 degrades gracefully to script-match ranking.
  const suggestTarget: SuggestTarget | null =
    identityResult !== null
      ? {
          script: identityResult.prefill.script,
          ...(identityResult.bcp47 !== ""
            ? { bcp47: identityResult.bcp47 }
            : {}),
        }
      : null;

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

  if (stage === "carve") {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <CarveGallery
          onComplete={handleCarveComplete}
          onBack={() => setStage("B")}
        />
      </div>
    );
  }

  if (stage === "mechanisms") {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <MechanismGallery
          selectedBaseKeyboard={localBase}
          onComplete={handleMechanismsComplete}
          onBack={() => setStage("carve")}
          {...(corpusPlacementMap !== null ? { placementMap: corpusPlacementMap } : {})}
        />
      </div>
    );
  }

  if (stage === "E") {
    return (
      <div style={{ height: "100%", overflow: "hidden" }}>
        <TouchGallery
          onComplete={handlePhaseEComplete}
          onBack={() => setStage("mechanisms")}
        />
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
        {stage === "done" && donePaneContent}
        {stage === "identity" && (
          <IdentityLite
            context={surveyContext}
            onComplete={handleIdentityComplete}
            findingsByQuestionId={findingsByQuestionId}
          />
        )}
        {stage === "unsupported" && identityResult !== null && (
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
        {stage === "base" && suggestTarget !== null && (
          <BaseResolution
            target={suggestTarget}
            onResolved={handleBaseResolved}
            onBack={() => setStage("identity")}
          />
        )}
        {stage === "track" && localBase !== null && (
          <TrackStep
            base={localBase}
            onNext={handleTrackSelected}
            onBack={() => setStage("base")}
          />
        )}
        {stage === "project-name" && identityResult !== null && (
          <ProjectNameStep
            defaultDisplayName={identityResult.autonym || identityResult.english}
            onNext={handleProjectNameNext}
            onBack={() => setStage("track")}
          />
        )}
        {stage === "prefill" && identityResult !== null && localBase !== null && (
          <Prefill
            identity={identityResult}
            base={localBase}
            onConfirm={() => setStage("B")}
            onBack={() => {
              // Back from prefill returns to track choice (not base picker directly).
              setStage(selectedTrack === "copy" ? "project-name" : "track");
            }}
          />
        )}
        {stage === "B" && (
          // NOTE: `placementMap` is intentionally not supplied here in v1.
          // Per decision D-INT-2 the seeder never runs inside the SPA; the real
          // PlacementMap comes from a pinned placement-priors artifact produced
          // offline and shipped as static data (tracked separately — see this
          // change's PR). The prop stays optional and unsupplied in production;
          // the consumption path (buildPlacementSeeds -> getSeedValue) is
          // exercised by unit tests via the placement-map.sample.json fixture.
          <PhaseB
            context={surveyContext}
            onComplete={handlePhaseBComplete}
            onBack={() => setStage("prefill")}
            findingsByQuestionId={findingsByQuestionId}
          />
        )}
        {stage === "F" && (
          <PhaseF
            context={surveyContext}
            onComplete={handlePhaseFComplete}
            onBack={() => setStage("E")}
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
