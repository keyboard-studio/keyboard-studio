// Studio root — hash-based router + nav bar.
//
// Routes:
//   #pick-base (default)  — base-keyboard picker + live OSK preview
//   #survey               — survey flow (stub; not yet implemented)
//   #gallery              — pattern gallery (stub; not yet implemented)
//   #preview              — compiled preview (stub; not yet implemented)
//   #output               — output / delivery (stub; not yet implemented)

import { useEffect, useState, type ReactNode } from "react";
import { PreviewShell } from "./components/PreviewShell.tsx";
import { CarveGallery } from "./components/CarveGallery.tsx";
import { type RouteId } from "./lib/navigate.ts";

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
      content = <RoutePlaceholder title="Survey" />;
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
