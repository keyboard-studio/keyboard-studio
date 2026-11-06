// ReviewReport — the /review health report.
//
// Wraps the shared CriteriaPage in foreign mode (no record callbacks: every
// foreign row carries controls: null) with the review chrome around it:
// the pinned-snapshot header, the foreign-mode honesty banner, skipped-file
// notes, and the read-only actions. The severity filter and the file
// inventory live in CriteriaPage itself (shared with the authored
// Criteria page); this host only supplies the foreign severity map and
// the tree. Nothing here can stage, adapt, or submit the keyboard —
// this screen imports no authoring store.

import { useMemo } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import { CriteriaPage } from "../criteria/CriteriaPage.tsx";
import { ReportBanner } from "../criteria/ReportBanner.tsx";
import {
  ACCENT,
  BG_CARD,
  BG_INSET,
  BORDER,
  CSS_FONT_MONO,
  FONT,
  TEXT_DIM,
} from "../ui/theme.ts";
import {
  reviewTargetLabel,
  type ReviewTarget,
} from "./reviewSources.ts";
import { hardLinkForTarget } from "./reviewLinks.ts";
import type { PrAuthorInfo } from "./useReviewIndex.ts";
import type { SkippedFile } from "./useReviewSnapshot.ts";
import {
  severityForReviewRow,
  type ReviewSeverity,
} from "./reviewSeverity.ts";

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Criterion 17.2: the new-author local-pull check. */
const NEW_AUTHOR_CRITERION_ID = "17.2-new-author-local-pull";

export function ReviewReport({
  target,
  result,
  skipped,
  judgedAt,
  authorInfo,
  onRerun,
  onBack,
}: {
  target: ReviewTarget;
  result: CriteriaResult;
  skipped: SkippedFile[];
  judgedAt: string;
  /** PR author info (PR targets only; null while loading or on API failure). */
  authorInfo: PrAuthorInfo | null;
  onRerun: () => void;
  onBack: () => void;
}) {
  const { t } = useLingui();
  // Inject the author status into 17.2's details (red-checklist rows show
  // the checklist text; for a PR we can name the author situation).
  const judgedNote = useMemo(
    () =>
      t({
        id: "review.report.judgedNote",
        message: `Judged from a read-only snapshot of ${reviewTargetLabel(target)} — the keyboard as published, unmodified.`,
      }),
    [target, t],
  );

  const shareUrl = useMemo(() => {
    // Hard-link format (see hardLinkForTarget): the report pins the judged
    // sha; the link resolves to the current head at open time.
    return window.location.origin + hardLinkForTarget(target);
  }, [target]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      window.prompt(
        t({ id: "review.report.copyLinkPrompt", message: "Copy this report link:" }),
        shareUrl,
      );
    }
  };

  const exportJson = () => {
    downloadJson(`health-check-${target.keyboardId}-${target.sha.slice(0, 7)}.json`, {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- machine-readable tool identifier in the JSON export, not UI copy
      tool: "keyboard-studio health check",
      version: 1,
      target: {
        source: target.source,
        owner: target.owner,
        repo: target.repo,
        path: target.path,
        keyboardId: target.keyboardId,
        displayName: target.displayName,
        sha: target.sha,
        prNumber: target.prNumber ?? null,
        prTitle: target.prTitle ?? null,
      },
      judgedAt,
      counts: result.counts,
      bandCounts: result.bandCounts,
      total: result.total,
      skipped,
      rows: result.rows.map((r) => ({
        id: r.criterion.id,
        section: r.criterion.section,
        band: r.criterion.band,
        description: r.criterion.description,
        status: r.status,
        evidence: r.evidence(),
      })),
    });
  };

  // Classify rows into Met / Warning / Error; hide scaffolder-bake rows
  // (their twins carry the post-hoc check) and not-applicable rows.
  // The filter itself lives in CriteriaPage; this host only builds the
  // map over the full result.
  const severityMap = useMemo(() => {
    const severities = new Map<string, ReviewSeverity>();
    for (const r of result.rows) {
      severities.set(r.criterion.id, severityForReviewRow(r));
    }
    return Object.fromEntries(severities);
  }, [result]);

  const resultWithAuthor = useMemo(() => {
    if (!authorInfo) return result;
    const authorLine = authorInfo.isFirstPr
      ? t({
          id: "review.report.authorFirstPr",
          message: `Author @${authorInfo.login}: first PR to this repo — §17.2 applies.`,
        })
      : t({
          id: "review.report.authorReturning",
          message: `Author @${authorInfo.login}: ${authorInfo.prCount} PRs to this repo (not a first-time contributor).`,
        });
    return {
      ...result,
      rows: result.rows.map((row) =>
        row.criterion.id === NEW_AUTHOR_CRITERION_ID
          ? {
              ...row,
              evidence: () => {
                const ev = row.evidence();
                return { ...ev, lines: [...ev.lines, authorLine] };
              },
            }
          : row,
      ),
    };
  }, [result, authorInfo, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: "flex-start",
          background: "none",
          border: "none",
          color: ACCENT,
          cursor: "pointer",
          fontSize: 13,
          fontFamily: FONT,
          padding: 0,
        }}
      >
        <Trans id="review.report.backToPicker">← Pick another keyboard</Trans>
      </button>

      <ReportBanner
        eyebrow="kbstudio.langtech.cloud/review"
        title={
          <>
            <Trans id="review.report.heading">Health report:</Trans>{" "}
            <span style={{ fontFamily: CSS_FONT_MONO }}>{target.keyboardId}</span>
          </>
        }
        meta={t({
          id: "review.report.judgedMeta",
          message: `${reviewTargetLabel(target)} · judged ${new Date(judgedAt).toLocaleString()} · ${result.total} criteria`,
        })}
      />

      <div
        role="note"
        style={{
          borderLeft: "4px solid var(--sil-orange-dark)",
          background: BG_INSET,
          borderRadius: "0 10px 10px 0",
          padding: "10px 14px",
          fontSize: 12.5,
        }}
      >
        <Trans id="review.report.foreignNote">
          <strong>Judged as published.</strong> This keyboard wasn&apos;t built by
          the studio, so scaffolder-baked criteria can&apos;t be claimed and there
          are no survey answers or checklist confirmations on file. Those rows
          resolve honestly —{" "}
          <em>{t({ id: "criteria.status.notYetCheckable", message: "Not yet checkable" })}</em>{" "}
          or <em>{t({ id: "criteria.status.needsHuman", message: "Needs human" })}</em> —
          never Met. A check that couldn&apos;t run is not a check that passed.
        </Trans>
      </div>

      {authorInfo && target.prNumber !== undefined && (
        authorInfo.isFirstPr ? (
          <div
            role="note"
            style={{
              borderLeft: "4px solid var(--sil-green-dark)",
              background: BG_INSET,
              borderRadius: "0 10px 10px 0",
              padding: "10px 14px",
              fontSize: 12.5,
            }}
          >
            <Trans id="review.report.firstTimeContributor">
              <strong>🌱 First-time contributor.</strong> @{authorInfo.login} has
              not opened a PR to this repo before — see §17.2 (new-author
              local pull) in the Build Trigger section below.
            </Trans>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: TEXT_DIM }}>
            {t({
              id: "review.report.prByline",
              message: `PR by @${authorInfo.login} · ${plural(authorInfo.prCount, {
                one: "# PR",
                other: "# PRs",
              })} to this repo`,
            })}
          </div>
        )
      )}

      {skipped.length > 0 && (
        <div
          role="note"
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: "10px 14px",
            fontSize: 12.5,
          }}
        >
          <Trans id="review.report.skippedHeading">
            <strong>{skipped.length} file(s) skipped</strong> (named, never silent):
          </Trans>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {skipped.map((s) => (
              <li key={s.path} style={{ fontFamily: CSS_FONT_MONO, fontSize: 12 }}>
                {s.path} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onRerun}
          style={ghostButton}
        >
          <Trans id="review.report.rerun">Re-run</Trans>
        </button>
        <button
          type="button"
          onClick={copyLink}
          style={ghostButton}
        >
          <Trans id="review.report.copyLink">Copy report link</Trans>
        </button>
        <button
          type="button"
          onClick={exportJson}
          style={ghostButton}
        >
          <Trans id="review.report.downloadJson">Download JSON</Trans>
        </button>
        <span style={{ fontSize: 12, color: TEXT_DIM, alignSelf: "center" }}>
          <Trans id="review.report.readOnlyNote">
            Reports are read-only and pin their commit — nothing here can stage,
            adapt, or submit the keyboard.
          </Trans>
        </span>
      </div>

      <div style={{ minHeight: 0, flex: 1 }}>
        <CriteriaPage
          result={resultWithAuthor}
          mode="foreign"
          keyboardLabel={target.displayName}
          judgedNote={judgedNote}
          githubLink={{ owner: target.owner, repo: target.repo, sha: target.sha, path: target.path }}
          severityMap={severityMap}
          {...(result.fileTree !== undefined
            ? { fileTree: result.fileTree }
            : {})}
        />
      </div>
    </div>
  );
}

const ghostButton: React.CSSProperties = {
  background: BG_CARD,
  color: "var(--app-text)",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "8px 14px",
  cursor: "pointer",
  fontSize: 13,
  fontFamily: FONT,
};
