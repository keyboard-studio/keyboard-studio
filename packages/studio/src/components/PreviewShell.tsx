// Two-pane preview shell — picker left, live OSK right.
//
// [SCAFFOLD] Left pane: currently a base-keyboard picker only. The full
// survey UI (spec §4 / §8 Phase B) is not yet implemented and will replace
// this pane. The right pane (compile + KMW iframe preview) is the working
// deliverable ported from studio-poc.

import { useCallback, useEffect, useRef, useState } from "react";
import type { BaseKeyboard, CompilerDiagnostic } from "@keyboard-studio/contracts";
import { useKeyboardArtifact, type ScaffoldSpec, type OnInstantiateCallback } from "../hooks/useKeyboardArtifact.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { OSKFrame } from "./OSKFrame.tsx";
import { ScaffoldForm } from "./ScaffoldForm.tsx";
import { KmnEditor } from "./KmnEditor.tsx";
import { TrackOneIdentityPanel } from "./TrackOneIdentityPanel.tsx";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { instantiateFromBaseIfConfirmed } from "../lib/confirmRebase.ts";
import { useWorkingCopyTransform } from "../hooks/useWorkingCopyTransform.ts";
import { serializeWorkingCopy } from "../lib/serializeWorkingCopy.ts";

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

type PickerMode = "open" | "scaffold";

export function PreviewShell() {
  const [baseKeyboard, setBaseKeyboard] = useState<BaseKeyboard | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>("open");
  const [scaffoldSpec, setScaffoldSpec] = useState<ScaffoldSpec | null>(null);

  const handleBaseKeyboardChange = useCallback(
    (kb: BaseKeyboard | null) => {
      setBaseKeyboard(kb);
      // When switching base, clear any active scaffold spec so we don't
      // carry a stale new-keyboard identity into the open-base path.
      if (pickerMode === "open") {
        setScaffoldSpec(null);
      }
    },
    [pickerMode]
  );

  const handlePickerModeChange = useCallback((mode: PickerMode) => {
    setPickerMode(mode);
    // Clear scaffold spec when returning to open mode.
    if (mode === "open") {
      setScaffoldSpec(null);
    }
  }, []);

  const [oskMode, setOskMode] = useState<OskMode>("desktop");
  const [leftPct, setLeftPct] = useState(LEFT_INIT_PCT);
  const [handleHovered, setHandleHovered] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadWarnings, setDownloadWarnings] = useState<string[]>([]);
  const zipBlobUrlRef = useRef<string | null>(null);

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

  // Clean up any lingering zip blob URL on unmount.
  useEffect(() => {
    return () => {
      if (zipBlobUrlRef.current !== null) {
        URL.revokeObjectURL(zipBlobUrlRef.current);
        zipBlobUrlRef.current = null;
      }
    };
  }, []);

  const rightPct = 100 - leftPct;

  // onInstantiate: explicit working-copy instantiation (spec §8 v1.3.0, Track 1).
  // Called by useKeyboardArtifact after a full fetch→compile run succeeds.
  // Delegates to instantiateFromBaseIfConfirmed which reads live store state via
  // getState() so the stale-closure problem cannot arise even though this
  // callback is memoised: the async compile may complete long after the render
  // that created this closure. No store selector needed — the helper dispatches
  // instantiateFromBase via getState() directly.
  const onInstantiate = useCallback<OnInstantiateCallback>((base, { vfs, ir }) => {
    instantiateFromBaseIfConfirmed(base, { vfs, ir });
  }, []);

  // Working-copy transform — projects carve + identity layers into the pick-base
  // OSK. No patternMap here (Phase C assignments are managed in the Mechanisms
  // gallery which carries its own patternMap). Returns null when the working copy
  // is not yet instantiated; useKeyboardArtifact treats null as "no transform".
  const workingCopyTransform = useWorkingCopyTransform();

  // Lifted from OSKFrame so DiagnosticsPanel and the download button can
  // read stage (and the embedded VFS) without prop-drilling through the iframe.
  const activeSpec = pickerMode === "scaffold" ? scaffoldSpec : null;
  const { stage, retry, recompile } = useKeyboardArtifact(baseKeyboard, activeSpec, workingCopyTransform, onInstantiate);

  const diagnostics =
    stage.kind === "ready"
      ? stage.compileResult.diagnostics
      : stage.kind === "error" && stage.compileResult !== undefined
        ? stage.compileResult.diagnostics
        : [];

  // Working-copy instantiation state — used for canDownload and the
  // not-instantiated guard in handleDownload.
  const isInstantiated = useWorkingCopyStore((s) => s.baseKeyboard !== null);
  // Identity-unset warning: shown non-blocking when Track 1 author has not
  // set a unique keyboard id (id still equals the base keyboard's id).
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const storeIdentity = useWorkingCopyStore((s) => s.identity);
  const storeBaseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const showIdentityWarn =
    instantiationMode === "new-from-base" &&
    storeBaseKeyboard !== null &&
    (storeIdentity?.keyboardId === undefined ||
      storeIdentity.keyboardId === storeBaseKeyboard.id);

  // canDownload: require the compile to be ready AND the working copy to be
  // instantiated (baseVfs + baseIr available in the store). The serializer
  // builds the zip from the store's baseVfs, not from stage.vfs, so the
  // download contains the full projected working copy including assignments.
  const canDownload = stage.kind === "ready" && isInstantiated;

  const handleDownload = useCallback(async () => {
    // Guard: stage must be ready and the working copy must be instantiated.
    if (stage.kind !== "ready") return;
    setDownloading(true);
    setDownloadError(null);
    setDownloadWarnings([]);
    try {
      // Serialize via the canonical path: projectWorkingCopyVfs (carve +
      // assignments + identity) → toZip. Returns null when the working copy is
      // not instantiated (no baseVfs / baseIr in the store).
      const result = await serializeWorkingCopy();
      if (result === null) {
        setDownloadError("Nothing to download — select a keyboard first.");
        return;
      }

      // Surface any projection warnings to the user (carve safety gate, missing
      // patterns, identity-injection failures). Warn-only: the download still
      // proceeds so the user is not silently blocked.
      if (result.warnings.length > 0) {
        console.warn("[studio] download projection warnings:", result.warnings);
        setDownloadWarnings(result.warnings);
      }

      const { bytes } = result;
      // Coerce to ArrayBuffer to satisfy Blob constructor's strict BlobPart type.
      const buf = bytes.buffer instanceof ArrayBuffer
        ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        : new Uint8Array(bytes).buffer;
      const blob = new Blob([buf], { type: "application/zip" });

      // Revoke previous zip URL before creating a new one.
      if (zipBlobUrlRef.current !== null) {
        URL.revokeObjectURL(zipBlobUrlRef.current);
        zipBlobUrlRef.current = null;
      }

      const url = URL.createObjectURL(blob);
      zipBlobUrlRef.current = url;
      try {
        const a = document.createElement("a");
        a.href = url;
        // Use the keyboardId + release version from the serializer result (derived
        // from the store's baseKeyboard.id and baseIr.header.version) so the filename
        // is always consistent with the content: <id>-<version>.zip.
        const downloadId = result.keyboardId;
        a.download = `${downloadId}-${result.version}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        // Revoke after the click tick so the browser has time to start the download.
        URL.revokeObjectURL(url);
        zipBlobUrlRef.current = null;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  }, [stage]);

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

        {/* Mode toggle: open base vs. scaffold new */}
        <div
          role="group"
          aria-label="Keyboard source mode"
          style={{ display: "flex", gap: 8, marginTop: 4 }}
        >
          <button
            type="button"
            onClick={() => { handlePickerModeChange("open"); }}
            aria-pressed={pickerMode === "open"}
            style={{
              flex: 1,
              padding: "6px 12px",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid #283040",
              background: pickerMode === "open" ? "#1f6feb" : "#161b22",
              color: pickerMode === "open" ? "#e6edf3" : "#9aa7b8",
              transition: "background 0.15s",
            }}
          >
            Open base
          </button>
          <button
            type="button"
            onClick={() => { handlePickerModeChange("scaffold"); }}
            aria-pressed={pickerMode === "scaffold"}
            style={{
              flex: 1,
              padding: "6px 12px",
              fontSize: 12,
              fontFamily: "inherit",
              cursor: "pointer",
              borderRadius: 6,
              border: "1px solid #283040",
              background: pickerMode === "scaffold" ? "#1f6feb" : "#161b22",
              color: pickerMode === "scaffold" ? "#e6edf3" : "#9aa7b8",
              transition: "background 0.15s",
            }}
          >
            New from base
          </button>
        </div>

        <div style={{ marginTop: 8 }}>
          <BaseKeyboardPicker value={baseKeyboard} onChange={handleBaseKeyboardChange} />
        </div>

        {/* Scaffold form — only shown in scaffold mode */}
        {pickerMode === "scaffold" && baseKeyboard !== null && (
          <ScaffoldForm
            onSubmit={(spec) => { setScaffoldSpec(spec); }}
          />
        )}

        {/* Identity panel — Track 1 only (new-from-base). Lets the author
            set the display name (flows to spacebar caption via the identity
            projection layer) and the keyboard id (used as the zip filename). */}
        <TrackOneIdentityPanel />

        {/* KMN editor — shown when a session VFS is available */}
        {stage.kind === "ready" && (
          <KmnEditor vfs={stage.vfs} onRecompile={recompile} />
        )}

        {baseKeyboard !== null && pickerMode === "open" ? <MetadataCard kb={baseKeyboard} /> : null}
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
                  ? `Download keyboard ${pickerMode === "scaffold" && scaffoldSpec !== null ? scaffoldSpec.keyboardId : baseKeyboard.id} as zip`
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
              {downloading ? "Downloading..." : "Download .zip"}
            </button>
            {downloadError !== null && (
              <div role="alert" style={{ fontSize: 11, color: '#f0a0a0', marginTop: 4 }}>
                {downloadError}
              </div>
            )}
            {downloadWarnings.length > 0 && (
              <div
                role="status"
                aria-live="polite"
                aria-label="Download projection warnings"
                style={{
                  marginTop: 4,
                  padding: "8px 12px",
                  background: "#2a1a00",
                  border: "1px solid #d29922",
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                <div style={{ color: "#d29922", fontWeight: 600, marginBottom: 4 }}>
                  [WARN] Download completed with warnings:
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    color: "#d29922",
                    lineHeight: 1.6,
                  }}
                >
                  {downloadWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {showIdentityWarn && (
              <div
                role="status"
                aria-live="polite"
                style={{ fontSize: 12, color: "#d29922", marginTop: 4 }}
              >
                [WARN] Set your keyboard&rsquo;s name and id (left pane) before
                submitting to the community repository.
              </div>
            )}
            <DiagnosticsPanel diagnostics={diagnostics} />
          </>
        )}
      </section>
    </div>
  );
}
