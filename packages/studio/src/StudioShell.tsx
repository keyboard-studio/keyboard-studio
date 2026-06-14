// Studio root — hash-based router + nav bar.
//
// Routes:
//   #pick-base (default)  — base-keyboard picker + live OSK preview
//   #survey               — survey flow (stub; not yet implemented)
//   #gallery              — pattern gallery (stub; not yet implemented)
//   #preview              — compiled preview (stub; not yet implemented)
//   #output               — output / delivery (stub; not yet implemented)

import { useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import type { BaseKeyboard, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useSurveyResultsStore } from "./stores/surveyResultsStore.ts";
import { PreviewShell } from "./components/PreviewShell.tsx";
import { IdentityLite, Prefill, PhaseB, PhaseF, type IdentityLiteResult } from "./survey/index.ts";
import { BaseResolution } from "./components/BaseResolution.tsx";
import { UnsupportedScriptStub } from "./components/UnsupportedScriptStub.tsx";
import type { SuggestTarget } from "./lib/suggestBase.ts";
import type { SurveyContext } from "./survey/types.ts";
import { CarveGallery } from "./components/CarveGallery.tsx";
import { type RouteId } from "./lib/navigate.ts";
import { useKeyboardArtifact } from "./hooks/useKeyboardArtifact.ts";
import { OSKFrame } from "./components/OSKFrame.tsx";
import { OskModeToggle, type OskMode } from "./components/OskModeToggle.tsx";

const VALID_ROUTES = new Set<RouteId>([
  "pick-base",
  "survey",
  "gallery",
  "preview",
  "output",
]);

function isRouteId(v: string): v is RouteId {
  return VALID_ROUTES.has(v as RouteId);
}

// ---------------------------------------------------------------------------
// useRoute — reads window.location.hash and reacts to hashchange events
// ---------------------------------------------------------------------------

function useRoute(): RouteId {
  const hashToRoute = (): RouteId => {
    const raw = window.location.hash.slice(1);
    return isRouteId(raw) ? raw : "pick-base";
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
// RoutePlaceholder — stub for routes not yet implemented
// ---------------------------------------------------------------------------

function RoutePlaceholder({ title }: { title: string }) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#9aa7b8",
        fontSize: 16,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {title} — coming soon
    </div>
  );
}

// ---------------------------------------------------------------------------
// NavBar
// ---------------------------------------------------------------------------

interface NavItem {
  id: RouteId;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "pick-base", label: "Pick Base" },
  { id: "survey", label: "Survey" },
  { id: "gallery", label: "Gallery" },
  { id: "preview", label: "Preview" },
  { id: "output", label: "Output" },
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
        background: "#0d1117",
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

// Hybrid flow stage machine (spec §8 "Workflow ordering"): the survey head is
// identity-lite -> base resolution -> base-derived prefill, then the existing
// inventory (B) and remaining (F) phases. Gated scripts route to "unsupported".
type SurveyStage = "identity" | "base" | "prefill" | "B" | "F" | "done" | "unsupported";

/** Build the downstream SurveyContext from the identity-lite result. */
function contextFromIdentity(identity: IdentityLiteResult): SurveyContext {
  return {
    language_name: identity.english || identity.autonym,
    routing_group: identity.prefill.routingGroup,
    script_family: identity.prefill.script,
  };
}

interface SurveyViewProps {
  baseKeyboard: BaseKeyboard | null;
  /** Lifts the in-survey base choice up so the preview + scaffold spine see it. */
  onBaseSelected: (kb: BaseKeyboard) => void;
}

function SurveyView({ baseKeyboard, onBaseSelected }: SurveyViewProps) {
  const [stage, setStage] = useState<SurveyStage>("identity");
  const [identityResult, setIdentityResult] = useState<IdentityLiteResult | null>(null);
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({});
  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const [leftPct, setLeftPct] = useState(SURVEY_LEFT_INIT_PCT);
  const [handleHovered, setHandleHovered] = useState(false);

  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startPct: leftPct };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
    },
    // leftPct captured via dragRef; document listeners registered once per drag
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leftPct],
  );

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (dragRef.current === null || containerRef.current === null) return;
    const containerW = containerRef.current.getBoundingClientRect().width;
    if (containerW === 0) return;
    const deltaPct = ((e.clientX - dragRef.current.startX) / containerW) * 100;
    const next = Math.min(
      SURVEY_LEFT_MAX_PCT,
      Math.max(SURVEY_LEFT_MIN_PCT, dragRef.current.startPct + deltaPct),
    );
    setLeftPct(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const { stage: artifactStage, retry } = useKeyboardArtifact(baseKeyboard);
  const rightPct = 100 - leftPct;

  // Survey results are persisted into the survey-results store (the data bus the
  // gallery and §7.2 strategy selector read), not discarded. refs #334, #369.
  const recordPhase = useSurveyResultsStore((s) => s.recordPhase);
  const resetSurvey = useSurveyResultsStore((s) => s.reset);

  // Identity-lite is the hybrid flow's head: it captures the language + the
  // INDEPENDENT target script, deriving the routing/A2 prefill. Gated scripts
  // (Ethi/Hani/Hang) end on the "not supported" stage. refs #369, spec §8/§9.
  function handleIdentityComplete(result: SurveyPhaseResult, identity: IdentityLiteResult) {
    recordPhase(result);
    setIdentityResult(identity);
    setSurveyContext(contextFromIdentity(identity));
    setStage(identity.supported ? "base" : "unsupported");
  }

  // The base chosen in-survey is lifted to the shell so the preview + scaffold
  // spine use it; the chosen (language, script) target then back-fills prefill.
  function handleBaseResolved(base: BaseKeyboard) {
    onBaseSelected(base);
    setStage("prefill");
  }

  function handlePhaseBComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    setStage("F");
  }
  function handlePhaseFComplete(result: SurveyPhaseResult) {
    recordPhase(result);
    setStage("done");
  }
  function handleStartOver() {
    resetSurvey();
    setIdentityResult(null);
    setSurveyContext({});
    setStage("identity");
  }

  // The (language, script) target for base suggestion — keyed on the CHOSEN
  // script (decoupled from the language; spec §8/§9). Language-aware ranking is
  // opt-in via a phonebook map, not yet wired (no ISO code captured here).
  const suggestTarget: SuggestTarget | null =
    identityResult !== null ? { script: identityResult.prefill.script } : null;

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
        All survey phases have been completed. Your answers are saved to the
        survey-results store; the gallery and strategy selector read from there.
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

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "#0d1117",
        overflow: "hidden",
      }}
    >
      {/* Left pane: survey questions */}
      <section aria-label="Survey questions" style={questionsPaneStyle}>
        {stage === "done" && donePaneContent}
        {stage === "identity" && (
          <IdentityLite context={surveyContext} onComplete={handleIdentityComplete} />
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
        {stage === "prefill" && identityResult !== null && baseKeyboard !== null && (
          <Prefill
            identity={identityResult}
            base={baseKeyboard}
            onConfirm={() => setStage("B")}
            onBack={() => setStage("base")}
          />
        )}
        {stage === "B" && (
          <PhaseB
            context={surveyContext}
            onComplete={handlePhaseBComplete}
            onBack={() => setStage("prefill")}
          />
        )}
        {stage === "F" && (
          <PhaseF
            context={surveyContext}
            onComplete={handlePhaseFComplete}
            onBack={() => setStage("B")}
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
        {baseKeyboard === null ? (
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
            <span style={{ fontSize: 32, opacity: 0.4 }}>⌨</span>
            <span>
              Select a base keyboard on the{" "}
              <a href="#pick-base" style={{ color: "#6ea8fe", textDecoration: "none" }}>
                Pick Base
              </a>{" "}
              tab to see a live preview here.
            </span>
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
                {baseKeyboard.displayName}
              </h2>
              <OskModeToggle value={oskMode} onChange={setOskMode} />
            </div>
            <OSKFrame
              baseKeyboard={baseKeyboard}
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
  const [selectedBaseKeyboard, setSelectedBaseKeyboard] = useState<BaseKeyboard | null>(null);
  const handleBaseKeyboardSelected = useCallback((kb: BaseKeyboard) => {
    setSelectedBaseKeyboard(kb);
  }, []);

  let content: ReactNode;
  switch (route) {
    case "pick-base":
      content = <PreviewShell onBaseKeyboardSelected={handleBaseKeyboardSelected} />;
      break;
    case "survey":
      content = (
        <SurveyView
          baseKeyboard={selectedBaseKeyboard}
          onBaseSelected={handleBaseKeyboardSelected}
        />
      );
      break;
    case "gallery":
      content = <CarveGallery />;
      break;
    case "preview":
      content = <RoutePlaceholder title="Preview" />;
      break;
    case "output":
      content = <RoutePlaceholder title="Output" />;
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
        background: "#0d1117",
      }}
    >
      <NavBar active={route} />
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {content}
      </div>
    </div>
  );
}
