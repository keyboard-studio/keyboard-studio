// Desktop ↔ Touch OSK mode toggle. Wired into the iframe via the
// SET_OSK_MODE postMessage command (CSS class swap on the iframe body).

export type OskMode = "desktop" | "touch";

export interface OskModeToggleProps {
  value: OskMode;
  onChange: (next: OskMode) => void;
  disabled?: boolean;
}

export function OskModeToggle({ value, onChange, disabled }: OskModeToggleProps) {
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
          border: "1px solid #283040",
          background: active ? "rgba(110,168,254,0.18)" : "#161b22",
          color: active ? "#6ea8fe" : "#e6edf3",
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
      aria-label="OSK rendering mode"
      style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden" }}
    >
      {opt("desktop", "Desktop OSK")}
      {opt("touch", "Mobile KB")}
    </div>
  );
}
