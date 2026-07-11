// Shared typography tokens for flowmap views.

export const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Semantic color palette for dashboard views
export const COLORS = {
  // Primary blues
  blue: { base: "#6ea8fe", dark: "#1f6feb", light: "#79c0ff", bg: "#11203a" },
  // Success greens
  green: { base: "#3fb950", dark: "#238636", bg: "#0f2417" },
  // Warning ambers
  amber: { base: "#e3b341", dark: "#9e6a03", light: "#d29922", bg: "#241c10" },
  // Error reds
  red: { base: "#ff9492", dark: "#763a3a", bg: "#3d1d1d" },
  // Teal (proposed/library)
  teal: { base: "#39c5cf", dark: "#1b6b73", bg: "#0c2a2e" },
  // Purple (reserve)
  purple: { base: "#6e40c9", dark: "#4a2a8a", bg: "#1a1030" },
  // Grays
  gray: {
    text: "#e6edf3",
    textMuted: "#adbac7",
    textDim: "#8b949e",
    textVeryDim: "#6e7681",
    border: "#21262d",
    borderStrong: "#30363d",
    bg: "#0b0f14",
    bgPanel: "#11161d",
    bgCard: "#161b22",
    bgCanvas: "#0d1117",
  },
} as const;

// Common style fragments
export const STYLES = {
  border: `1px solid ${COLORS.gray.border}`,
  borderStrong: `1px solid ${COLORS.gray.borderStrong}`,
  borderRadius: { small: 4, medium: 6, large: 8 },
} as const;

// Shared Badge component for chip-style UI elements
export function Badge({
  text,
  bg,
  border,
  color,
  size = "medium",
}: {
  text: string;
  bg: string;
  border: string;
  color: string;
  size?: "small" | "medium";
}) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: size === "small" ? 11.5 : 12.5,
        padding: "2px 8px",
        borderRadius: 5,
        background: bg,
        border: `1px solid ${border}`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}
