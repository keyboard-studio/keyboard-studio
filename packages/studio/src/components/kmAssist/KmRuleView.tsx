// KmRuleView — read-only rule card for the spec-082 rules step (Track C v1).
//
// Presents one rule three ways: syntax-highlighted KMN source, a kind badge,
// and a one-sentence plain-language explanation from the kmAssist explainer.
// This component is deliberately PRESENTATIONAL and READ-ONLY: it takes the
// highlighted spans and explanation as props and offers no editing
// affordances (no inputs, no contentEditable, no write-back path). Editable
// mode arrives behind the playground gates (spec 082 FR-012), not here.
//
// Also exports the rule-list filter contract the rules step consumes:
// RuleFilter { showPlainOutput } — plain key→output rules are hidden by
// default (DEFAULT_RULE_FILTER), per spec 082 FR-010/FR-011.

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { RuleKind, TokenSpan } from "@keyboard-studio/engine/kmAssist";
import {
  BG_CARD,
  CARD_BORDER,
  ERROR_TEXT,
  FONT_MONO,
  TEXT_DIM,
  TEXT_MAIN,
  WARNING,
} from "../../ui/theme.ts";

// ---------------------------------------------------------------------------
// Filter contract (consumed by the rules step)
// ---------------------------------------------------------------------------

/** Rule-list filter: which rule kinds the list shows. */
export interface RuleFilter {
  /** When false (the default), plain key→output rules are hidden. */
  showPlainOutput: boolean;
}

/** Default filter: plain-output rules hidden (spec 082 FR-010/FR-011). */
export const DEFAULT_RULE_FILTER: RuleFilter = { showPlainOutput: false };

/** True when a rule of this kind passes the filter. */
export function rulePassesFilter(kind: RuleKind, filter: RuleFilter): boolean {
  if (kind === "plain-output" && !filter.showPlainOutput) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface KmRuleViewProps {
  /** The rule's KMN source line (as emitted by the codec). */
  kmnText: string;
  /** Typed highlight spans tiling `kmnText` (see kmAssist `highlightRule`). */
  spans: TokenSpan[];
  /** One plain-language sentence (see kmAssist `explainRule`). */
  explanation: string;
  /** Display kind (see kmAssist `classifyRuleKind`). */
  kind: RuleKind;
  /** Optional validator diagnostics attached to this rule. */
  diagnostics?: string[];
}

const KIND_LABEL: Record<RuleKind, string> = {
  "plain-output": "Key → output",
  context: "Context rule",
  blocking: "Blocking",
  reorder: "Reorder",
  opaque: "Advanced",
};

const KIND_BADGE_COLOR: Record<RuleKind, string> = {
  "plain-output": TEXT_DIM,
  context: "#2f6fed",
  blocking: "#b3541e",
  reorder: "#7a4fd0",
  opaque: WARNING,
};

const SPAN_COLOR: Record<TokenSpan["kind"], string | undefined> = {
  "store-ref": "#2f6fed",
  key: "#b3541e",
  operator: TEXT_DIM,
  output: undefined,
  comment: TEXT_DIM,
  text: undefined,
};

export function KmRuleView({
  kmnText,
  spans,
  explanation,
  kind,
  diagnostics = [],
}: KmRuleViewProps) {
  const { t } = useLingui();
  const badgeColor = KIND_BADGE_COLOR[kind];

  return (
    <section
      aria-label={t({ id: "kmRuleView.label", message: "Keyman rule" })}
      data-testid="km-rule-view"
      data-kind={kind}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 10,
        background: BG_CARD,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          data-testid="km-rule-view-kind"
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: badgeColor,
            border: `1px solid ${badgeColor}`,
            borderRadius: 4,
            padding: "1px 6px",
          }}
        >
          {KIND_LABEL[kind]}
        </span>
        {diagnostics.length > 0 && (
          <span
            data-testid="km-rule-view-diagnostic-count"
            style={{ fontSize: 11, color: ERROR_TEXT }}
          >
            {t({
              id: "kmRuleView.diagnostics",
              message: plural(diagnostics.length, {
                one: "# issue",
                other: "# issues",
              }),
            })}
          </span>
        )}
      </div>

      {/* Read-only source: a <pre>, never a textarea — the affordance says "read". */}
      <pre
        data-testid="km-rule-view-source"
        aria-label={t({ id: "kmRuleView.sourceLabel", message: "Rule source" })}
        style={{
          margin: 0,
          padding: 8,
          overflowX: "auto",
          background: "rgba(0,0,0,0.04)",
          borderRadius: 4,
          color: TEXT_MAIN,
          fontFamily: FONT_MONO,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: "pre",
        }}
      >
        {spans.length > 0
          ? spans.map((span, i) => (
            <span
              key={i}
              data-span-kind={span.kind}
              style={
                SPAN_COLOR[span.kind] !== undefined
                  ? { color: SPAN_COLOR[span.kind] }
                  : undefined
              }
            >
              {span.text}
            </span>
          ))
          : kmnText}
      </pre>

      <p
        data-testid="km-rule-view-explanation"
        style={{ margin: 0, fontSize: 13, color: TEXT_MAIN }}
      >
        {explanation}
      </p>

      {diagnostics.length > 0 && (
        <ul
          data-testid="km-rule-view-diagnostics"
          style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: ERROR_TEXT }}
        >
          {diagnostics.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
