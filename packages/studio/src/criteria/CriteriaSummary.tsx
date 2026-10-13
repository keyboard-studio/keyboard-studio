// CriteriaSummary — the criteria page's summary header (spec 084, T4.1).
//
// Every number here comes from the resolver result the page was handed —
// tallied from the same rows rendered below, in the same pass (plan §4) —
// so the header can never disagree with the list. Nothing is recomputed
// from the rows here, and nothing is derived from the catalog directly.
//
// Absences are statements, in the trail's manner: the not-yet-checkable
// count gets its own notice line naming why those criteria have no
// verdict yet, rather than a bare number in the breakdown.

import { useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";

import { BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";
import type { CriteriaResult, CriterionStatus } from "./criteriaTypes.ts";
import { criterionStatusLabel } from "./CriterionRow.tsx";

const ALL_STATUSES: readonly CriterionStatus[] = [
  "met",
  "not-met",
  "not-applicable",
  "needs-author",
  "needs-human",
  "not-yet-checkable",
];

const noticeStyle: React.CSSProperties = {
  margin: "0 0 12px",
  padding: "8px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontSize: 13,
  color: TEXT_DIM,
};

export interface CriteriaSummaryProps {
  result: CriteriaResult;
}

export function CriteriaSummary({ result }: CriteriaSummaryProps) {
  const { t, i18n } = useLingui();

  const resolved = result.resolvedCount;
  const total = result.total;
  const notYetCheckable = result.counts["not-yet-checkable"];

  return (
    <div data-testid="criteria-summary" style={{ fontFamily: FONT }}>
      <p data-testid="criteria-summary-resolved" style={{ margin: "0 0 8px", fontSize: 13 }}>
        {t({
          id: "criteria.summary.resolved",
          message: `${resolved} of ${total} criteria resolved`,
        })}
      </p>
      <p
        data-testid="criteria-summary-counts"
        style={{
          margin: "0 0 12px",
          fontSize: 12,
          color: TEXT_DIM,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        {ALL_STATUSES.map((status) => (
          <span key={status} data-testid={`criteria-summary-count-${status}`}>
            {criterionStatusLabel(status, i18n)}: {result.counts[status]}
          </span>
        ))}
      </p>
      {notYetCheckable > 0 && (
        <p style={noticeStyle} data-testid="criteria-summary-not-yet-checkable">
          {t({
            id: "criteria.summary.notYetCheckable",
            message: plural(notYetCheckable, {
              one: "# criterion is not yet checkable: its check is specified but not yet enforced.",
              other:
                "# criteria are not yet checkable: their checks are specified but not yet enforced.",
            }),
          })}
        </p>
      )}
    </div>
  );
}
