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
import type { AxisFill, StrategyId } from "@keyboard-studio/contracts";
import { MONO, SANS } from "./tokens.ts";

function StrategyChip({
  id,
  kind,
}: {
  id: StrategyId;
  kind: "primary" | "secondary";
}) {
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
      <span style={{ color: "#6e7681", fontFamily: MONO, fontSize: 12 }}>
        +
      </span>
      <StrategyChip id={sec.strategy} kind="secondary" />
      {sec.whenText !== undefined && (
        <span style={{ color: "#8b949e", fontSize: 11, fontFamily: MONO }}>
          if {sec.whenText}
        </span>
      )}
    </span>
  );
}

export interface StrategyTreeViewProps {
  /**
   * Provenance for phase-gated axis values filled by the §7.2 script-class
   * default-fill prior (`defaultFillAxes()`), most recently published by
   * `MechanismGallery`'s pattern-loading effect. Received via props from
   * `StudioShell` (which can reach `stores/`) — this component has NO
   * stores/ import, satisfying the dashboard-layer depcruise boundary (same
   * pattern as `DashboardView`'s `completeness` prop). `undefined`/`[]` before
   * any pre-fill run, or once every phase-gated axis is elicited/IR-derived.
   */
  axisFills?: AxisFill[];
}

export function StrategyTreeView({ axisFills }: StrategyTreeViewProps) {
  return (
    <div style={{ fontFamily: SANS, color: "#e6edf3", maxWidth: 920 }}>
      <p style={{ fontSize: 13, color: "#8b949e", margin: "0 0 16px" }}>
        The survey computes a seven-axis vector (A1–A7), then{" "}
        <code style={{ fontFamily: MONO, color: "#adbac7" }}>
          selectStrategy()
        </code>{" "}
        runs this tree. Primary rules are tried top-to-bottom; the first match
        fixes the primary strategy. The secondary passes then always run,
        appending add-ons.
      </p>

      <h3
        style={{
          fontSize: 13,
          color: "#6ea8fe",
          margin: "0 0 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
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
              <code
                style={{
                  fontFamily: MONO,
                  fontSize: 12.5,
                  color: "#e3b341",
                  flex: 1,
                  minWidth: 220,
                }}
              >
                {r.conditionText}
              </code>
              <span style={{ color: "#6e7681" }}>→</span>
              <StrategyChip id={r.primary} kind="primary" />
              {r.secondaries.map((sec) => (
                <SecondaryChip key={sec.strategy} sec={sec} />
              ))}
            </div>
            {i < PRIMARY_RULES.length - 1 && (
              <div
                style={{
                  paddingLeft: 22,
                  color: "#6e7681",
                  fontSize: 11,
                  fontFamily: MONO,
                  lineHeight: "18px",
                }}
              >
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
            <code
              style={{
                fontFamily: MONO,
                fontSize: 12.5,
                color: "#e3b341",
                flex: 1,
                minWidth: 220,
              }}
            >
              {sr.conditionText}
            </code>
            <span style={{ color: "#6e7681" }}>→ add</span>
            <StrategyChip id={sr.add} kind="secondary" />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: "#6e7681", margin: "16px 0 0", fontFamily: SANS }}>
        Note: rule 3a (postfix-preference intercept → S-03, shown above between rules 3 and 4) is
        implemented in <code style={{ fontFamily: MONO }}>selectStrategy()</code>. The Track 2
        import path detects the unconditional postfix sequence-replace shape in an imported base and
        fills{" "}
        <code style={{ fontFamily: MONO }}>markInputOrder=&quot;postfix&quot;</code> from it
        (<code style={{ fontFamily: MONO }}>source: &quot;import-derived&quot;</code> below) — though{" "}
        <code style={{ fontFamily: MONO }}>if()</code>-guarded rules are opaque today, so no shipping{" "}
        <code style={{ fontFamily: MONO }}>sil_ipa</code> rule reaches it yet. No survey phase elicits
        it end-to-end yet — that half remains deferred.
      </p>

      <DefaultFillProvenance axisFills={axisFills} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default-fill provenance (#890) — read-only view of the §7.2 script-class
// default-fill prior's most recent output. Populated by MechanismGallery's
// pattern-loading effect via defaultFillAxes() + setAxisFills(), threaded down
// through StudioShell -> DashboardView -> here as a prop (no stores/ import in
// this file — dashboard-layer boundary); this view does no computation of its
// own, matching the "no logic of its own" contract the rest of this file
// already follows for the rule tables.
// ---------------------------------------------------------------------------

function DefaultFillProvenance({ axisFills }: { axisFills: AxisFill[] | undefined }) {
  if (axisFills === undefined || axisFills.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 24 }}>
      <h3
        style={{
          fontSize: 13,
          color: "#6ea8fe",
          margin: "0 0 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        Default-filled axes (script-class prior)
      </h3>
      <p style={{ fontSize: 11.5, color: "#8b949e", margin: "0 0 8px", fontFamily: SANS }}>
        These phase-gated axes were not elicited by the survey — the §7.2 script-class prior
        filled them with the unmarked/off-state value (never a rule-triggering one) before{" "}
        <code style={{ fontFamily: MONO, color: "#adbac7" }}>selectStrategy()</code> ran.
        Read-only for now; confirm/override UI is a follow-up.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {axisFills.map((f) => (
          <div
            key={String(f.axis)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 12px",
              background: "#11161d",
              border: "1px solid #21262d",
              borderRadius: 6,
              fontFamily: MONO,
              fontSize: 12,
            }}
          >
            <span style={{ color: "#e3b341" }}>{String(f.axis)}</span>
            <span style={{ color: "#6e7681" }}>→</span>
            <span style={{ color: "#adbac7" }}>{JSON.stringify(f.value)}</span>
            <span style={{ marginLeft: "auto", color: "#6e7681", fontSize: 11 }}>{f.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
