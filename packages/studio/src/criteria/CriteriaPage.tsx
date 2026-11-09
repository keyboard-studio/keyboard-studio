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
// Two /review presentation pieces live here, not in the hosts, so both
// report surfaces show the same list: the file-inventory tree above the
// list (when the host passes `fileTree`) and the severity filter
// (when the host passes `severityMap`). A host that passes neither gets
// the plain page — the Compare panel today. The filter's labels reuse
// the /review message ids: same words, same translations, one source.
//
// Rows are grouped by catalog section, in the order the resolver emitted
// them (consecutive rows sharing a section form one group), except that
// Not applicable rows — inactive for this keyboard — move to the bottom
// of the list, still grouped under their sections. Section headings and criterion descriptions
// are Tier B content, resolved through contentI18n against the live
// locale; the chrome (title, statuses, controls) is Tier A Lingui.

import { Fragment, useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";

import type { Criterion } from "@keyboard-studio/contracts";
import { resolveContentString } from "../lib/contentI18n.ts";
import { FileTree } from "../review/FileTree.tsx";
import type { FileTreeNode } from "../review/fileTree.ts";
import {
  ACCENT,
  BG_CARD,
  BG_INSET,
  BORDER,
  ERROR_TEXT,
  FONT,
  SUCCESS_ACCENT,
  TEXT_DIM,
  WARNING,
} from "../ui/theme.ts";
import type {
  AttestationAnswer,
  CriteriaMode,
  CriteriaResult,
  CriterionStatus,
  ResolvedRow,
} from "./criteriaTypes.ts";
import { CriteriaSummary } from "./CriteriaSummary.tsx";
import { CriterionRow } from "./CriterionRow.tsx";
import type { GithubLink } from "./githubLink.ts";
import type { ReviewNote } from "@keyboard-studio/contracts";
import {
  classifyKey,
  classifyRow,
  findingKeysOf,
  type OpenBaseline,
} from "./openRatchet.ts";
import { ReviewNoteEditor } from "./ReviewNoteEditor.tsx";
import { ReportBanner } from "./ReportBanner.tsx";

/** The report-banner props a host passes when the page should open
 * with the dark-blue banner card instead of the plain "Criteria"
 * heading (the authored page; /review keeps its own banner above the
 * page and the plain heading inside it). */
export interface CriteriaBanner {
  /** Small mono line above the title (the product name on the
   * Criteria page). */
  eyebrow: React.ReactNode;
  /** The report title. */
  title: React.ReactNode;
  /** One meta line under the title, when the host has one to state. */
  meta?: string;
}

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
  githubLink?: GithubLink | null;
  /**
   * Optional per-criterion severity override ("met" | "warning" |
   * "error"), keyed by criterion id. When present, the row's status
   * label is color-coded by severity AND the page offers the severity
   * filter (All / Met / Warnings / Errors) with per-severity counts:
   * "hidden" rows never render, rows with no entry render only under
   * "All", and the summary counts the rows actually shown — the same
   * filter the /review report used to own. Absent, the page renders
   * every row with no filter, as before.
   */
  severityMap?: Record<string, "met" | "warning" | "error" | "hidden">;
  /**
   * Open mode (spec 111, US2): marks each failing row pre-existing or new
   * against the baseline taken at open, and offers a review note on each
   * new failure. Absent on Copy and in foreign mode, so those pages are
   * unchanged.
   */
  openRatchet?: {
    baseline: OpenBaseline;
    notes: readonly ReviewNote[];
    onSaveNote: (key: ReviewNote["key"], criterionId: string, text: string) => void;
    onRemoveNote: (key: ReviewNote["key"]) => void;
    /** Takes the author to where the failing row can be fixed. */
    onOpenEditor?: (criterionId: string) => void;
  };
  /**
   * The judged keyboard's file-inventory tree (required files with
   * placement status, optionals, others). When present, rendered above
   * the list — the same inventory the /review report shows. Absent, no
   * inventory renders (the Compare panel today).
   */
  fileTree?: FileTreeNode[];
  /**
   * The report banner. When present, it replaces the plain heading
   * block (title, keyboard line, judged note) at the top of the page —
   * the banner's meta carries what those lines stated. Absent, the
   * plain heading renders as before.
   */
  banner?: CriteriaBanner;
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

type SeverityFilter = "all" | "met" | "warning" | "error";

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
  openRatchet,
  fileTree,
  banner,
}: CriteriaPageProps) {
  const { t, i18n } = useLingui();
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>("all");

  // The severity filter, when the host passes a severity map: counts
  // come from the map over the full result, and the displayed rows are
  // the map's rows for the chosen severity — "hidden" rows never render,
  // rows with no map entry render only under "All". Without a map there
  // is no filter and every row renders, as before. The summary counts
  // the rows actually shown — tallied from them in this same pass, so
  // the header can never disagree with the list below it.
  const { displayResult, severityCounts } = useMemo(() => {
    if (severityMap === undefined) {
      return { displayResult: result, severityCounts: null };
    }
    const counts = { met: 0, warning: 0, error: 0 };
    for (const row of result.rows) {
      const s = severityMap[row.criterion.id];
      if (s === "met") counts.met++;
      else if (s === "warning") counts.warning++;
      else if (s === "error") counts.error++;
    }
    const kept = result.rows.filter((r) => {
      const s = severityMap[r.criterion.id];
      if (s === "hidden") return false;
      if (severityFilter === "all") return true;
      return s === severityFilter;
    });
    const statusCounts: Record<CriterionStatus, number> = {
      met: 0,
      "not-met": 0,
      "not-applicable": 0,
      "needs-author": 0,
      "needs-human": 0,
      "not-yet-checkable": 0,
    };
    const bandCounts: Record<
      Criterion["band"],
      Record<CriterionStatus, number>
    > = {
      "scaffolder-bake": { ...statusCounts },
      "layer-c-enforce": { ...statusCounts },
      "yellow-survey": { ...statusCounts },
      "red-checklist": { ...statusCounts },
    };
    let resolved = 0;
    for (const row of kept) {
      statusCounts[row.status] += 1;
      bandCounts[row.criterion.band][row.status] += 1;
      if (
        row.status === "met" ||
        row.status === "not-met" ||
        row.status === "not-applicable"
      ) {
        resolved += 1;
      }
    }
    return {
      displayResult: {
        ...result,
        rows: kept,
        total: kept.length,
        resolvedCount: resolved,
        counts: statusCounts,
        bandCounts,
      },
      severityCounts: counts,
    };
  }, [result, severityMap, severityFilter]);

  const groups = groupBySection([
    ...displayResult.rows.filter((r) => r.status !== "not-applicable"),
    ...displayResult.rows.filter((r) => r.status === "not-applicable"),
  ]);

  const keyboard = keyboardLabel;

  return (
    <div style={containerStyle} data-testid="criteria-page">
      {banner !== undefined ? (
        <div style={{ marginBottom: 12 }}>
          <ReportBanner
            eyebrow={banner.eyebrow}
            title={banner.title}
            {...(banner.meta !== undefined ? { meta: banner.meta } : {})}
          />
        </div>
      ) : (
        <>
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
        </>
      )}

      {fileTree !== undefined && <FileTree tree={fileTree} />}

      {severityMap !== undefined && severityCounts !== null && (
        <div
          role="group"
          aria-label={t({ id: "review.report.severityFilter", message: "Filter results by severity" })}
          data-testid="criteria-severity-filter"
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          {(
            [
              {
                key: "all",
                label: t({ id: "review.report.filterAll", message: "All" }),
                color: "var(--app-text)",
              },
              {
                key: "met",
                label: t({
                  id: "review.report.filterMet",
                  message: `✓ ${severityCounts.met} met`,
                }),
                color: SUCCESS_ACCENT,
              },
              {
                key: "warning",
                label: t({
                  id: "review.report.filterWarnings",
                  message: `⚠ ${severityCounts.warning} warnings`,
                }),
                color: WARNING,
              },
              {
                key: "error",
                label: t({
                  id: "review.report.filterErrors",
                  message: `✖ ${severityCounts.error} errors`,
                }),
                color: ERROR_TEXT,
              },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setSeverityFilter(f.key)}
              aria-pressed={severityFilter === f.key}
              style={{
                background:
                  severityFilter === f.key ? BG_INSET : BG_CARD,
                color: f.color,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "8px 14px",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: severityFilter === f.key ? 700 : 600,
                fontFamily: FONT,
                outline:
                  severityFilter === f.key
                    ? `2px solid ${f.color}`
                    : undefined,
                outlineOffset: 1,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {result.expectedCoverage !== undefined && (
        <p data-testid="criteria-expected-coverage" style={{ margin: "0 0 8px", fontSize: 13, color: TEXT_DIM }}>
          <Trans id="criteria.expectedCoverage">
            Expected characters come from the exemplars of the listed languages:{" "}
            {result.expectedCoverage.withData} of {result.expectedCoverage.total} had exemplar data.
          </Trans>
        </p>
      )}

      <CriteriaSummary result={displayResult} />

      <ul style={listStyle}>
        {groups.map((group, groupIndex) => {
          const sectionHeading = resolveContentString(
            "criteria",
            group.firstRow.criterion.id,
            "section",
            group.firstRow.criterion.section,
            i18n,
          );
          return (
            <li
              // A section can appear twice: once active, once in the trailing Not applicable run.
              key={`${groupIndex}:${group.section}`}
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
                  <Fragment key={row.criterion.id}>
                  <CriterionRow
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
                  {openRatchet !== undefined && (
                    <OpenRatchetMark row={row} ratchet={openRatchet} />
                  )}
                  </Fragment>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The pre-existing / new mark under a failing row, with note editors for new failures. */
function OpenRatchetMark({
  row,
  ratchet,
}: {
  row: ResolvedRow;
  ratchet: NonNullable<CriteriaPageProps["openRatchet"]>;
}) {
  const cls = classifyRow(row, ratchet.baseline);
  if (cls === null) return null;
  const newKeys =
    cls === "new"
      ? findingKeysOf(row).filter((k) => classifyKey(k, ratchet.baseline) === "new")
      : [];
  return (
    <li
      style={{ listStyle: "none", margin: "0 0 8px", padding: "0 0 0 12px", fontSize: 12 }}
      data-testid={`criteria-open-mark-${row.criterion.id}`}
      data-finding-class={cls}
    >
      <strong style={{ color: cls === "new" ? "var(--app-danger-text)" : TEXT_DIM }}>
        {cls === "new" ? (
          <Trans id="criteria.open.mark.new">New in this update</Trans>
        ) : (
          <Trans id="criteria.open.mark.preExisting">Already failing before this update</Trans>
        )}
      </strong>
      {ratchet.onOpenEditor !== undefined && (
        <>
          {" "}
          <button type="button" onClick={() => ratchet.onOpenEditor?.(row.criterion.id)}>
            <Trans id="criteria.open.goToEditor">Go to the editor</Trans>
          </button>
        </>
      )}
      {newKeys.map((key) => {
        const saved = ratchet.notes.find((n) => n.key === key);
        const file = key.slice(key.indexOf(":") + 1);
        return (
          <ReviewNoteEditor
            key={key}
            fileLabel={file}
            text={saved?.text}
            onSave={(text) => ratchet.onSaveNote(key, row.criterion.id, text)}
            onRemove={() => ratchet.onRemoveNote(key)}
          />
        );
      })}
    </li>
  );
}
