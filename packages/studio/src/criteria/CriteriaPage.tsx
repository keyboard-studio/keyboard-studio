// CriteriaPage — the criteria compliance page (spec 084, T4.1).
//
// One presentation for both surfaces (plan D2): the authored route and
// the Compare tab's foreign panel render this same component from a
// CriteriaResult; only the props differ. It takes plain props only — no
// store imports, no store-reading hooks — in the DecisionTrailView
// contract (plan D8): the host assembles the result and the record
// callbacks and passes them down, so this page can be rendered against a
// fixture in tests.
//
// Rows are grouped by catalog section, in the order the resolver emitted
// them (consecutive rows sharing a section form one group) — group order
// is never re-sorted here. Section headings and criterion descriptions
// are Tier B content, resolved through contentI18n against the live
// locale; the chrome (title, statuses, controls) is Tier A Lingui.

import { Trans, useLingui } from "@lingui/react/macro";

import { resolveContentString } from "../lib/contentI18n.ts";
import { ACCENT, BORDER, FONT, TEXT_DIM } from "../ui/theme.ts";
import type {
  AttestationAnswer,
  CriteriaMode,
  CriteriaResult,
  ResolvedRow,
} from "./criteriaTypes.ts";
import { CriteriaSummary } from "./CriteriaSummary.tsx";
import { CriterionRow } from "./CriterionRow.tsx";

export interface CriteriaPageProps {
  result: CriteriaResult;
  mode: CriteriaMode;
  /** The judged keyboard's label, when the host has one to name. */
  keyboardLabel?: string;
  onAttest?: (criterionId: string, answer: AttestationAnswer) => void;
  onClearAttestation?: (criterionId: string) => void;
  onConfirm?: (criterionId: string) => void;
  onUnconfirm?: (criterionId: string) => void;
  /** §12.3 (Batch 3): the contrastive-region attestation controls. */
  onAttestContrastive?: () => void;
  onClearContrastive?: () => void;
  /** §§9.1/9.2 (Batch 5): the per-font license attestation controls. */
  onAttestFontLicense?: (
    fontName: string,
    license: string,
    openConfirmed: boolean,
  ) => void;
  onClearFontLicense?: (fontName: string) => void;
  /** A statement of what was judged (e.g. the preview caveat in foreign mode). */
  judgedNote?: string;
  /**
   * GitHub link context for the /review report: when present, "File: <path>"
   * evidence lines become links to the file at the pinned sha (open in new tab).
   */
  githubLink?: { owner: string; repo: string; sha: string } | null;
  /**
   * Optional per-criterion severity override for the /review report
   * ("met" | "warning" | "error"), keyed by criterion id. When present,
   * the row's status label is color-coded by severity.
   */
  severityMap?: Record<string, "met" | "warning" | "error" | "hidden">;
}

const containerStyle: React.CSSProperties = {
  padding: 24,
  fontFamily: FONT,
  color: "var(--app-text)",
  height: "100%",
  overflowY: "auto",
  boxSizing: "border-box",
};

const noticeStyle: React.CSSProperties = {
  margin: "0 0 12px",
  padding: "8px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
  fontSize: 13,
  color: TEXT_DIM,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  border: `1px solid ${BORDER}`,
  borderRadius: 4,
};

const sectionGroupStyle: React.CSSProperties = {
  borderBottom: `1px solid ${BORDER}`,
  padding: "8px 12px",
  listStyle: "none",
};

const sectionRowsStyle: React.CSSProperties = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
};

interface SectionGroup {
  /** The catalog section string, kept for grouping identity only — never rendered raw. */
  section: string;
  /** The group's first row; its criterion carries the Tier B section text. */
  firstRow: ResolvedRow;
  rows: ResolvedRow[];
}

/** Group consecutive rows by catalog section, preserving resolver order. */
function groupBySection(rows: readonly ResolvedRow[]): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const row of rows) {
    const last = groups.length > 0 ? groups[groups.length - 1] : undefined;
    if (last !== undefined && last.section === row.criterion.section) {
      last.rows.push(row);
    } else {
      groups.push({ section: row.criterion.section, firstRow: row, rows: [row] });
    }
  }
  return groups;
}

export function CriteriaPage({
  result,
  mode,
  keyboardLabel,
  onAttest,
  onClearAttestation,
  onConfirm,
  onUnconfirm,
  onAttestContrastive,
  onClearContrastive,
  onAttestFontLicense,
  onClearFontLicense,
  judgedNote,
  githubLink,
  severityMap,
}: CriteriaPageProps) {
  const { t, i18n } = useLingui();
  const groups = groupBySection(result.rows);

  const keyboard = keyboardLabel;

  return (
    <div style={containerStyle} data-testid="criteria-page">
      <h2 style={{ margin: "0 0 12px", fontSize: "1.1rem", color: ACCENT }}>
        <Trans id="criteria.title">Criteria</Trans>
      </h2>

      {keyboard !== undefined && (
        <p data-testid="criteria-keyboard" style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          {t({ id: "criteria.keyboard", message: `Keyboard: ${keyboard}` })}
        </p>
      )}

      {judgedNote !== undefined && (
        <p style={noticeStyle} data-testid="criteria-judged-note">
          {judgedNote}
        </p>
      )}

      <CriteriaSummary result={result} />

      <ul style={listStyle}>
        {groups.map((group) => {
          const sectionHeading = resolveContentString(
            "criteria",
            group.firstRow.criterion.id,
            "section",
            group.firstRow.criterion.section,
            i18n,
          );
          return (
            <li
              key={group.section}
              style={sectionGroupStyle}
              data-testid="criteria-section-group"
            >
              <h3
                data-testid="criteria-section-heading"
                style={{ margin: 0, fontSize: 14 }}
              >
                {sectionHeading}
              </h3>
              <ul style={sectionRowsStyle}>
                {group.rows.map((row) => (
                  <CriterionRow
                    key={row.criterion.id}
                    row={row}
                    mode={mode}
                    {...(severityMap?.[row.criterion.id] !== undefined
                      ? { severity: severityMap[row.criterion.id] }
                      : {})}
                    {...(onAttest !== undefined ? { onAttest } : {})}
                    {...(onClearAttestation !== undefined ? { onClearAttestation } : {})}
                    {...(onConfirm !== undefined ? { onConfirm } : {})}
                    {...(onUnconfirm !== undefined ? { onUnconfirm } : {})}
                    {...(onAttestContrastive !== undefined ? { onAttestContrastive } : {})}
                    {...(onClearContrastive !== undefined ? { onClearContrastive } : {})}
                    {...(onAttestFontLicense !== undefined ? { onAttestFontLicense } : {})}
                    {...(onClearFontLicense !== undefined ? { onClearFontLicense } : {})}
                    {...(githubLink !== undefined ? { githubLink } : {})}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
