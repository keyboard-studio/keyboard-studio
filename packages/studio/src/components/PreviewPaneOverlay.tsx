// Stage-driven overlay above the iframe — never hides the iframe (KMW
// context is expensive to reinitialise), only sets aria-busy and shows a
// transient message. Mirrors the Stage union from useKeyboardArtifact.

import { Trans, useLingui } from "@lingui/react/macro";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import {
  plainDiagnosticMessage,
  plainEngineErrorMessage,
} from "../lib/plainDiagnosticMessage.ts";

export interface PreviewPaneOverlayProps {
  stage: Stage;
  onRetry: () => void;
}

interface PlainStageError {
  whatHappened: string;
  whatToTry: string;
  technicalDetail: string;
}

function plainStageError(
  stage: Extract<Stage, { kind: "error" }>,
  i18n: Parameters<typeof plainDiagnosticMessage>[1],
): PlainStageError {
  if (stage.step === "compile") {
    const top = stage.compileResult?.diagnostics?.[0];
    const plain =
      top !== undefined
        ? plainDiagnosticMessage(top, i18n)
        : plainDiagnosticMessage(
            { code: "KM_ERROR_UNKNOWN", severity: "error", layer: "A", message: stage.message },
            i18n,
          );
    return plain;
  }
  return plainEngineErrorMessage(stage.message, i18n);
}

export function PreviewPaneOverlay({ stage, onRetry }: PreviewPaneOverlayProps) {
  const { t, i18n } = useLingui();
  if (stage.kind === "idle" || stage.kind === "ready") return null;

  let title: string;
  let detail: string | null = null;
  let technicalDetail: string | null = null;
  let showRetry = false;
  let isError = false;

  switch (stage.kind) {
    case "fetching":
      title = t({ id: "preview.overlay.fetching.title", message: "Loading your keyboard..." });
      detail = t({
        id: "preview.overlay.fetching.detail",
        message: "Getting the files that describe your keyboard...",
      });
      break;
    case "vfs-loading":
      title = t({
        id: "preview.overlay.vfsLoading.title",
        message: "Getting your keyboard ready...",
      });
      break;
    case "compiling":
      title = t({ id: "preview.overlay.compiling.title", message: "Building your keyboard..." });
      detail = stage.isWarmCompile
        ? null
        : t({
            id: "preview.overlay.compilingCold.detail",
            message: "The first build takes a little longer.",
          });
      break;
    case "error":
      isError = true;
      showRetry = true;
      {
        const plain = plainStageError(stage, i18n);
        technicalDetail = plain.technicalDetail;
        if (stage.step === "fetch") {
          title = t({
            id: "preview.overlay.error.fetch.title",
            message: "Could not load your keyboard",
          });
          detail = plain.whatToTry;
        } else if (stage.step === "compile") {
          title = plain.whatHappened;
          detail = plain.whatToTry;
        } else {
          title = t({
            id: "preview.overlay.error.vfs.title",
            message: "Your keyboard couldn't be loaded",
          });
          detail = plain.whatToTry;
        }
      }
      break;
  }

  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        background: "color-mix(in srgb, var(--app-bg) 92%, transparent)",
        color: "var(--app-text)",
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
          // Type-scale headline role: weight + size + leading + tracking
          // as one set, replacing the ad-hoc 16px/600 pair.
          font: "var(--app-type-headline)",
          letterSpacing: "var(--app-tracking-headline)",
          color: isError ? "var(--app-warning-text)" : "var(--app-accent-text)",
        }}
      >
        {title}
      </div>
      {detail !== null && (
        <div
          style={{
            fontSize: 12,
            color: "var(--app-text-subtle)",
            maxWidth: 480,
          }}
        >
          {detail}
        </div>
      )}
      {technicalDetail !== null && (
        <details style={{ fontSize: 12, color: "var(--app-text-subtle)", maxWidth: 480 }}>
          <summary style={{ cursor: "pointer" }}>
            <Trans id="diagnostics.plain.technicalDetails">Technical details</Trans>
          </summary>
          <div
            style={{
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
              marginTop: 6,
              overflowWrap: "anywhere",
            }}
          >
            {technicalDetail}
          </div>
        </details>
      )}
      {showRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid var(--app-accent)",
            background: "color-mix(in srgb, var(--app-accent) 18%, transparent)",
            color: "var(--app-accent-text)",
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
