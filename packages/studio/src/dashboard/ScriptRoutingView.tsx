// Render the §9 script → routing-group split: which target scripts land in the
// QWERTY/QWERTZ family, which go to the non-Roman branch, and where AZERTY fits.
// Rows are built by buildScriptRouting() from the survey's own script options.

import { type CSSProperties } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { buildScriptRouting, type ScriptRoutingRow } from "./buildScriptRouting.ts";
import type { ScriptRoutingGroup } from "../lib/scriptAxes.ts";
import { MONO, SANS, Badge, COLORS } from "./tokens.tsx";

function GroupChip({ group, gated }: { group: ScriptRoutingGroup | null; gated: boolean }) {
  const { t } = useLingui();
  if (gated) {
    return (
      <Badge
        text={t({ id: "dashboard.scriptRouting.badge.gated", message: "not supported yet" })}
        bg={COLORS.red.bg}
        border={COLORS.red.dark}
        color={COLORS.red.base}
        size="small"
      />
    );
  }
  // "qwerty-qwertz" / "non-roman" are the §9 routing-group identifiers
  // themselves (not chrome) — displayed verbatim, never translated.
  if (group === "qwerty-qwertz") {
    return <Badge text="qwerty-qwertz" bg={COLORS.blue.bg} border={COLORS.blue.dark} color={COLORS.blue.light} size="small" />;
  }
  return <Badge text="non-roman" bg={COLORS.amber.bg} border={COLORS.amber.dark} color={COLORS.amber.base} size="small" />;
}

interface ScriptRoutingViewProps {
  identityLiteRaw: string;
}

export function ScriptRoutingView({ identityLiteRaw }: ScriptRoutingViewProps) {
  const rows: ScriptRoutingRow[] = buildScriptRouting(identityLiteRaw);

  const cell: CSSProperties = {
    padding: "8px 12px",
    borderBottom: `1px solid ${COLORS.gray.border}`,
    textAlign: "left",
    verticalAlign: "top",
  };
  const head: CSSProperties = {
    ...cell,
    color: COLORS.gray.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 600,
    borderBottom: `1px solid ${COLORS.gray.borderStrong}`,
  };

  return (
    <div style={{ fontFamily: SANS, color: COLORS.gray.text, maxWidth: 920 }}>
      <p style={{ fontSize: 13, color: COLORS.gray.textDim, margin: "0 0 16px" }}>
        <Trans id="dashboard.scriptRouting.description">
          The target script the author picks — not the language — decides the layout family (§9). Latin-family
          alphabetic scripts route to{" "}
          <strong style={{ color: COLORS.blue.light }}>{"qwerty-qwertz"}</strong>; everything
          else routes to <strong style={{ color: COLORS.amber.base }}>{"non-roman"}</strong>, which then fans out
          inside Phase B (see the Survey flow tab:{" "}
          <code style={{ fontFamily: MONO }}>{"pb_non_roman_branch"}</code> →
          Indic / SE-Asian / RTL / syllabic / alpha-nonlatin).
        </Trans>
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", background: COLORS.gray.bg, border: `1px solid ${COLORS.gray.border}`, borderRadius: 8 }}>
        <thead>
          <tr>
            <th style={head}>
              <Trans id="dashboard.scriptRouting.header.scriptOption">Script option</Trans>
            </th>
            <th style={head}>
              <Trans id="dashboard.scriptRouting.header.normalized">Normalized</Trans>
            </th>
            {/* "A2" names the §7.1 discovery-axis code (A1–A7) — a data
                identifier, not chrome; left untranslated (see report). */}
            <th style={head}>A2 class</th>
            <th style={head}>
              <Trans id="dashboard.scriptRouting.header.routingGroup">Routing group</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.value}>
              <td style={cell}>
                <div style={{ fontFamily: MONO, fontSize: 12, color: COLORS.blue.base }}>{r.value}</div>
                <div style={{ fontSize: 11, color: COLORS.gray.textDim, maxWidth: 320 }}>{r.label}</div>
              </td>
              <td style={{ ...cell, fontFamily: MONO, fontSize: 12, color: COLORS.gray.textMuted }}>
                {r.script}
                {r.variant !== undefined ? `-${r.variant}` : ""}
              </td>
              <td style={{ ...cell, fontFamily: MONO, fontSize: 12, color: COLORS.gray.textMuted }}>{r.scriptClass}</td>
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
          background: COLORS.gray.bgPanel,
          border: `1px solid ${COLORS.gray.border}`,
          borderLeft: `3px solid ${COLORS.blue.dark}`,
          borderRadius: 6,
          fontSize: 12.5,
          color: COLORS.gray.textMuted,
          lineHeight: 1.5,
        }}
      >
        <Trans id="dashboard.scriptRouting.azerty.note">
          <strong style={{ color: COLORS.gray.text }}>Where AZERTY comes from.</strong> AZERTY is the third §9
          routing group but is <em>not</em> derivable from the script — every Latin script above starts as{" "}
          <code style={{ fontFamily: MONO }}>{"qwerty-qwertz"}</code>. AZERTY is a base-layout refinement
          resolved <strong>after</strong> the author picks a base, from that base&rsquo;s structural shape (see{" "}
          <code style={{ fontFamily: MONO }}>{"lib/scriptAxes.ts"}</code> —{" "}
          <code style={{ fontFamily: MONO }}>{"RoutingGroup"}</code>{" "}
          vs <code style={{ fontFamily: MONO }}>{"ScriptRoutingGroup"}</code>). That is why it has no row here.
        </Trans>
      </div>
    </div>
  );
}
