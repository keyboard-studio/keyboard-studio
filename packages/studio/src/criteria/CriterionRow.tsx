// CriterionRow — one criterion on the criteria page (spec 084, T4.1).
//
// Collapsed by default and expandable to its evidence, mirroring
// DecisionEntryRow: the row is handed a lazy evidence resolver, not a
// prebuilt model, so mounting all 149 rows computes nothing beyond the
// statuses and counts the resolver already produced (plan D9) —
// `row.evidence()` is called only while the row is expanded.
//
// Everything the row can do was decided by the resolver: the status it
// shows and the control it offers (`controls`) arrive on the row; this
// component never derives a status and never invents a control. The
// attestation / confirmation controls render only in authored mode with
// the host's callbacks present — foreign mode passes no callbacks, so a
// foreign row is read-only by construction, not by a hidden branch.
//
// No internal identifier renders outside the expanded evidence: the
// criterion id, its survey question id, and its band name never appear;
// the sole deliberate exception is the `lintRuleId`, shown inside the
// expanded evidence only, for traceability (plan §6).

import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { resolveContentString, slugifyIdSegment } from "../lib/contentI18n.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";
import type {
  AttestationAnswer,
  CriteriaMode,
  CriterionStatus,
  EvidenceModel,
  ResolvedRow,
} from "./criteriaTypes.ts";

export interface CriterionRowProps {
  row: ResolvedRow;
  mode: CriteriaMode;
  onAttest?: (criterionId: string, answer: AttestationAnswer) => void;
  onClearAttestation?: (criterionId: string) => void;
  onConfirm?: (criterionId: string) => void;
  onUnconfirm?: (criterionId: string) => void;
}

/**
 * A status as author-facing prose — one explicit arm per status, so a new
 * status cannot be absorbed into a trailing default and rendered with
 * another status's name. Shared with CriteriaSummary so the header and
 * the rows can never call the same status two different things.
 */
export function criterionStatusLabel(status: CriterionStatus, i18n: I18n): string {
  switch (status) {
    case "met":
      return resolveMessage(i18n, msg({ id: "criteria.status.met", message: "Met" }));
    case "not-met":
      return resolveMessage(i18n, msg({ id: "criteria.status.notMet", message: "Not met" }));
    case "not-applicable":
      return resolveMessage(
        i18n,
        msg({ id: "criteria.status.notApplicable", message: "Not applicable" }),
      );
    case "needs-author":
      return resolveMessage(
        i18n,
        msg({ id: "criteria.status.needsAuthor", message: "Needs author" }),
      );
    case "needs-human":
      return resolveMessage(
        i18n,
        msg({ id: "criteria.status.needsHuman", message: "Needs human" }),
      );
    case "not-yet-checkable":
      return resolveMessage(
        i18n,
        msg({ id: "criteria.status.notYetCheckable", message: "Not yet checkable" }),
      );
    default: {
      const _exhaustive: never = status;
      return String(_exhaustive);
    }
  }
}

const rowStyle: React.CSSProperties = {
  borderBottom: `1px solid ${BORDER}`,
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: FONT,
  listStyle: "none",
};

const expandButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: ACCENT,
  cursor: "pointer",
  padding: 0,
  fontSize: 12,
  textDecoration: "underline",
};

const controlButtonStyle: React.CSSProperties = {
  background: "none",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  color: ACCENT,
  cursor: "pointer",
  padding: "2px 8px",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const evidenceLineStyle: React.CSSProperties = { margin: "0 0 4px", color: TEXT_DIM };

export function CriterionRow({
  row,
  mode,
  onAttest,
  onClearAttestation,
  onConfirm,
  onUnconfirm,
}: CriterionRowProps) {
  const { t, i18n } = useLingui();
  const [expanded, setExpanded] = useState(false);

  const criterion = row.criterion;
  const description = resolveContentString(
    "criteria",
    criterion.id,
    "description",
    criterion.description,
    i18n,
  );

  // Lazy evidence (D9): the resolver closure runs only while expanded.
  const evidence = expanded ? row.evidence() : null;

  // Derived from the criterion id (unique per row), never rendered as
  // text — an `id` attribute is not author-facing content. Wires the
  // disclosure button's `aria-controls` to the region it reveals.
  const evidenceRegionId = `criteria-row-evidence-${slugifyIdSegment(criterion.id)}`;

  const evidenceLines = (model: EvidenceModel): React.ReactNode => (
    <>
      {model.lines.map((line, index) => (
        <p key={index} style={evidenceLineStyle}>
          {line}
        </p>
      ))}
    </>
  );

  // The check that produced a layer-c verdict, named inside the evidence
  // only — the one identifier the page deliberately shows (plan §6).
  const evidenceCheckLine = (model: EvidenceModel): React.ReactNode => {
    if (model.lintRuleId === undefined) return null;
    const lintRuleId = model.lintRuleId;
    return (
      <p style={evidenceLineStyle} data-testid="criteria-evidence-check">
        {t({ id: "criteria.evidence.check", message: `Check: ${lintRuleId}` })}
      </p>
    );
  };

  // One explicit arm per evidence kind. The lint arms additionally name
  // the check that ran; every other kind is its lines alone.
  const evidenceBody = (model: EvidenceModel): React.ReactNode => {
    switch (model.kind) {
      case "scaffolder":
        return evidenceLines(model);
      case "foreign-bake":
        return evidenceLines(model);
      case "not-applicable":
        return evidenceLines(model);
      case "needs-author":
        return evidenceLines(model);
      case "attested":
        return evidenceLines(model);
      case "needs-human":
        return evidenceLines(model);
      case "confirmed":
        return evidenceLines(model);
      case "lint-pass":
        return (
          <>
            {evidenceLines(model)}
            {evidenceCheckLine(model)}
          </>
        );
      case "lint-finding":
        return (
          <>
            {evidenceLines(model)}
            {evidenceCheckLine(model)}
          </>
        );
      case "not-implemented":
        return (
          <>
            {evidenceLines(model)}
            {evidenceCheckLine(model)}
          </>
        );
      case "context-missing":
        return (
          <>
            {evidenceLines(model)}
            {evidenceCheckLine(model)}
          </>
        );
      case "precertified":
        return (
          <>
            {evidenceLines(model)}
            {evidenceCheckLine(model)}
          </>
        );
      case "compile":
        return (
          <>
            {evidenceLines(model)}
            {evidenceCheckLine(model)}
          </>
        );
      default: {
        const _exhaustive: never = model.kind;
        return String(_exhaustive);
      }
    }
  };

  const showAttestControls =
    row.controls === "attest" && mode === "authored" && onAttest !== undefined;
  const showConfirmControls =
    row.controls === "confirm" &&
    mode === "authored" &&
    (onConfirm !== undefined || onUnconfirm !== undefined);

  return (
    <li style={rowStyle} data-testid="criteria-row" data-status={row.status}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ flex: 1, minWidth: 0 }} data-testid="criteria-row-description">
          {description}
        </span>
        <span
          data-testid="criteria-row-status"
          style={{ fontSize: 11, color: TEXT_DIM, whiteSpace: "nowrap" }}
        >
          {criterionStatusLabel(row.status, i18n)}
        </span>
        <button
          type="button"
          data-testid="criteria-row-expand"
          style={expandButtonStyle}
          aria-expanded={expanded}
          aria-controls={evidenceRegionId}
          onClick={() => setExpanded((prev) => !prev)}
        >
          {expanded
            ? t({ id: "criteria.row.hideDetails", message: "Hide details" })
            : t({ id: "criteria.row.showDetails", message: "Show details" })}
        </button>
      </div>

      {expanded && evidence !== null && (
        <div data-testid="criteria-row-evidence" id={evidenceRegionId} style={{ marginTop: 4 }}>
          {evidenceBody(evidence)}

          {showAttestControls && (
            <div
              data-testid="criteria-attest-controls"
              style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}
            >
              <span style={{ fontSize: 12, color: TEXT_DIM }}>
                {t({
                  id: "criteria.attest.prompt",
                  message: "Does this hold for your keyboard?",
                })}
              </span>
              <button
                type="button"
                data-testid="criteria-attest-yes"
                style={controlButtonStyle}
                onClick={() => onAttest(criterion.id, "yes")}
              >
                {t({ id: "criteria.attest.yes", message: "Yes" })}
              </button>
              <button
                type="button"
                data-testid="criteria-attest-no"
                style={controlButtonStyle}
                onClick={() => onAttest(criterion.id, "no")}
              >
                {t({ id: "criteria.attest.no", message: "No" })}
              </button>
              <button
                type="button"
                data-testid="criteria-attest-not-applicable"
                style={controlButtonStyle}
                onClick={() => onAttest(criterion.id, "not-applicable")}
              >
                {t({ id: "criteria.attest.notApplicable", message: "Not applicable" })}
              </button>
              {evidence.kind === "attested" && onClearAttestation !== undefined && (
                <button
                  type="button"
                  data-testid="criteria-attest-clear"
                  style={controlButtonStyle}
                  onClick={() => onClearAttestation(criterion.id)}
                >
                  {t({ id: "criteria.attest.clear", message: "Clear answer" })}
                </button>
              )}
            </div>
          )}

          {showConfirmControls &&
            (evidence.kind === "confirmed" ? (
              onUnconfirm !== undefined && (
                <div data-testid="criteria-confirm-controls" style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    data-testid="criteria-confirm-unconfirm"
                    style={controlButtonStyle}
                    onClick={() => onUnconfirm(criterion.id)}
                  >
                    {t({ id: "criteria.confirm.unconfirm", message: "Unconfirm" })}
                  </button>
                </div>
              )
            ) : (
              onConfirm !== undefined && (
                <div data-testid="criteria-confirm-controls" style={{ marginTop: 4 }}>
                  <button
                    type="button"
                    data-testid="criteria-confirm"
                    style={controlButtonStyle}
                    onClick={() => onConfirm(criterion.id)}
                  >
                    {t({ id: "criteria.confirm.confirm", message: "Confirm" })}
                  </button>
                </div>
              )
            ))}
        </div>
      )}
    </li>
  );
}
