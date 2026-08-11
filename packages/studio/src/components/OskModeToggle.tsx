// Desktop ↔ Touch OSK mode toggle. Wired into the iframe via the
// SET_OSK_MODE postMessage command (CSS class swap on the iframe body).

import { useLingui } from "@lingui/react/macro";

// "tablet" is a real preview mode (osk-frame.js's device map), but it is not
// surfaced as a button here — this toggle is only the gallery's Desktop/Mobile
// pair. Callers that need a tablet preview (e.g. TouchSeedSourcePanel, whose
// reseed-from-desktop derivation now emits a tablet-platform touch layout)
// set the mode directly, bypassing this component entirely.
export type OskMode = "desktop" | "touch" | "tablet";

export interface OskModeToggleProps {
  value: OskMode;
  onChange: (next: OskMode) => void;
  disabled?: boolean;
}

export function OskModeToggle({ value, onChange, disabled }: OskModeToggleProps) {
  const { t } = useLingui();
  const opt = (mode: OskMode, label: string) => {
    const active = value === mode;
    return (
      <button
        key={mode}
        type="button"
        disabled={disabled}
        onClick={() => onChange(mode)}
        aria-pressed={active}
        style={{
          padding: "8px 16px",
          borderRadius: 0,
          border: "1px solid var(--app-border)",
          background: active ? "var(--app-accent-subtle)" : "var(--app-surface)",
          color: active ? "var(--app-accent-text)" : "var(--app-text)",
          fontWeight: active ? 600 : 500,
          cursor: disabled ? "not-allowed" : "pointer",
          fontSize: 13,
          minWidth: 96,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div
      role="group"
      aria-label={t({ id: "osk.modeToggle.groupLabel", message: "OSK rendering mode" })}
      style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden" }}
    >
      {opt("desktop", t({ id: "osk.modeToggle.desktop", message: "Desktop OSK" }))}
      {opt("touch", t({ id: "osk.modeToggle.touch", message: "Mobile KB" }))}
    </div>
  );
}
