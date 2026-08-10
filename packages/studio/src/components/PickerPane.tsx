// PickerPane — the left pane used by OutputScreen.
//
// Spec 057: it used to be shared with PreviewScreen. That screen is gone —
// the Compare tab that replaced it renders its own, deliberately smaller pane
// with no mode toggle, no scaffold form and no identity panel (US2, FR-023).
//
// Renders: heading + description, mode toggle (open/scaffold), the picker
// component slot, the scaffold-form slot, the identity-panel slot, the
// KMN-editor slot, and the MetadataCard (open-mode only).
//
// Slots are passed as ReactNode so each screen can inject the already-created
// elements without PickerPane importing every child component.
//
// ---------------------------------------------------------------------------
// Variants (spec 058)
// ---------------------------------------------------------------------------
// "full" (default) — the historical pane. PreviewScreen always uses it, and
//   OutputScreen falls back to it on COLD ARRIVAL (a nav click, typed hash, or
//   bookmark straight to #output with no instantiated working copy), which is
//   the documented reason a picker is reachable from Output at all — see
//   usePreviewArtifact.ts's module comment.
//
// "shipping" — OutputScreen's pane once a working copy EXISTS. Drops the
//   base-source mode toggle and the picker, because neither belongs at ship
//   time:
//     - `pickerMode` is per-screen local state that re-initializes to "open"
//       on every mount, so on Output the toggle could never report how the
//       working copy was actually created (it showed "Open base" even for a
//       Track 1 scaffold) — a mode INPUT sitting where an author reads a state
//       DISPLAY.
//     - selecting a different base re-instantiates and discards carve
//       deletions plus recorded survey phases, behind nothing but a native
//       window.confirm. That is a start-over action; it does not belong on the
//       screen whose job is to emit. `changeBaseSlot` relocates it to the
//       survey's choose_base step, where the preview-before-commit gate and
//       confirmRebaseTo already live.
//   The base is shown instead as read-only provenance.
//
// Both variants render `identityPanelSlot` and `kmnEditorSlot` at the SAME
// position in a SINGLE <section> — naming the keyboard and a final source
// tweak are legitimate at ship time, and keeping one element tree means a
// mid-visit variant flip (a late-settling instantiation) reconciles in place
// rather than unmounting a half-typed identity form. Do not split this into
// two top-level returns.

import type { CSSProperties, ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import type { PreviewArtifact } from "../hooks/usePreviewArtifact.ts";
import { MetadataCard } from "./MetadataCard.tsx";
import { BG_CARD, BLUE_ACTION, CARD_BORDER, FONT_MONO, TEXT_MAIN } from "../ui/theme.ts";
import { PANE_SECONDARY_BUTTON } from "./previewOutputLayout.ts";

export type PickerPaneVariant = "full" | "shipping";

interface PickerPaneProps {
  artifact: PreviewArtifact;
  leftPct: number;
  dividerWidth: number;
  pickerSlot: ReactNode;
  scaffoldFormSlot: ReactNode;
  identityPanelSlot: ReactNode;
  kmnEditorSlot: ReactNode;
  /** Defaults to "full" — see the variant notes in the module comment. */
  variant?: PickerPaneVariant;
  /**
   * Escape hatch rendered in the "shipping" variant only: a control that
   * routes back to the survey's base picker. Never a control that mutates the
   * working copy in place.
   */
  changeBaseSlot?: ReactNode;
}

/** The mode toggle's two buttons — the shared treatment plus pressed-state fill. */
function modeToggleStyle(pressed: boolean): CSSProperties {
  return {
    ...PANE_SECONDARY_BUTTON,
    flex: 1,
    background: pressed ? BLUE_ACTION : BG_CARD,
    color: pressed ? TEXT_MAIN : PANE_SECONDARY_BUTTON.color,
    transition: "background 0.15s",
  };
}

/**
 * Read-only base provenance for the "shipping" variant — a definition list so
 * each value is programmatically associated with its own term rather than
 * relying on visual adjacency (docs/accessibility.md).
 */
function BaseProvenance({ kb }: { kb: BaseKeyboard }) {
  // Keyed by the FIELD, not by the value: two of these coincide readily in real
  // data (a base whose displayName is its id, or a single-script base named for
  // its script), and a duplicate React key silently drops a row from the list.
  const rows: { field: string; label: ReactNode; value: string }[] = [
    {
      field: "name",
      label: <Trans id="picker.shipping.provenance.name">Name</Trans>,
      value: kb.displayName,
    },
    {
      field: "id",
      label: <Trans id="picker.shipping.provenance.id">Base ID</Trans>,
      value: kb.id,
    },
    {
      field: "script",
      label: <Trans id="picker.shipping.provenance.script">Script</Trans>,
      value: kb.script,
    },
  ];
  return (
    <div
      data-testid="output-base-provenance"
      style={{
        padding: 16,
        background: BG_CARD,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--app-text-subtle)",
          fontWeight: 700,
        }}
      >
        <Trans id="picker.shipping.provenance.heading">Built from</Trans>
      </h2>
      <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 8px" }}>
        {rows.map((row) => (
          <div key={row.field} style={{ display: "contents" }}>
            <dt style={{ color: "var(--app-text-subtle)", fontSize: 13 }}>{row.label}</dt>
            <dd style={{ margin: 0, color: TEXT_MAIN, fontSize: 13, fontFamily: FONT_MONO }}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PickerPane({
  artifact,
  leftPct,
  dividerWidth,
  pickerSlot,
  scaffoldFormSlot,
  identityPanelSlot,
  kmnEditorSlot,
  variant = "full",
  changeBaseSlot,
}: PickerPaneProps) {
  const { t } = useLingui();
  const { baseKeyboard, pickerMode, handlePickerModeChange } = artifact;
  const shipping = variant === "shipping";

  return (
    <section
      aria-label={
        shipping
          ? t({ id: "picker.pane.label.shipping", message: "Keyboard details pane" })
          : t({ id: "picker.pane.label", message: "Picker pane" })
      }
      style={{
        flexBasis: `calc(${leftPct}% - ${dividerWidth / 2}px)`,
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
        {shipping ? (
          <Trans id="picker.shipping.heading">Your keyboard</Trans>
        ) : (
          "Keyboard Studio"
        )}
      </h1>
      <p style={{ margin: 0, color: "var(--app-text-subtle)", fontSize: 13 }}>
        {shipping ? (
          <Trans id="picker.shipping.intro">
            Check the details below, then download or submit your keyboard from the right.
          </Trans>
        ) : (
          <Trans id="picker.intro">
            Pick a base keyboard to start; the right pane shows the compiled result.
          </Trans>
        )}
      </p>

      {/* Mode toggle: open base vs. scaffold new. Full variant only. */}
      {shipping ? null : (
        <div
          role="group"
          aria-label={t({ id: "picker.modeToggle.groupLabel", message: "Keyboard source mode" })}
          style={{ display: "flex", gap: 8, marginTop: 4 }}
        >
          <button
            type="button"
            onClick={() => handlePickerModeChange("open")}
            aria-pressed={pickerMode === "open"}
            style={modeToggleStyle(pickerMode === "open")}
          >
            <Trans id="picker.modeToggle.open">Open base</Trans>
          </button>
          <button
            type="button"
            onClick={() => handlePickerModeChange("scaffold")}
            aria-pressed={pickerMode === "scaffold"}
            style={modeToggleStyle(pickerMode === "scaffold")}
          >
            <Trans id="picker.modeToggle.scaffold">New from base</Trans>
          </button>
        </div>
      )}

      {/* Base: an editable picker in the full variant, read-only provenance
          (plus the route-back escape hatch) in the shipping variant. */}
      {shipping ? (
        baseKeyboard !== null ? (
          <>
            <BaseProvenance kb={baseKeyboard} />
            {changeBaseSlot}
          </>
        ) : null
      ) : (
        <div style={{ marginTop: 8 }}>{pickerSlot}</div>
      )}

      {shipping ? null : scaffoldFormSlot}

      {identityPanelSlot}

      {kmnEditorSlot}

      {baseKeyboard !== null && !shipping && pickerMode === "open" ? (
        <MetadataCard kb={baseKeyboard} />
      ) : null}
    </section>
  );
}
