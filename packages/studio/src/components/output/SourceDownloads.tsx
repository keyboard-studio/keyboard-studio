// SourceDownloads — the source .zip and the LDML export, with their errors and
// projection warnings (spec 113, revised after #2540 walk-through).
//
// Shared by Trial and Publish so a tester can take the source or the LDML
// alongside a numbered test build, without walking on to Publish. Both
// downloads sit behind the release gate (`outputBlockers().blocked`), the
// same gate as on Publish; the parent passes the first blocker's aria-label.

import { useMemo } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { usePreviewArtifact } from "../../hooks/usePreviewArtifact.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { isLdmlLintCode } from "../../lint/ldmlFindings.ts";
import { LdmlDownloadPanel } from "./LdmlDownloadPanel.tsx";

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const warningBannerStyle: React.CSSProperties = {
  marginTop: 4,
  padding: "8px 12px",
  background: "var(--app-warning-bg)",
  border: "1px solid var(--app-warning-border)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: FONT,
};

export interface SourceDownloadsProps {
  artifact: ReturnType<typeof usePreviewArtifact>;
  /** The OUTPUT keyboard id (`resolveOutputKeyboardId`), as the file names carry it. */
  keyboardId: string;
  /** The release gate's first blocker aria-label when closed; null when open. */
  gatedAriaLabel: string | null;
}

export function SourceDownloads({ artifact, keyboardId: downloadKeyboardId, gatedAriaLabel }: SourceDownloadsProps) {
  const { t } = useLingui();
  const {
    downloading,
    downloadError,
    downloadWarnings,
    handleDownload,
    buildingKmp,
    downloadingLdml,
    ldmlError,
    handleDownloadLdml,
  } = artifact;

  // spec 108 FR-015: every LDML finding is listed with the LDML download.
  const findings = useWorkingCopyStore((s) => s.validatorFindings);
  const ldmlFindings = useMemo(() => findings.filter((f) => isLdmlLintCode(f.code)), [findings]);

  const zipActionable = gatedAriaLabel === null && !downloading && !buildingKmp && !downloadingLdml;
  const zipAriaLabel =
    gatedAriaLabel ??
    t({ id: "output.download.aria.ready", message: `Download keyboard ${downloadKeyboardId} as zip` });

  return (
    <>
      <button
        type="button"
        data-testid="emit-download"
        disabled={!zipActionable}
        onClick={() => { void handleDownload(); }}
        aria-label={zipAriaLabel}
        style={{
          alignSelf: "flex-start",
          marginTop: 4,
          padding: "9px 18px",
          background: "var(--app-surface)",
          color: zipActionable ? "var(--app-accent-text)" : "var(--app-text-disabled)",
          border: `1px solid ${zipActionable ? "var(--app-accent)" : "var(--app-border)"}`,
          borderRadius: 6,
          fontSize: 14,
          fontWeight: 600,
          cursor: zipActionable ? "pointer" : "not-allowed",
          fontFamily: FONT,
        }}
      >
        {downloading ? (
          <Trans id="output.download.button.downloading">Downloading...</Trans>
        ) : (
          <Trans id="output.download.button.download">Download source .zip</Trans>
        )}
      </button>
      <p
        style={{
          margin: 0,
          fontSize: 12,
          color: "var(--app-text-muted)",
          lineHeight: 1.5,
          maxWidth: "46ch",
        }}
      >
        <Trans id="output.download.zip.help">
          The keyboard&apos;s source files, for editing in Keyman Developer or
          contributing upstream.
        </Trans>
      </p>
      {/* spec 108 FR-002: the LDML export, behind the same gate. */}
      <LdmlDownloadPanel
        keyboardId={downloadKeyboardId}
        gatedAriaLabel={gatedAriaLabel}
        otherBusy={buildingKmp || downloading}
        downloading={downloadingLdml}
        error={ldmlError}
        onDownload={() => { void handleDownloadLdml(); }}
        findings={ldmlFindings}
      />
      {downloadError !== null && (
        <div role="alert" style={{ fontSize: 11, color: "var(--app-danger-text)", marginTop: 4 }}>
          {downloadError}
        </div>
      )}
      {downloadWarnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          aria-label={t({
            id: "output.download.warnings.ariaLabel",
            message: "Download projection warnings",
          })}
          style={warningBannerStyle}
        >
          <div style={{ color: "var(--app-warning-text)", fontWeight: 600, marginBottom: 4 }}>
            {"[WARN] "}
            <Trans id="output.download.warnings.header">Download completed with warnings:</Trans>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, color: "var(--app-warning-text)", lineHeight: 1.6 }}>
            {downloadWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
