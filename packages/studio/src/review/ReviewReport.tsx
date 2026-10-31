// ReviewReport — the /review health report.
//
// Wraps the shared CriteriaPage in foreign mode (no record callbacks: every
// foreign row carries controls: null) with the review chrome around it:
// the pinned-snapshot header, the foreign-mode honesty banner, skipped-file
// notes, and the read-only actions. Nothing here can stage, adapt, or submit
// the keyboard — this screen imports no authoring store.

import { useMemo, useState } from "react";
import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import { CriteriaPage } from "../criteria/CriteriaPage.tsx";
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
import {
  ERROR_TEXT,
  SUCCESS_ACCENT,
  WARNING,
} from "../ui/theme.ts";

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
  // Inject the author status into 17.2's details (red-checklist rows show
  // the checklist text; for a PR we can name the author situation).
  const judgedNote = useMemo(
    () =>
      `Judged from a read-only snapshot of ${reviewTargetLabel(target)} — ` +
      `the keyboard as published, unmodified.`,
    [target],
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
      window.prompt("Copy this report link:", shareUrl);
    }
  };

  const exportJson = () => {
    downloadJson(`health-check-${target.keyboardId}-${target.sha.slice(0, 7)}.json`, {
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
  const [severityFilter, setSeverityFilter] = useState<
    "all" | "met" | "warning" | "error"
  >("all");
  const { displayResult, severityCounts, severityMap } = useMemo(() => {
    const severities = new Map<string, ReviewSeverity>();
    const kept = result.rows.filter((r) => {
      const s = severityForReviewRow(r);
      severities.set(r.criterion.id, s);
      return s !== "hidden";
    });
    const counts = { met: 0, warning: 0, error: 0 };
    for (const r of kept) {
      const s = severities.get(r.criterion.id);
      if (s === "met") counts.met++;
      else if (s === "warning") counts.warning++;
      else if (s === "error") counts.error++;
    }
    // Apply the severity filter for display.
    const filtered =
      severityFilter === "all"
        ? kept
        : kept.filter(
            (r) => severities.get(r.criterion.id) === severityFilter,
          );
    return {
      displayResult: { ...result, rows: filtered, total: filtered.length },
      severityCounts: counts,
      severityMap: Object.fromEntries(severities),
    };
  }, [result, severityFilter]);

  const resultWithAuthor = useMemo(() => {
    if (!authorInfo) return displayResult;
    const authorLine = authorInfo.isFirstPr
      ? `Author @${authorInfo.login}: first PR to this repo — §17.2 applies.`
      : `Author @${authorInfo.login}: ${authorInfo.prCount} PRs to this repo (not a first-time contributor).`;
    return {
      ...displayResult,
      rows: displayResult.rows.map((row) =>
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
  }, [displayResult, authorInfo]);

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
        ← Pick another keyboard
      </button>

      <div
        style={{
          background: "var(--sil-blue-dark)",
          color: "var(--sil-white)",
          borderRadius: 12,
          padding: "14px 18px",
        }}
      >
        <div style={{ fontFamily: CSS_FONT_MONO, fontSize: 12, opacity: 0.75 }}>
          kbstudio.langtech.cloud/review
        </div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 20 }}>
          Health report:{" "}
          <span style={{ fontFamily: CSS_FONT_MONO }}>{target.keyboardId}</span>
        </h1>
        <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
          {reviewTargetLabel(target)} · judged{" "}
          {new Date(judgedAt).toLocaleString()} · {result.total} criteria
        </p>
      </div>

      <div
        role="group"
        aria-label="Filter results by severity"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {(
          [
            { key: "all", label: `All`, color: "var(--app-text)" },
            {
              key: "met",
              label: `✓ ${severityCounts.met} met`,
              color: SUCCESS_ACCENT,
            },
            {
              key: "warning",
              label: `⚠ ${severityCounts.warning} warnings`,
              color: WARNING,
            },
            {
              key: "error",
              label: `✖ ${severityCounts.error} errors`,
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
        <strong>Judged as published.</strong> This keyboard wasn&apos;t built by
        the studio, so scaffolder-baked criteria can&apos;t be claimed and there
        are no survey answers or checklist confirmations on file. Those rows
        resolve honestly — <em>Not yet checkable</em> or{" "}
        <em>Needs human</em> — never Met. A check that couldn&apos;t run is not
        a check that passed.
      </div>

      {authorInfo && target.prNumber !== undefined && (
        authorInfo.isFirstPr ? (
          <div
            role="note"
            style={{
              borderLeft: "4px solid var(--sil-green-dark, #2e7d32)",
              background: BG_INSET,
              borderRadius: "0 10px 10px 0",
              padding: "10px 14px",
              fontSize: 12.5,
            }}
          >
            <strong>🌱 First-time contributor.</strong> @{authorInfo.login} has
            not opened a PR to this repo before — see §17.2 (new-author
            local pull) in the Build Trigger section below.
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: TEXT_DIM }}>
            PR by @{authorInfo.login} · {authorInfo.prCount} PR
            {authorInfo.prCount === 1 ? "" : "s"} to this repo
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
          <strong>{skipped.length} file(s) skipped</strong> (named, never silent):
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
          Re-run
        </button>
        <button
          type="button"
          onClick={copyLink}
          style={ghostButton}
        >
          Copy report link
        </button>
        <button
          type="button"
          onClick={exportJson}
          style={ghostButton}
        >
          Download JSON
        </button>
        <span style={{ fontSize: 12, color: TEXT_DIM, alignSelf: "center" }}>
          Reports are read-only and pin their commit — nothing here can stage,
          adapt, or submit the keyboard.
        </span>
      </div>

      <div style={{ minHeight: 0, flex: 1 }}>
        <CriteriaPage
          result={resultWithAuthor}
          mode="foreign"
          keyboardLabel={target.displayName}
          judgedNote={judgedNote}
          githubLink={{ owner: target.owner, repo: target.repo, sha: target.sha }}
          severityMap={severityMap}
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
