// DiagnosticsPanel — compiler diagnostic list with severity colouring.
//
// Layer A errors (red), Layer C info/hint (blue). Layer B warnings are
// deliberately low-alarm: no colour box, just the panel's own default
// foreground text (TEXT_MAIN) with a leading warning glyph and a
// "Warning:" label, so they read as calm advisories rather than bugs.
// Matches the editor-gutter colour contract in the agent profile.

import { Trans, useLingui } from "@lingui/react/macro";
import type { CompilerDiagnostic } from "@keyboard-studio/contracts";
import { BG_CARD, CARD_BORDER, FONT_MONO, SUCCESS_ACCENT, TEXT_MAIN } from "../ui/theme.ts";

// ---------------------------------------------------------------------------
// Severity label colours
//
// "warning" is intentionally absent — it never gets a colour treatment,
// it renders in the panel's default TEXT_MAIN foreground (see below).
// ---------------------------------------------------------------------------
export const SEVERITY_COLOR: Record<string, string> = {
  fatal: "#f0a0a0",
  error: "#f0a0a0",
  hint: "#6ea8fe",
  info: "#6ea8fe",
};

/** Warning glyph shown before "Warning: <message>" for warning-severity items. */
const WARNING_GLYPH = "⚠";

export function DiagnosticsPanel({ diagnostics }: { diagnostics: CompilerDiagnostic[] }) {
  const { t } = useLingui();
  if (diagnostics.length === 0) {
    return (
      <div
        aria-live="polite"
        style={{
          marginTop: 12,
          padding: "10px 14px",
          background: BG_CARD,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 8,
          fontSize: 12,
          color: SUCCESS_ACCENT,
          fontFamily: FONT_MONO,
        }}
      >
        <Trans id="diagnostics.empty">No compiler diagnostics.</Trans>
      </div>
    );
  }
  return (
    <div
      aria-label={t({ id: "diagnostics.panel.ariaLabel", message: "Compiler diagnostics" })}
      aria-live="polite"
      style={{
        marginTop: 12,
        padding: "10px 14px",
        background: BG_CARD,
        border: `1px solid ${CARD_BORDER}`,
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
        <Trans id="diagnostics.heading">
          Compiler diagnostics ({diagnostics.length})
        </Trans>
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
        {diagnostics.map((d, i) => {
          const location =
            d.location !== undefined ? `${d.location.file}:${d.location.line} — ` : "";
          if (d.severity === "warning") {
            // Calm, low-alarm treatment: no colour box, no border — just the
            // panel's own default foreground text with a leading glyph.
            return (
              <li
                key={`${d.severity}:${d.code ?? i}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12,
                  fontFamily: FONT_MONO,
                  lineHeight: 1.5,
                  color: TEXT_MAIN,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ flexShrink: 0 }}
                >
                  {WARNING_GLYPH}
                </span>
                <span
                  aria-label={t({
                    id: "diagnostics.item.severityAriaLabel",
                    message: `Severity: ${d.severity}`,
                  })}
                >
                  <Trans id="common.warningLabel">Warning:</Trans> {location}
                  {d.message}
                </span>
              </li>
            );
          }
          return (
            <li
              key={`${d.severity}:${d.code ?? i}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                fontSize: 12,
                fontFamily: FONT_MONO,
                lineHeight: 1.5,
              }}
            >
              <span
                aria-label={t({
                  id: "diagnostics.item.severityAriaLabel",
                  message: `Severity: ${d.severity}`,
                })}
                style={{
                  color: SEVERITY_COLOR[d.severity] ?? "#e6edf3",
                  minWidth: 50,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                [{d.severity.toUpperCase()}]
              </span>
              <span style={{ color: TEXT_MAIN }}>
                {location}
                {d.message}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
