// Per spec §16 / §9 — render an explicit "not yet supported" stub for
// scripts whose authoring pipeline isn't in v1.0 (CJK + Ethiopic).
// Triggered by isExcludedScript() in OSKFrame.

import { Trans } from "@lingui/react/macro";

export interface UnsupportedScriptStubProps {
  script: string;
}

export function UnsupportedScriptStub({ script }: UnsupportedScriptStubProps) {
  return (
    <div
      role="status"
      style={{
        padding: "32px 24px",
        border: "1px dashed var(--app-warning-border)",
        borderRadius: 12,
        background: "var(--app-warning-bg)",
        color: "var(--app-warning-text)",
        textAlign: "center",
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {/* Heading was pure white — only readable because the whole app was a
          near-black shell before the design-system token layer landed (see
          issue 533). On the light theme, white-on-amber-tint fails contrast,
          so this now shares the warning-text token with the body copy below. */}
      <strong style={{ color: "var(--app-warning-text)" }}>
        <Trans id="unsupported.heading">Preview not available in v1.0</Trans>
      </strong>
      <div style={{ marginTop: 8 }}>
        <Trans id="unsupported.detail">
          Keyboards for the <code>{script}</code> script (CJK / Ethiopic reorder)
          are out of scope for v1.0 and will land in v1.1.
        </Trans>
      </div>
    </div>
  );
}
