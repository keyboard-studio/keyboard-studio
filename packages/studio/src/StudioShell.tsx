// Studio root — hash-based router + nav bar.
//
// Routes:
//   #pick-base (default)  — base-keyboard picker + live OSK preview
//   #survey               — survey flow (stub; not yet implemented)
//   #gallery              — pattern gallery (stub; not yet implemented)
//   #preview              — compiled preview (stub; not yet implemented)
//   #output               — output / delivery (stub; not yet implemented)

import { useEffect, useState, type ReactNode, type CSSProperties } from "react";
import { PreviewShell } from "./components/PreviewShell.tsx";
import { PhaseA, PhaseB, PhaseF } from "./survey/index.ts";
import type { SurveyContext } from "./survey/types.ts";
// ---------------------------------------------------------------------------
// Route types
// ---------------------------------------------------------------------------

type RouteId = "pick-base" | "survey" | "gallery" | "preview" | "output";

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
// SurveyView — orchestrates Phase A → B → F in sequence
// ---------------------------------------------------------------------------

type SurveyPhase = "A" | "B" | "F" | "done";

function SurveyView() {
  const [phase, setPhase] = useState<SurveyPhase>("A");
  const [surveyContext, setSurveyContext] = useState<SurveyContext>({});

  function handlePhaseAComplete(
    _result: unknown,
    identity: { languageName: string; routingGroup: string; scriptFamily?: string } | undefined,
    _provenance: unknown,
  ) {
    const ctx: SurveyContext = {};
    if (identity !== undefined) {
      ctx["language_name"] = identity.languageName;
      ctx["routing_group"] = identity.routingGroup;
      if (identity.scriptFamily !== undefined) {
        ctx["script_family"] = identity.scriptFamily;
      }
    }
    setSurveyContext(ctx);
    setPhase("B");
  }

  function handlePhaseBComplete(_result: unknown) {
    setPhase("F");
  }

  function handlePhaseFComplete(_result: unknown) {
    setPhase("done");
  }

  function handleStartOver() {
    setSurveyContext({});
    setPhase("A");
  }

  const containerStyle: CSSProperties = {
    padding: 24,
    maxWidth: 720,
    margin: "0 auto",
    overflowY: "auto",
    height: "100%",
    boxSizing: "border-box",
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  };

  if (phase === "done") {
    return (
      <div style={containerStyle}>
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
            All survey phases have been completed. You can proceed to the gallery.
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
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {phase === "A" && (
        <PhaseA
          context={surveyContext}
          onComplete={handlePhaseAComplete}
        />
      )}
      {phase === "B" && (
        <PhaseB
          context={surveyContext}
          onComplete={handlePhaseBComplete}
          onBack={() => setPhase("A")}
        />
      )}
      {phase === "F" && (
        <PhaseF
          context={surveyContext}
          onComplete={handlePhaseFComplete}
          onBack={() => setPhase("B")}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StudioShell — top-level layout: nav bar + route content
// ---------------------------------------------------------------------------

export function StudioShell() {
  const route = useRoute();

  let content: ReactNode;
  switch (route) {
    case "pick-base":
      content = <PreviewShell />;
      break;
    case "survey":
      content = <SurveyView />;
      break;
    case "gallery":
      content = <RoutePlaceholder title="Gallery" />;
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
