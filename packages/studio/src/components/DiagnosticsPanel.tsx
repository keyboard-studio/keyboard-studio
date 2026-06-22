// DiagnosticsPanel — compiler diagnostic list with severity colouring.
//
// Layer A errors (red), Layer B warnings (yellow), Layer C info (blue).
// Matches the editor-gutter colour contract in the agent profile.

import type { CompilerDiagnostic } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Severity label colours
// ---------------------------------------------------------------------------
export const SEVERITY_COLOR: Record<string, string> = {
  fatal: "#f0a0a0",
  error: "#f0a0a0",
  warning: "#d29922",
  hint: "#6ea8fe",
  info: "#6ea8fe",
};

export function DiagnosticsPanel({ diagnostics }: { diagnostics: CompilerDiagnostic[] }) {
  if (diagnostics.length === 0) {
    return (
      <div
        aria-live="polite"
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: "#161b22",
          border: "1px solid #283040",
          borderRadius: 8,
          fontSize: 12,
          color: "#7ee787",
          fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
        }}
      >
        No compiler diagnostics.
      </div>
    );
  }
  return (
    <div
      aria-label="Compiler diagnostics"
      aria-live="polite"
      style={{
        marginTop: 12,
        padding: "10px 14px",
        background: "#161b22",
        border: "1px solid #283040",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9aa7b8",
          fontWeight: 700,
          marginBottom: 8,
        }}
      >
        Compiler diagnostics ({diagnostics.length})
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
        role="list"
      >
        {diagnostics.map((d, i) => (
          <li
            key={`${d.severity}:${d.code ?? i}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              fontSize: 12,
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
              lineHeight: 1.5,
            }}
          >
            <span
              aria-label={`Severity: ${d.severity}`}
              style={{
                color: SEVERITY_COLOR[d.severity] ?? "#e6edf3",
                minWidth: 50,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              [{d.severity.toUpperCase()}]
            </span>
            <span style={{ color: "#e6edf3" }}>
              {d.location !== undefined
                ? `${d.location.file}:${d.location.line} — `
                : ""}
              {d.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
