// Two-pane preview shell — picker left, live OSK right.
//
// [SCAFFOLD] Left pane: currently a base-keyboard picker only. The full
// survey UI (spec §4 / §8 Phase B) is not yet implemented and will replace
// this pane. The right pane (compile + KMW iframe preview) is the working
// deliverable ported from studio-poc.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, CompilerDiagnostic } from "@keyboard-studio/contracts";
import { useKeyboardArtifact } from "../hooks/useKeyboardArtifact.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { OSKFrame } from "./OSKFrame.tsx";

// [TEMP] Per-fixture typing hints. Hardcoded until the Pattern schema's
// `tests` field (spec §5) is wired into the UI to drive these automatically.
const TRY_HINTS: Record<string, { intro: string; examples: string[] }> = {
  basic_kbdus: {
    intro: "US-English layout — types the same as your physical keyboard.",
    examples: ["a -> a", "Shift+a -> A", "1 -> 1"],
  },
  sil_euro_latin: {
    intro: "Diacritics via a leading punctuation deadkey.",
    examples: [
      "' then a -> a-acute",
      "` then e -> e-grave",
      "~ then n -> n-tilde",
      "^ then o -> o-circumflex",
      "\" then u -> u-umlaut",
    ],
  },
  sil_devanagari_phonetic: {
    intro: "Romanised phonetic input for Devanagari.",
    examples: ["a -> base vowel", "k -> ka consonant", "i -> i vowel"],
  },
};

// ---------------------------------------------------------------------------
// Severity label colours — Layer A: error (red), warning (yellow), hint/info
// (blue). Matches the editor-gutter colour contract in the agent profile.
// ---------------------------------------------------------------------------
const SEVERITY_COLOR: Record<string, string> = {
  fatal: "#f0a0a0",
  error: "#f0a0a0",
  warning: "#d29922",
  hint: "#6ea8fe",
  info: "#6ea8fe",
};

function DiagnosticsPanel({ diagnostics }: { diagnostics: CompilerDiagnostic[] }) {
  if (diagnostics.length === 0) {
    return (
      <div
        aria-live="polite"
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "#161b22",
          border: "1px solid #283040",
          borderRadius: 8,
          fontSize: 12,
          color: "#7ee787",
          fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
        }}
      >
        No compiler diagnostics.
      </div>
    );
  }
  return (
    <div
      aria-label="Compiler diagnostics"
      aria-live="polite"
      style={{
        marginTop: 12,
        padding: "10px 14px",
        background: "#161b22",
        border: "1px solid #283040",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9aa7b8",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Compiler diagnostics ({diagnostics.length})
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
        role="list"
      >
        {diagnostics.map((d, i) => (
          <li
            key={`${d.severity}:${d.code ?? i}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
              lineHeight: 1.5,
            }}
          >
            <span
              aria-label={`Severity: ${d.severity}`}
              style={{
                color: SEVERITY_COLOR[d.severity] ?? "#e6edf3",
                minWidth: 50,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              [{d.severity.toUpperCase()}]
            </span>
            <span style={{ color: "#e6edf3" }}>
              {d.location !== undefined
                ? `${d.location.file}:${d.location.line} — `
                : ""}
              {d.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetadataCard({ kb }: { kb: BaseKeyboard }) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <span style={{ color: "#9aa7b8", minWidth: 90 }}>{k}</span>
      <span
        style={{
          color: "#e6edf3",
          fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
        }}
      >
        {v}
      </span>
    </div>
  );
  const hint = TRY_HINTS[kb.id];
  return (
    <>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: "#161b22",
          border: "1px solid #283040",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#7ee787",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Selected keyboard
        </div>
        <Row k="id" v={kb.id} />
        <Row k="name" v={kb.displayName} />
        <Row k="path" v={kb.path} />
        <Row k="script" v={kb.script} />
        <Row k="version" v={kb.version} />
        <Row k="targets" v={kb.targets.join(", ")} />
        {kb.packageId !== undefined ? <Row k="packageId" v={kb.packageId} /> : null}
      </div>

      {hint && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: "#161b22",
            border: "1px solid #283040",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#d2a8ff",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Try typing
          </div>
          <div style={{ fontSize: 13, color: "#9aa7b8", marginBottom: 8 }}>
            {hint.intro}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "#e6edf3",
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            }}
          >
            {hint.examples.map((ex) => (
              <li key={ex}>{ex}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

const DIVIDER_WIDTH = 6;
const LEFT_MIN_PCT = 20;
const LEFT_MAX_PCT = 70;
const LEFT_INIT_PCT = 40;

export function PreviewShell() {
  const [baseKeyboard, setBaseKeyboard] = useState<BaseKeyboard | null>(null);
  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const [leftPct, setLeftPct] = useState(LEFT_INIT_PCT);
  const [handleHovered, setHandleHovered] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Track drag state in a ref so pointer-move handlers always see current values
  // without triggering re-renders on every pixel.
  const dragRef = useRef<{ startX: number; startPct: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startPct: leftPct };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
  // leftPct captured via dragRef; no lint dep needed for the document listeners
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftPct]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (dragRef.current === null || containerRef.current === null) return;
    const containerW = containerRef.current.getBoundingClientRect().width;
    if (containerW === 0) return;
    const deltaPct = ((e.clientX - dragRef.current.startX) / containerW) * 100;
    const next = Math.min(
      LEFT_MAX_PCT,
      Math.max(LEFT_MIN_PCT, dragRef.current.startPct + deltaPct),
    );
    setLeftPct(next);
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
  }, [onPointerMove]);

  // Clean up listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  const rightPct = 100 - leftPct;

  // Lifted from OSKFrame so DiagnosticsPanel and the download button can
  // read stage (and the embedded VFS) without prop-drilling through the iframe.
  const { stage, retry } = useKeyboardArtifact(baseKeyboard);

  const diagnostics =
    stage.kind === "ready"
      ? stage.compileResult.diagnostics
      : stage.kind === "error" && stage.compileResult !== undefined
        ? stage.compileResult.diagnostics
        : [];

  const canDownload = stage.kind === "ready";

  async function handleDownload() {
    if (stage.kind !== "ready" || baseKeyboard === null) return;
    setDownloading(true);
    try {
      // The VFS must be re-fetched from the hook; useKeyboardArtifact does not
      // currently surface the VFS object in Stage.ready. As a day-4 interim,
      // we download the compiled .js artifact blob directly via its existing
      // blob URL. A full VFS-serializing zip lands when useKeyboardArtifact
      // is extended to surface the VFS (tracked in the issue backlog).
      // [LIMITATION] This downloads only the compiled JS artifact, not the
      // full source + artifacts zip that toZip would produce.
      const jsUrl = stage.jsBlobUrl;
      if (jsUrl) {
        const resp = await fetch(jsUrl);
        const bytes = await resp.arrayBuffer();
        const blob = new Blob([bytes], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        try {
          const a = document.createElement("a");
          a.href = url;
          a.download = `${baseKeyboard.id}.js`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Left pane: picker-only until survey UI lands */}
      <section
        aria-label="Picker pane"
        style={{
          flexBasis: `calc(${leftPct}% - ${DIVIDER_WIDTH / 2}px)`,
          flexShrink: 0,
          flexGrow: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
          Keyboard Studio
        </h1>
        <p style={{ margin: 0, color: "#9aa7b8", fontSize: 13 }}>
          Pick a base keyboard; the right pane compiles its source and renders
          the live preview.
        </p>
        <div style={{ marginTop: 8 }}>
          <BaseKeyboardPicker value={baseKeyboard} onChange={setBaseKeyboard} />
        </div>
        {baseKeyboard !== null ? <MetadataCard kb={baseKeyboard} /> : null}
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
          width: DIVIDER_WIDTH,
          flexShrink: 0,
          background: handleHovered ? "#3d5070" : "#283040",
          cursor: "col-resize",
          userSelect: "none",
          transition: "background 120ms ease",
        }}
      />

      {/* Right pane: live OSK preview */}
      <section
        aria-label="Preview pane"
        style={{
          flexBasis: `calc(${rightPct}% - ${DIVIDER_WIDTH / 2}px)`,
          flexGrow: 1,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
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
            Live preview
          </h2>
          <OskModeToggle value={oskMode} onChange={setOskMode} />
        </div>
        <OSKFrame
          baseKeyboard={baseKeyboard}
          oskMode={oskMode}
          stage={stage}
          retry={retry}
        />
        {baseKeyboard !== null && (
          <>
            <button
              type="button"
              disabled={!canDownload || downloading}
              onClick={() => { void handleDownload(); }}
              aria-label={
                canDownload
                  ? `Download compiled keyboard ${baseKeyboard.id}`
                  : "Download unavailable until compile completes"
              }
              style={{
                alignSelf: "flex-start",
                marginTop: 4,
                padding: "7px 16px",
                background: canDownload && !downloading ? "#1f6feb" : "#161b22",
                color: canDownload && !downloading ? "#e6edf3" : "#484f58",
                border: "1px solid #283040",
                borderRadius: 6,
                fontSize: 13,
                cursor: canDownload && !downloading ? "pointer" : "not-allowed",
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                transition: "background 0.15s",
              }}
            >
              {downloading ? "Downloading..." : "Download .js"}
            </button>
            <DiagnosticsPanel diagnostics={diagnostics} />
          </>
        )}
      </section>
    </div>
  );
}
