// LdmlDownloadPanel: the third download, an LDML keyboard export (spec 108 FR-002, FR-027).
//
// Not shown on the .kmp or pull-request paths. It shares the Output screen's one gate
// (`outputBlockers`) with the other two downloads: the parent passes the first blocker's
// aria-label when gated, and a refused emission is explained here, never silently disabled.
// The profile and base-keyboard choices are the author's, persisted in the working copy.

import { useEffect, useId, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { LintFinding } from "@keyboard-studio/contracts";
import type { LdmlProfileId, TargetProfile } from "@keyboard-studio/engine";
import { LintSummary } from "../../lint/LintSummary.tsx";
import { LdmlCompilePanel } from "./LdmlCompilePanel.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { usePickedWindowsLayouts, getLayoutFamilyAnswer } from "../../lib/layoutFamily.ts";
import { resolveLdmlBaseLayout } from "../../lib/ldmlBaseLayout.ts";
import { getListLdmlProfiles } from "../../lib/services.ts";
import type { BaseLayoutId } from "../../lib/referenceBaseLayouts.ts";

export interface LdmlDownloadPanelProps {
  /** The OUTPUT keyboard id, from `resolveOutputKeyboardId`: the same id the file name carries. */
  keyboardId: string;
  /** The shared gate is closed: the first blocker's aria-label. Null when open. */
  gatedAriaLabel: string | null;
  /** The `.kmp` or `.zip` download is in flight. */
  otherBusy: boolean;
  downloading: boolean;
  error: string | null;
  onDownload: () => void;
  /** Every LDML finding, whatever its owner step (spec 108 FR-015); listed grouped by code. */
  findings?: readonly LintFinding[];
}

const SELECT_STYLE: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "4px 8px",
  fontSize: 13,
  fontFamily: "inherit",
  maxWidth: "46ch",
};

const LABEL_STYLE: React.CSSProperties = { fontSize: 12, color: "var(--app-text-subtle)" };

export function LdmlDownloadPanel(props: LdmlDownloadPanelProps) {
  const { keyboardId, gatedAriaLabel, otherBusy, downloading, error, onDownload, findings = [] } = props;
  const { t } = useLingui();
  const profileSelectId = useId();
  const baseSelectId = useId();
  const findingsHeadingId = useId();

  const ldmlProfile = useWorkingCopyStore((s) => s.ldmlProfile);
  const setLdmlProfile = useWorkingCopyStore((s) => s.setLdmlProfile);
  const ldmlBaseLayout = useWorkingCopyStore((s) => s.ldmlBaseLayout);
  const setLdmlBaseLayout = useWorkingCopyStore((s) => s.setLdmlBaseLayout);
  const bcp47 = useWorkingCopyStore((s) => s.identity?.bcp47);
  const ansiOnly = useWorkingCopyStore((s) => (s.ir ?? s.startIr)?.header.encoding === "ANSI");
  const picks = usePickedWindowsLayouts();

  // The profile list lives in the lazily imported engine chunk, so it arrives asynchronously.
  const [profiles, setProfiles] = useState<readonly TargetProfile[] | null>(null);
  useEffect(() => {
    let live = true;
    getListLdmlProfiles()
      .then((list) => {
        if (live) setProfiles(list());
      })
      .catch(() => {
        // Without the real engine there is nothing to export; the panel stays hidden.
      });
    return () => {
      live = false;
    };
  }, []);

  if (profiles === null) return null;

  const defaultProfile = profiles.find((p) => p.isDefault)?.id;
  const selectedProfile: LdmlProfileId | undefined = ldmlProfile ?? defaultProfile;

  const base = resolveLdmlBaseLayout({
    windowsLayoutPicks: picks,
    layoutFamily: getLayoutFamilyAnswer() ?? null,
    bcp47: bcp47 !== undefined && bcp47 !== "" ? [bcp47] : [],
    override: ldmlBaseLayout,
  });
  const defaultLabel = base.defaultChoice.label;
  const defaultSourceText = (label: string): string => {
    if (base.defaultChoice.source === "primary-pick") {
      return t({
        id: "output.download.ldml.base.default.primaryPick",
        message: `${label} (default, your chosen layout)`,
      });
    }
    if (base.defaultChoice.source === "likely-base") {
      return t({
        id: "output.download.ldml.base.default.likelyBase",
        message: `${label} (default, likely for your language)`,
      });
    }
    return t({
      id: "output.download.ldml.base.default.enUs",
      message: `${label} (default, English US fallback)`,
    });
  };

  const baseBlocked = base.chosen === null;
  const baseUnavailableText = t({
    id: "output.download.ldml.base.unavailable",
    message: `The default base keyboard, ${defaultLabel}, has no reference data for the LDML export. Pick another base keyboard to enable the download.`,
  });
  const ansiText = t({
    id: "output.download.ldml.ansiOnly",
    message: "This keyboard is ANSI-only and LDML has no ANSI mode, so it cannot be exported.",
  });

  const actionable = gatedAriaLabel === null && !ansiOnly && !baseBlocked && !downloading && !otherBusy;
  const ariaLabel =
    gatedAriaLabel !== null
      ? gatedAriaLabel
      : ansiOnly
        ? ansiText
        : baseBlocked
          ? baseUnavailableText
          : t({ id: "output.download.ldml.aria.ready", message: `Download LDML for keyboard ${keyboardId}` });

  const defaultHost: string | undefined = base.defaultChoice.available ? base.defaultChoice.id : undefined;
  const baseValue = ldmlBaseLayout ?? (base.defaultChoice.available ? base.defaultChoice.id : "");

  return (
    <section
      aria-label={t({ id: "output.download.ldml.region", message: "LDML export" })}
      data-testid="ldml-download-panel"
      style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}
    >
      <label htmlFor={profileSelectId} style={LABEL_STYLE}>
        <Trans id="output.download.ldml.profile.label">LDML version</Trans>
      </label>
      <select
        id={profileSelectId}
        data-testid="ldml-profile-select"
        value={selectedProfile ?? ""}
        onChange={(e) => setLdmlProfile(e.target.value as LdmlProfileId)}
        style={SELECT_STYLE}
      >
        {profiles.map((p) => {
          const version = p.id;
          const compat = p.keymanCompilable
            ? t({ id: "output.download.ldml.profile.compilable", message: "Keyman compiles it" })
            : t({ id: "output.download.ldml.profile.tr35Only", message: "TR35-only (awaiting Keyman)" });
          return (
            <option key={p.id} value={p.id}>
              {t({ id: "output.download.ldml.profile.option", message: `LDML ${version} (${compat})` })}
            </option>
          );
        })}
      </select>

      <label htmlFor={baseSelectId} style={LABEL_STYLE}>
        <Trans id="output.download.ldml.base.label">Base keyboard for the export</Trans>
      </label>
      <select
        id={baseSelectId}
        data-testid="ldml-base-select"
        value={baseValue}
        onChange={(e) => setLdmlBaseLayout(e.target.value as BaseLayoutId)}
        style={SELECT_STYLE}
      >
        {!base.defaultChoice.available && ldmlBaseLayout === null && (
          <option value="" disabled>
            {t({
              id: "output.download.ldml.base.default.unavailable",
              message: `${defaultLabel} (default, unavailable)`,
            })}
          </option>
        )}
        {base.options.map((o) => {
          const label = o.label;
          return (
            <option key={o.id} value={o.id}>
              {o.id === defaultHost
                ? defaultSourceText(label)
                : t({ id: "output.download.ldml.base.option", message: `${label}` })}
            </option>
          );
        })}
      </select>
      {baseBlocked && (
        <p
          role="status"
          data-testid="ldml-base-unavailable"
          style={{ margin: 0, fontSize: 12, color: "var(--app-danger-text)" }}
        >
          {baseUnavailableText}
        </p>
      )}
      {ansiOnly && (
        <p
          role="status"
          data-testid="ldml-ansi-only"
          style={{ margin: 0, fontSize: 12, color: "var(--app-danger-text)" }}
        >
          {ansiText}
        </p>
      )}

      <button
        type="button"
        data-testid="emit-download-ldml"
        disabled={!actionable}
        onClick={onDownload}
        aria-label={ariaLabel}
        style={{
          alignSelf: "flex-start",
          padding: "6px 14px",
          background: "transparent",
          color: actionable ? "var(--app-text-subtle)" : "var(--app-text-disabled)",
          border: "1px solid var(--app-border)",
          borderRadius: 6,
          fontSize: 12,
          cursor: actionable ? "pointer" : "not-allowed",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {downloading ? (
          <Trans id="output.download.ldml.downloading">Exporting...</Trans>
        ) : (
          <Trans id="output.download.ldml.button">Download LDML</Trans>
        )}
      </button>
      <p style={{ margin: 0, fontSize: 12, color: "var(--app-text-muted)", lineHeight: 1.5, maxWidth: "46ch" }}>
        <Trans id="output.download.ldml.help">
          An LDML (CLDR keyboard) export of this keyboard for use outside Keyman. It is a separate
          download: the installable package and the source .zip are not affected, and the zip
          includes a report of what could not be carried over.
        </Trans>
      </p>
      <LdmlCompilePanel
        profileId={selectedProfile}
        keymanCompilable={profiles.find((p) => p.id === selectedProfile)?.keymanCompilable ?? false}
        enabled={gatedAriaLabel === null && !ansiOnly && !baseBlocked && !otherBusy && !downloading}
      />
      {findings.length > 0 && (
        <section
          aria-labelledby={findingsHeadingId}
          data-testid="ldml-findings"
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <h4 id={findingsHeadingId} style={{ margin: 0, fontSize: 13 }}>
            <Trans id="output.download.ldml.findings.heading">What LDML does differently</Trans>
          </h4>
          <LintSummary findings={[...findings]} groupByCode />
        </section>
      )}
      {error !== null && (
        <div
          role="alert"
          data-testid="emit-download-ldml-error"
          style={{
            padding: "8px 12px",
            border: "1px solid var(--app-danger)",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--app-danger-text)",
            lineHeight: 1.5,
          }}
        >
          {"[ERROR] "}
          {error}
        </div>
      )}
    </section>
  );
}
