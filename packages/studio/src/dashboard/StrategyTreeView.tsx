// Render the §7.2 strategy decision tree from the engine's exported rule tables.
//
// PRIMARY_RULES / SECONDARY_RULES / STRATEGY_LABELS ARE the data selectStrategy()
// runs (see packages/engine/src/strategy-selector/rules.ts) — this view executes
// no logic of its own, so it can never drift from the selector. The primary
// pass is a first-match-wins waterfall; the secondary passes always run.

import { Trans } from "@lingui/react/macro";
import {
  PRIMARY_RULES,
  SECONDARY_RULES,
  STRATEGY_LABELS,
  type ConditionalSecondary,
} from "@keyboard-studio/engine";
import type { AxisFill, StrategyId } from "@keyboard-studio/contracts";
import { MONO, SANS, COLORS } from "./tokens.tsx";

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
        background: primary ? COLORS.blue.dark : COLORS.gray.border,
        color: primary ? "#fff" : COLORS.gray.textMuted,
        border: `1px solid ${primary ? "#388bfd" : COLORS.gray.borderStrong}`,
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
      <span style={{ color: COLORS.gray.textVeryDim, fontFamily: MONO, fontSize: 12 }}>
        +
      </span>
      <StrategyChip id={sec.strategy} kind="secondary" />
      {sec.whenText !== undefined && (
        <span style={{ color: COLORS.gray.textDim, fontSize: 11, fontFamily: MONO }}>
          <Trans id="dashboard.strategyTree.secondaryChip.if">if {sec.whenText}</Trans>
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
    <div style={{ fontFamily: SANS, color: COLORS.gray.text, maxWidth: 920 }}>
      <p style={{ fontSize: 13, color: COLORS.gray.textDim, margin: "0 0 16px" }}>
        <Trans id="dashboard.strategyTree.intro">
          The survey computes a seven-axis vector (A1–A7), then{" "}
          <code style={{ fontFamily: MONO, color: COLORS.gray.textMuted }}>
            {"selectStrategy()"}
          </code>{" "}
          runs this tree. Primary rules are tried top-to-bottom; the first match
          fixes the primary strategy. The secondary passes then always run,
          appending add-ons.
        </Trans>
      </p>

      <h3
        style={{
          fontSize: 13,
          color: COLORS.blue.base,
          margin: "0 0 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <Trans id="dashboard.strategyTree.primaryPass.heading">Primary pass — first match wins</Trans>
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
                background: COLORS.gray.bgPanel,
                border: `1px solid ${COLORS.gray.border}`,
                borderRadius: 7,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  color: "#fff",
                  background: COLORS.gray.borderStrong,
                  borderRadius: 4,
                  padding: "2px 8px",
                  minWidth: 56,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                }}
              >
                <Trans id="dashboard.strategyTree.rule.label">Rule {r.rule}</Trans>
              </span>
              <code
                style={{
                  fontFamily: MONO,
                  fontSize: 12.5,
                  color: COLORS.amber.base,
                  flex: 1,
                  minWidth: 220,
                }}
              >
                {r.conditionText}
              </code>
              <span style={{ color: COLORS.gray.textVeryDim }}>→</span>
              <StrategyChip id={r.primary} kind="primary" />
              {r.secondaries.map((sec) => (
                <SecondaryChip key={sec.strategy} sec={sec} />
              ))}
            </div>
            {i < PRIMARY_RULES.length - 1 && (
              <div
                style={{
                  paddingLeft: 22,
                  color: COLORS.gray.textVeryDim,
                  fontSize: 11,
                  fontFamily: MONO,
                  lineHeight: "18px",
                }}
              >
                <Trans id="dashboard.strategyTree.rule.else">else ↓</Trans>
              </div>
            )}
          </div>
        ))}
      </div>

      <h3
        style={{
          fontSize: 13,
          color: COLORS.blue.base,
          margin: "24px 0 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <Trans id="dashboard.strategyTree.secondaryPass.heading">Secondary passes — always run, in order</Trans>
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
              background: COLORS.gray.bgPanel,
              border: `1px solid ${COLORS.gray.border}`,
              borderRadius: 7,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: COLORS.gray.textMuted,
                background: COLORS.gray.border,
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
                color: COLORS.amber.base,
                flex: 1,
                minWidth: 220,
              }}
            >
              {sr.conditionText}
            </code>
            <span style={{ color: COLORS.gray.textVeryDim }}>
              <Trans id="dashboard.strategyTree.secondaryPass.addArrow">→ add</Trans>
            </span>
            <StrategyChip id={sr.add} kind="secondary" />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11.5, color: COLORS.gray.textVeryDim, margin: "16px 0 0", fontFamily: SANS }}>
        <Trans id="dashboard.strategyTree.postfixNote">
          Note: rule 3a (postfix-preference intercept → {"S-03"}, shown above between rules 3 and 4) is
          implemented in <code style={{ fontFamily: MONO }}>{"selectStrategy()"}</code>. When a base is
          instantiated (either track), its IR is scanned for the unconditional postfix
          sequence-replace shape and{" "}
          <code style={{ fontFamily: MONO }}>{'markInputOrder="postfix"'}</code> is seeded onto{" "}
          <code style={{ fontFamily: MONO }}>{"irAxes"}</code>{" "}
          (<code style={{ fontFamily: MONO }}>{'source: "import-derived"'}</code> below), so rule
          3a now fires live for such a base — though{" "}
          <code style={{ fontFamily: MONO }}>{"if()"}</code>-guarded rules are still opaque, so no shipping{" "}
          <code style={{ fontFamily: MONO }}>{"sil_ipa"}</code> rule reaches it yet. No survey phase elicits
          it end-to-end yet — that half remains deferred.
        </Trans>
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
          color: COLORS.blue.base,
          margin: "0 0 8px",
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        <Trans id="dashboard.strategyTree.prefilledAxes.heading">Pre-filled axes (not survey-elicited)</Trans>
      </h3>
      <p style={{ fontSize: 11.5, color: COLORS.gray.textDim, margin: "0 0 8px", fontFamily: SANS }}>
        <Trans id="dashboard.strategyTree.prefilledAxes.description">
          These phase-gated axes were not elicited by the survey. Each was supplied either by the §7.2
          script-class prior (the unmarked/off-state value, never rule-triggering) or derived from
          structural evidence in the base keyboard (which <em>can</em> be rule-triggering, e.g.{" "}
          <code style={{ fontFamily: MONO, color: COLORS.gray.textMuted }}>
            {'markInputOrder="postfix"'}
          </code>{" "}
          → rule 3a) — the source is shown on each row. Filled before{" "}
          <code style={{ fontFamily: MONO, color: COLORS.gray.textMuted }}>{"selectStrategy()"}</code> ran.
          Read-only for now; confirm/override UI is a follow-up.
        </Trans>
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
              background: COLORS.gray.bgPanel,
              border: `1px solid ${COLORS.gray.border}`,
              borderRadius: 6,
              fontFamily: MONO,
              fontSize: 12,
            }}
          >
            <span style={{ color: COLORS.amber.base }}>{String(f.axis)}</span>
            <span style={{ color: COLORS.gray.textVeryDim }}>→</span>
            <span style={{ color: COLORS.gray.textMuted }}>{JSON.stringify(f.value)}</span>
            <span style={{ marginLeft: "auto", color: COLORS.gray.textVeryDim, fontSize: 11 }}>{f.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
