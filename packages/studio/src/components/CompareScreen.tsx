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
// Spec 084 Phase 5 adds one read-only surface here: the "Check criteria"
// button and its inline foreign-mode panel (useCompareCriteria +
// CriteriaPage with no record callbacks). It judges the loaded keyboard's
// preview VFS and writes nothing but its own open flag in viewStateStore —
// the absences above are unchanged.
//
// The route TOKEN stays `preview` (contract §1): renaming it would break every
// existing bookmark and every e2e hash assertion for no requirement's sake.
// FR-026 scopes the rename to labels, aria names, headings, message ids, tests
// and docs.

import { Trans, useLingui } from "@lingui/react/macro";
import { useResizablePanes } from "../hooks/useResizablePanes.ts";
import { useCompareArtifact } from "../hooks/useCompareArtifact.ts";
import { useCompareCriteria } from "../hooks/useCompareCriteria.ts";
import { CriteriaPage } from "../criteria/CriteriaPage.tsx";
import { StartKeyboardPicker } from "./StartKeyboardPicker.tsx";
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

  // Spec 084 T5.4: the foreign criteria judgment over the loaded
  // keyboard's preview VFS. Read-only by construction — the hook imports
  // no authoring store, the panel below passes CriteriaPage NO record
  // callbacks (foreign rows carry controls: null already), and the only
  // state written here is the panel's open flag in viewStateStore.
  const compareCriteria = useCompareCriteria(artifact);
  const criteriaOpen = useViewStateStore((s) => s.compareCriteriaOpen);
  const setCriteriaOpen = useViewStateStore((s) => s.setCompareCriteriaOpen);
  const criteriaReady = artifact.stage.kind === "ready";

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

        <StartKeyboardPicker
          value={artifact.startKeyboard}
          onChange={artifact.setStartKeyboard}
          label={t({ id: "compare.picker.fieldLabel", message: "Keyboard to compare" })}
        />

        {artifact.startKeyboard !== null && <MetadataCard kb={artifact.startKeyboard} />}

        {/* Spec 084 T5.4: "Check criteria" — rendered only once a keyboard
            is selected; disabled with a stated reason until the preview
            stage is ready, because there is no VFS to judge before then.
            The panel expands inline below the button (plan §5). */}
        {artifact.startKeyboard !== null && (
          <div data-testid="compare-criteria">
            <button
              type="button"
              data-testid="compare-check-criteria"
              disabled={!criteriaReady}
              aria-expanded={criteriaOpen}
              title={
                criteriaReady
                  ? undefined
                  : t({
                      id: "criteria.compare.notReadyReason",
                      message: "Criteria can be checked once the keyboard has loaded and compiled.",
                    })
              }
              onClick={() => setCriteriaOpen(!criteriaOpen)}
              style={{
                background: "none",
                border: "1px solid var(--app-border)",
                borderRadius: 6,
                padding: "4px 10px",
                color: "var(--app-text-subtle)",
                cursor: criteriaReady ? "pointer" : "not-allowed",
                fontSize: 12,
                fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
              }}
            >
              <Trans id="criteria.compare.button">Check criteria</Trans>
            </button>
            {!criteriaReady && (
              <p
                data-testid="compare-criteria-not-ready"
                style={{ margin: "4px 0 0", fontSize: 12, color: "var(--app-text-subtle)" }}
              >
                <Trans id="criteria.compare.notReadyReason">
                  Criteria can be checked once the keyboard has loaded and compiled.
                </Trans>
              </p>
            )}
            {criteriaOpen && criteriaReady && (
              compareCriteria.ready && compareCriteria.result !== null ? (
                <CriteriaPage
                  mode="foreign"
                  result={compareCriteria.result}
                  keyboardLabel={artifact.startKeyboard.displayName}
                  judgedNote={t({
                    id: "criteria.compare.judgedNote",
                    message:
                      "This check judges the loaded keyboard as previewed here — the same source the preview compiled.",
                  })}
                />
              ) : (
                <p
                  data-testid="compare-criteria-loading"
                  style={{ margin: "8px 0 0", fontSize: 12, color: "var(--app-text-subtle)" }}
                >
                  <Trans id="criteria.compare.loading">Checking criteria…</Trans>
                </p>
              )
            )}
          </div>
        )}

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
            {artifact.startKeyboard?.displayName ??
              t({ id: "compare.empty.title", message: "No keyboard loaded" })}
          </h2>
          <OskModeToggle value={artifact.oskMode} onChange={artifact.setOskMode} />
        </div>
        <OSKFrame
          startKeyboard={artifact.startKeyboard}
          oskMode={artifact.oskMode}
          stage={artifact.stage}
          retry={artifact.retry}
        />
        {artifact.startKeyboard !== null && (
          <DiagnosticsPanel diagnostics={artifact.diagnostics} />
        )}
      </section>
    </div>
  );
}
