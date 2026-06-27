// Render the §9 script → routing-group split: which target scripts land in the
// QWERTY/QWERTZ family, which go to the non-Roman branch, and where AZERTY fits.
// Rows are built by buildScriptRouting() from the survey's own script options.

import { type CSSProperties } from "react";
import { buildScriptRouting, type ScriptRoutingRow } from "./buildScriptRouting.ts";
import type { ScriptRoutingGroup } from "../lib/scriptAxes.ts";
import { MONO, SANS } from "./tokens.ts";

function GroupChip({ group, gated }: { group: ScriptRoutingGroup | null; gated: boolean }) {
  if (gated) {
    return <Chip text="not supported yet" bg="#3d1d1d" border="#763a3a" color="#ff9492" />;
  }
  if (group === "qwerty-qwertz") {
    return <Chip text="qwerty-qwertz" bg="#11203a" border="#1f6feb" color="#79c0ff" />;
  }
  return <Chip text="non-roman" bg="#241c10" border="#9e6a03" color="#e3b341" />;
}

function Chip({ text, bg, border, color }: { text: string; bg: string; border: string; color: string }) {
  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: 11.5,
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

interface ScriptRoutingViewProps {
  identityLiteRaw: string;
}

export function ScriptRoutingView({ identityLiteRaw }: ScriptRoutingViewProps) {
  const rows: ScriptRoutingRow[] = buildScriptRouting(identityLiteRaw);

  const cell: CSSProperties = {
    padding: "8px 12px",
    borderBottom: "1px solid #21262d",
    textAlign: "left",
    verticalAlign: "top",
  };
  const head: CSSProperties = {
    ...cell,
    color: "#8b949e",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 600,
    borderBottom: "1px solid #30363d",
  };

  return (
    <div style={{ fontFamily: SANS, color: "#e6edf3", maxWidth: 920 }}>
      <p style={{ fontSize: 13, color: "#8b949e", margin: "0 0 16px" }}>
        The target script the author picks — not the language — decides the layout family (§9). Latin-family
        alphabetic scripts route to <strong style={{ color: "#79c0ff" }}>qwerty-qwertz</strong>; everything
        else routes to <strong style={{ color: "#e3b341" }}>non-roman</strong>, which then fans out inside
        Phase B (see the Survey flow tab: <code style={{ fontFamily: MONO }}>pb_non_roman_branch</code> →
        Indic / SE-Asian / RTL / syllabic / alpha-nonlatin).
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", background: "#0b0f14", border: "1px solid #21262d", borderRadius: 8 }}>
        <thead>
          <tr>
            <th style={head}>Script option</th>
            <th style={head}>Normalized</th>
            <th style={head}>A2 class</th>
            <th style={head}>Routing group</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value}>
              <td style={cell}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: "#6ea8fe" }}>{r.value}</div>
                <div style={{ fontSize: 11, color: "#8b949e", maxWidth: 320 }}>{r.label}</div>
              </td>
              <td style={{ ...cell, fontFamily: MONO, fontSize: 12, color: "#adbac7" }}>
                {r.script}
                {r.variant !== undefined ? `-${r.variant}` : ""}
              </td>
              <td style={{ ...cell, fontFamily: MONO, fontSize: 12, color: "#adbac7" }}>{r.scriptClass}</td>
              <td style={cell}>
                <GroupChip group={r.routingGroup} gated={r.gated} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          background: "#11161d",
          border: "1px solid #21262d",
          borderLeft: "3px solid #1f6feb",
          borderRadius: 6,
          fontSize: 12.5,
          color: "#adbac7",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "#e6edf3" }}>Where AZERTY comes from.</strong> AZERTY is the third §9
        routing group but is <em>not</em> derivable from the script — every Latin script above starts as{" "}
        <code style={{ fontFamily: MONO }}>qwerty-qwertz</code>. AZERTY is a base-layout refinement
        resolved <strong>after</strong> the author picks a base, from that base's structural shape (see{" "}
        <code style={{ fontFamily: MONO }}>lib/scriptAxes.ts</code> — <code style={{ fontFamily: MONO }}>RoutingGroup</code>{" "}
        vs <code style={{ fontFamily: MONO }}>ScriptRoutingGroup</code>). That is why it has no row here.
      </div>
    </div>
  );
}
