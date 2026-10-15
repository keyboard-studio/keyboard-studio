// AdvancedKmnEditor — the gate in front of the raw .kmn editor.
//
// The studio assumes its author cannot read or write .kmn, so the editable
// source is hidden by default on the screens that mount it. It stays
// reachable two ways:
//   - an explicit "Advanced: view source" toggle — a user-facing control,
//     because expert authors legitimately need a final source tweak at ship
//     time and a dev-only gate would strand them; and
//   - the dev/E2E flag (VITE_E2E=1 / ?e2e=1, read through lib/envFlag.ts —
//     the same convention as lib/e2eHook.ts), which reveals it up front so
//     E2E walks and developer sessions see the editor without an extra click.
//
// When revealed, a caution states that hand-edits bypass the guided flow:
// the survey and gallery answers know nothing about them.

import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import { KmnEditor, type KmnEditorProps } from "./KmnEditor.tsx";
import { readEnvFlag } from "../lib/envFlag.ts";
import { PANE_SECONDARY_BUTTON } from "./previewOutputLayout.ts";

export type AdvancedKmnEditorProps = KmnEditorProps;

/** True when the dev/E2E flag asks for the source editor up front. */
export function isSourceRevealedByFlag(): boolean {
  return readEnvFlag("VITE_E2E", "e2e");
}

export function AdvancedKmnEditor({ vfs, onRecompile }: AdvancedKmnEditorProps) {
  const [revealed, setRevealed] = useState<boolean>(() => isSourceRevealedByFlag());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button
        type="button"
        data-testid="advanced-view-source-toggle"
        aria-expanded={revealed}
        onClick={() => setRevealed((r) => !r)}
        style={{ ...PANE_SECONDARY_BUTTON, alignSelf: "flex-start" }}
      >
        <Trans id="kmnEditor.advancedToggle">Advanced: view source</Trans>
      </button>
      {revealed && (
        <>
          <p
            data-testid="advanced-view-source-caution"
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--app-warning-text)",
            }}
          >
            <Trans id="kmnEditor.advancedCaution">
              Editing the source directly bypasses the guided flow — changes made
              here are not reflected in the answers you gave in the earlier steps.
            </Trans>
          </p>
          <KmnEditor vfs={vfs} onRecompile={onRecompile} />
        </>
      )}
    </div>
  );
}
