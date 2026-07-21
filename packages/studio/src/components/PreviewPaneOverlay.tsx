// Stage-driven overlay above the iframe — never hides the iframe (KMW
// context is expensive to reinitialise), only sets aria-busy and shows a
// transient message. Mirrors the Stage union from useKeyboardArtifact.

import { Trans, useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  if (stage.kind === "idle" || stage.kind === "ready") return null;

  let title: string;
  let detail: string | null = null;
  let showRetry = false;
  let isError = false;

  switch (stage.kind) {
    case "fetching":
      title = t({ id: "preview.overlay.fetching.title", message: "Loading keyboard source..." });
      detail = t({
        id: "preview.overlay.fetching.detail",
        message: "fetching .kmn + siblings via /kbd-proxy",
      });
      break;
    case "vfs-loading":
      title = t({
        id: "preview.overlay.vfsLoading.title",
        message: "Loading into VirtualFS...",
      });
      break;
    case "compiling":
      title = stage.isWarmCompile
        ? t({ id: "preview.overlay.compiling.title", message: "Compiling..." })
        : t({ id: "preview.overlay.compilingCold.title", message: "Compiler warming up..." });
      detail = stage.isWarmCompile
        ? t({
            id: "preview.overlay.compiling.detail",
            message: "kmcmplib running over VFS snapshot",
          })
        : t({
            id: "preview.overlay.compilingCold.detail",
            message: "first call pays the WASM cold-start cost (~1-3s)",
          });
      break;
    case "error":
      isError = true;
      showRetry = true;
      if (stage.step === "fetch") {
        title = t({
          id: "preview.overlay.error.fetch.title",
          message: "Could not fetch keyboard source",
        });
        detail = t({
          id: "preview.overlay.error.fetch.detail",
          message: `${stage.message} — check network or proxy config`,
        });
      } else if (stage.step === "compile") {
        title = t({ id: "preview.overlay.error.compile.title", message: "Compile failed" });
        detail = diagnosticHead(stage);
      } else {
        title = t({ id: "preview.overlay.error.vfs.title", message: "VFS load failed" });
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
          <Trans id="preview.overlay.retry">Retry</Trans>
        </button>
      )}
    </div>
  );
}
