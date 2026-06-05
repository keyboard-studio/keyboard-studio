// Stage-driven overlay above the iframe — never hides the iframe (KMW
// context is expensive to reinitialise), only sets aria-busy and shows a
// transient message. Mirrors the Stage union from useKeyboardArtifact.

import type { Stage } from "../hooks/useKeyboardArtifact.ts";

export interface PreviewPaneOverlayProps {
  stage: Stage;
  onRetry: () => void;
}

function diagnosticHead(stage: Extract<Stage, { kind: "error" }>): string {
  const top = stage.compileResult?.diagnostics?.[0];
  if (top) return `${top.code}: ${top.message}`;
  return stage.message;
}

export function PreviewPaneOverlay({ stage, onRetry }: PreviewPaneOverlayProps) {
  if (stage.kind === "idle" || stage.kind === "ready") return null;

  let title: string;
  let detail: string | null = null;
  let showRetry = false;
  let isError = false;

  switch (stage.kind) {
    case "fetching":
      title = "Loading keyboard source...";
      detail = "fetching .kmn + siblings via /kbd-proxy";
      break;
    case "vfs-loading":
      title = "Loading into VirtualFS...";
      break;
    case "compiling":
      title = stage.isWarmCompile ? "Compiling..." : "Compiler warming up...";
      detail = stage.isWarmCompile
        ? "kmcmplib running over VFS snapshot"
        : "first call pays the WASM cold-start cost (~1-3s)";
      break;
    case "error":
      isError = true;
      showRetry = true;
      if (stage.step === "fetch") {
        title = "Could not fetch keyboard source";
        detail = stage.message + " — check network or proxy config";
      } else if (stage.step === "compile") {
        title = "Compile failed";
        detail = diagnosticHead(stage);
      } else {
        title = "VFS load failed";
        detail = stage.message;
      }
      break;
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(13,17,23,0.92)",
        color: "#e6edf3",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        textAlign: "center",
        borderRadius: 12,
        pointerEvents: isError ? "auto" : "none",
        zIndex: 2,
      }}
    >
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: isError ? "#f0b86e" : "#6ea8fe",
        }}
      >
        {title}
      </div>
      {detail !== null && (
        <div
          style={{
            fontSize: 12,
            color: "#9aa7b8",
            fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            maxWidth: 480,
          }}
        >
          {detail}
        </div>
      )}
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #6ea8fe",
            background: "rgba(110,168,254,0.18)",
            color: "#6ea8fe",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Retry
        </button>
      )}
    </div>
  );
}
