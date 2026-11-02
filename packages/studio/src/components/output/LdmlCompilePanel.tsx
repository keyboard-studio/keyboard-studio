// LdmlCompilePanel: the author-initiated Keyman compile check and the installable LDML package
// (spec 108 Story 5, FR-072, FR-073, FR-074).
//
// The compile runs only on the click: no effect, no timer, never in the validation cycle (D3,
// Art IV). The result region is live because the click's own result fills it. Compiled artifacts
// are staged on clones inside `buildLdmlKmpForDownload`, never in the shared projection.

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { LdmlProfileId } from "@keyboard-studio/engine";
import { buildLdmlKmpForDownload, type LdmlCompileOutcome } from "../../lib/buildOutputBundle.ts";

export interface LdmlCompilePanelProps {
  /** The selected profile; undefined until the profile list has loaded. */
  profileId: LdmlProfileId | undefined;
  /** `TargetProfile.keymanCompilable` for the selected profile (FR-073). */
  keymanCompilable: boolean;
  /** The shared gate, the ANSI refusal and the base-keyboard check are all open. */
  enabled: boolean;
}

type CheckState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "done"; compile: LdmlCompileOutcome; kmp: { bytes: Uint8Array; filename: string } | null }
  | { kind: "failed"; message: string };

const BUTTON_STYLE: React.CSSProperties = {
  alignSelf: "flex-start",
  padding: "6px 14px",
  background: "transparent",
  border: "1px solid var(--app-border)",
  borderRadius: 6,
  fontSize: 12,
  fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const NOTE_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "var(--app-text-muted)",
  lineHeight: 1.5,
  maxWidth: "46ch",
};

/** Hands bytes to the browser as a file download, on the click that asked for them. */
function saveBytes(bytes: Uint8Array, filename: string): void {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buf], { type: "application/octet-stream" }));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LdmlCompilePanel(props: LdmlCompilePanelProps) {
  const { profileId, keymanCompilable, enabled } = props;
  const { t } = useLingui();
  const [state, setState] = useState<CheckState>({ kind: "idle" });

  const compilable = keymanCompilable && profileId !== undefined;
  const checking = state.kind === "checking";
  const actionable = compilable && enabled && !checking;
  const disabledReason = t({
    id: "output.download.ldml.compile.disabled",
    message:
      "TR35-only (awaiting Keyman): Keyman's compiler does not accept this LDML version yet, so it cannot be checked or packaged.",
  });

  const onCheck = async (): Promise<void> => {
    if (!actionable || profileId === undefined) return;
    setState({ kind: "checking" });
    try {
      const result = await buildLdmlKmpForDownload(profileId);
      setState({
        kind: "done",
        compile: result.compile,
        kmp: result.kmp === undefined ? null : { bytes: result.kmp.bytes, filename: result.kmp.filename },
      });
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : "unknown error";
      setState({
        kind: "failed",
        message: t({
          id: "output.download.ldml.compile.failed",
          message: `Keyman's compiler could not run: ${reason} The source download still works.`,
        }),
      });
    }
  };

  const done = state.kind === "done" ? state : null;
  const compilerVersion = done?.compile.versions.compiler ?? "";
  const kmxVersion = formatKmxVersion(done?.compile.versions.kmxPlus ?? 0);
  const errorCount =done === null ? 0 : done.compile.expected.length + done.compile.unexpected.length;

  return (
    <section
      aria-label={t({ id: "output.download.ldml.compile.region", message: "Keyman compile check" })}
      data-testid="ldml-compile-panel"
      style={{ display: "flex", flexDirection: "column", gap: 6 }}
    >
      <button
        type="button"
        data-testid="ldml-compile-check"
        disabled={!actionable}
        onClick={() => {
          void onCheck();
        }}
        aria-label={compilable ? undefined : disabledReason}
        style={{
          ...BUTTON_STYLE,
          color: actionable ? "var(--app-text-subtle)" : "var(--app-text-disabled)",
          cursor: actionable ? "pointer" : "not-allowed",
        }}
      >
        {checking
          ? t({ id: "output.download.ldml.compile.checking", message: "Checking..." })
          : t({ id: "output.download.ldml.compile.check", message: "Check with Keyman's compiler" })}
      </button>
      {!compilable && (
        <p data-testid="ldml-compile-disabled-reason" style={NOTE_STYLE}>
          {disabledReason}
        </p>
      )}

      <div role="status" aria-live="polite" data-testid="ldml-compile-result" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {state.kind === "failed" && (
          <p data-testid="ldml-compile-failed" style={{ ...NOTE_STYLE, color: "var(--app-danger-text)" }}>
            {"[ERROR] "}
            {state.message}
          </p>
        )}
        {done !== null && (
          <>
            {errorCount === 0 && (
              <p data-testid="ldml-compile-clean" style={NOTE_STYLE}>
                {t({ id: "output.download.ldml.compile.clean", message: "Keyman's compiler found no errors." })}
              </p>
            )}
            {done.compile.expected.length > 0 && (
              <div data-testid="ldml-compile-known">
                <h5 style={{ margin: 0, fontSize: 12 }}>
                  {t({ id: "output.download.ldml.compile.known.heading", message: "Known Keyman limitations" })}
                </h5>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
                  {done.compile.expected.map((e, i) => {
                    const code = e.message.code;
                    const text = e.message.text;
                    const row = e.row.id;
                    return (
                      <li key={`${code}-${i}`}>
                        {t({
                          id: "output.download.ldml.compile.known.item",
                          message: `Row ${row}, ${code}: ${text}`,
                        })}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {done.compile.unexpected.length > 0 && (
              <div data-testid="ldml-compile-defects">
                <h5 style={{ margin: 0, fontSize: 12 }}>
                  {t({ id: "output.download.ldml.compile.defects.heading", message: "Exporter defects" })}
                </h5>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 12 }}>
                  {done.compile.unexpected.map((m, i) => {
                    const code = m.code;
                    const text = m.text;
                    return (
                      <li key={`${code}-${i}`}>
                        {t({ id: "output.download.ldml.compile.defects.item", message: `${code}: ${text}` })}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <p data-testid="ldml-compile-versions" style={NOTE_STYLE}>
              {t({
                id: "output.download.ldml.compile.versions",
                message: `Keyman compiler ${compilerVersion}, KMX+ file version ${kmxVersion}.`,
              })}
            </p>
            {done.kmp !== null ? (
              <>
                <button
                  type="button"
                  data-testid="ldml-kmp-download"
                  onClick={() => saveBytes(done.kmp!.bytes, done.kmp!.filename)}
                  style={{ ...BUTTON_STYLE, color: "var(--app-text-subtle)", cursor: "pointer" }}
                >
                  {t({ id: "output.download.ldml.compile.package", message: "Download LDML .kmp" })}
                </button>
                <p data-testid="ldml-kmp-desktop-note" style={NOTE_STYLE}>
                  {t({
                    id: "output.download.ldml.compile.desktopNote",
                    message:
                      "This package works on desktop only until Keyman can load LDML keyboards on web and mobile.",
                  })}
                </p>
              </>
            ) : (
              <p data-testid="ldml-compile-no-package" style={NOTE_STYLE}>
                {t({
                  id: "output.download.ldml.compile.noPackage",
                  message:
                    "No installable package is offered while Keyman reports errors. The source download is unaffected.",
                })}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** `0x1100` is KMX file version 17.0: major in the high byte, minor in the low byte. */
function formatKmxVersion(v: number): string {
  return v === 0 ? "unknown" : `${v >> 8}.${v & 0xff}`;
}
