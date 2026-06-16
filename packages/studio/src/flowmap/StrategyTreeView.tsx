// Render the §7.2 strategy decision tree from the engine's exported rule tables.
//
// PRIMARY_RULES / SECONDARY_RULES / STRATEGY_LABELS ARE the data selectStrategy()
// runs (see packages/engine/src/strategy-selector/rules.ts) — this view executes
// no logic of its own, so it can never drift from the selector. The primary
// pass is a first-match-wins waterfall; the secondary passes always run.

import {
  PRIMARY_RULES,
  SECONDARY_RULES,
  STRATEGY_LABELS,
  type ConditionalSecondary,
} from "@keyboard-studio/engine";
import type { StrategyId } from "@keyboard-studio/contracts";
import { MONO, SANS } from "./tokens.ts";

function StrategyChip({ id, kind }: { id: StrategyId; kind: "primary" | "secondary" }) {
  const primary = kind === "primary";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 6,
        padding: "2px 8px",
        borderRadius: 5,
        fontFamily: SANS,
        fontSize: 12.5,
        background: primary ? "#1f6feb" : "#21262d",
        color: primary ? "#fff" : "#adbac7",
        border: primary ? "1px solid #388bfd" : "1px solid #30363d",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontFamily: MONO, fontWeight: 600 }}>{id}</span>
      <span style={{ opacity: 0.85 }}>{STRATEGY_LABELS[id]}</span>
    </span>
  );
}

function SecondaryChip({ sec }: { sec: ConditionalSecondary }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "#6e7681", fontFamily: MONO, fontSize: 12 }}>+</span>
      <StrategyChip id={sec.strategy} kind="secondary" />
      {sec.whenText !== undefined && (
        <span style={{ color: "#8b949e", fontSize: 11, fontFamily: MONO }}>
          if {sec.whenText}
        </span>
      )}
    </span>
  );
}

export function StrategyTreeView() {
  return (
    <div style={{ fontFamily: SANS, color: "#e6edf3", maxWidth: 920 }}>
      <p style={{ fontSize: 13, color: "#8b949e", margin: "0 0 16px" }}>
        The survey computes a seven-axis vector (A1–A7), then{" "}
        <code style={{ fontFamily: MONO, color: "#adbac7" }}>selectStrategy()</code> runs this tree.
        Primary rules are tried top-to-bottom; the first match fixes the primary strategy. The
        secondary passes then always run, appending add-ons.
      </p>

      <h3 style={{ fontSize: 13, color: "#6ea8fe", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>
        Primary pass — first match wins
      </h3>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {PRIMARY_RULES.map((r, i) => (
          <div key={r.rule}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: "#11161d",
                border: "1px solid #21262d",
                borderRadius: 7,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: "#fff",
                  background: "#30363d",
                  borderRadius: 4,
                  padding: "2px 8px",
                  minWidth: 56,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                Rule {r.rule}
              </span>
              <code style={{ fontFamily: MONO, fontSize: 12.5, color: "#e3b341", flex: 1, minWidth: 220 }}>
                {r.conditionText}
              </code>
              <span style={{ color: "#6e7681" }}>→</span>
              <StrategyChip id={r.primary} kind="primary" />
              {r.secondaries.map((sec) => (
                <SecondaryChip key={sec.strategy} sec={sec} />
              ))}
            </div>
            {i < PRIMARY_RULES.length - 1 && (
              <div style={{ paddingLeft: 22, color: "#6e7681", fontSize: 11, fontFamily: MONO, lineHeight: "18px" }}>
                else ↓
              </div>
            )}
          </div>
        ))}
      </div>

      <h3
        style={{
          fontSize: 13,
          color: "#6ea8fe",
          margin: "24px 0 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        Secondary passes — always run, in order
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SECONDARY_RULES.map((sr) => (
          <div
            key={String(sr.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "#11161d",
              border: "1px solid #21262d",
              borderRadius: 7,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: "#adbac7",
                background: "#21262d",
                borderRadius: 4,
                padding: "2px 8px",
                whiteSpace: "nowrap",
              }}
            >
              {sr.id === "S-11-wrapper" ? "S-11 wrapper" : `Rule ${sr.id}`}
            </span>
            <code style={{ fontFamily: MONO, fontSize: 12.5, color: "#e3b341", flex: 1, minWidth: 220 }}>
              {sr.conditionText}
            </code>
            <span style={{ color: "#6e7681" }}>→ add</span>
            <StrategyChip id={sr.add} kind="secondary" />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: "#6e7681", margin: "16px 0 0", fontFamily: SANS }}>
        Note: spec §7.2 also documents rule 3a (postfix-preference intercept → S-03). It is not yet
        wired end-to-end, so it is intentionally absent here — this map reflects what{" "}
        <code style={{ fontFamily: MONO }}>selectStrategy()</code> actually does.
      </p>
    </div>
  );
}
