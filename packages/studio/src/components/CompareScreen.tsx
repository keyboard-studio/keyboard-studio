// CompareScreen — the "look at someone else's keyboard" tab (spec 057 US2).
//
// Replaces PreviewScreen. The rename is not cosmetic: the tab's PURPOSE
// changed. It used to be a second, fully-live authoring surface that wrote to
// the same working copy the wizard was editing — including a base-swap path
// that offered to discard the author's work in two clicks (defect D-6). It is
// now what its name says: a place to load a keyboard the author is NOT
// authoring, run it, and read its source.
//
// WHAT IS DELIBERATELY ABSENT (FR-023 — the isolation is structural):
//   - `TrackOneIdentityPanel`. It called `setIdentity(...)` on the shared
//     working-copy store on every valid keystroke.
//   - The scaffold-form path and the open/scaffold mode toggle. Scaffolding
//     creates a project; that belongs to the wizard.
//   - `KmnEditor`. Source is shown READ-ONLY here — editing a foreign
//     keyboard's source has nowhere to go, and an editable field implies
//     otherwise.
//   - Any `onInstantiate`. See `useCompareArtifact`, which is where that
//     absence lives.
//
// The route TOKEN stays `preview` (contract §1): renaming it would break every
// existing bookmark and every e2e hash assertion for no requirement's sake.
// FR-026 scopes the rename to labels, aria names, headings, message ids, tests
// and docs.

import { Trans, useLingui } from "@lingui/react/macro";
import { useResizablePanes } from "../hooks/useResizablePanes.ts";
import { useCompareArtifact } from "../hooks/useCompareArtifact.ts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { OskModeToggle } from "./OskModeToggle.tsx";
import { OSKFrame } from "./OSKFrame.tsx";
import { MetadataCard } from "./MetadataCard.tsx";
import { DiagnosticsPanel } from "./DiagnosticsPanel.tsx";
import { ResizeHandle } from "./ResizeHandle.tsx";
import { KmnSourceView } from "./KmnSourceView.tsx";
// LEFT_INIT_PCT is intentionally not imported: this screen's initial split
// comes from session view state (readPaneSplitPct), whose own initial value
// mirrors that constant — see stores/viewStateStore.ts's INITIAL_SPLIT_PCT.
import { DIVIDER_WIDTH, LEFT_MIN_PCT, LEFT_MAX_PCT } from "./previewOutputLayout.ts";
import { readPaneSplitPct, useViewStateStore } from "../stores/viewStateStore.ts";

export function CompareScreen() {
  const { t } = useLingui();
  const artifact = useCompareArtifact();

  // Pane split is view state (US5): it survives a tab switch and is clamped on
  // read, so a value stored under a different layout cannot produce an
  // unusable split.
  const setPaneSplitPct = useViewStateStore((s) => s.setPaneSplitPct);
  const { containerRef, leftPct, onPointerDown } = useResizablePanes({
    minPct: LEFT_MIN_PCT,
    maxPct: LEFT_MAX_PCT,
    initPct: readPaneSplitPct("compare", LEFT_MIN_PCT, LEFT_MAX_PCT),
    onChange: (pct) => setPaneSplitPct("compare", pct),
  });

  const rightPct = 100 - leftPct;

  return (
    <div
      ref={containerRef}
      data-testid="compare-screen-root"
      style={{
        display: "flex",
        flexDirection: "row",
        height: "100%",
        width: "100%",
        background: "var(--bg)",
        color: "var(--app-text)",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Left pane: pick a keyboard, then read about it. No mode toggle, no
          scaffold form, no identity panel — see the module header. */}
      <section
        aria-label={t({ id: "compare.picker.label", message: "Keyboard chooser" })}
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
          <Trans id="compare.heading">Compare another keyboard</Trans>
        </h1>
        <p style={{ margin: 0, color: "var(--app-text-subtle)", fontSize: 13 }}>
          <Trans id="compare.intro">
            Load any keyboard to see how it works — type into it and read its source.
            Nothing you do here changes your own keyboard.
          </Trans>
        </p>

        <BaseKeyboardPicker
          value={artifact.baseKeyboard}
          onChange={artifact.setBaseKeyboard}
          label={t({ id: "compare.picker.fieldLabel", message: "Keyboard to compare" })}
        />

        {artifact.baseKeyboard !== null && <MetadataCard kb={artifact.baseKeyboard} />}

        {artifact.stage.kind === "ready" && <KmnSourceView vfs={artifact.stage.vfs} />}
      </section>

      <ResizeHandle onPointerDown={onPointerDown} />

      {/* Right pane: the loaded keyboard, running. Typing into the OSK is
          inspection, not editing (FR-024) — it produces characters in a
          scratch field and touches no store. */}
      <section
        aria-label={t({ id: "compare.pane.label", message: "Comparison pane" })}
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
          <h2 style={{ margin: 0, fontSize: "1.1rem", color: "var(--app-accent-text)" }}>
            {artifact.baseKeyboard?.displayName ??
              t({ id: "compare.empty.title", message: "No keyboard loaded" })}
          </h2>
          <OskModeToggle value={artifact.oskMode} onChange={artifact.setOskMode} />
        </div>
        <OSKFrame
          baseKeyboard={artifact.baseKeyboard}
          oskMode={artifact.oskMode}
          stage={artifact.stage}
          retry={artifact.retry}
        />
        {artifact.baseKeyboard !== null && (
          <DiagnosticsPanel diagnostics={artifact.diagnostics} />
        )}
      </section>
    </div>
  );
}
