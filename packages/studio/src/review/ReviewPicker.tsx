// ReviewPicker — the /review source-constrained keyboard picker.
//
// Two questions, in order:
//   1. Which repository?  keyboard-studio/keyboards | keymanapp/keyboards
//   2. Pull requests or published keyboards?  open PRs | default branch
// Then: a keyboard list — for a PR, ONLY the keyboards that PR changes
// (derived live from the PR's file list).
//
// Nothing else can be picked: no uploads, no pasted URLs, no keyman.com, no
// studio projects. Picking a keyboard pins a ReviewTarget (source + folder +
// exact sha); the report judges that sha and nothing else.

import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  ACCENT,
  BG_CARD,
  BG_INSET,
  BORDER,
  CSS_FONT_MONO,
  CSS_SIL_GREEN,
  CSS_WARNING_TEXT,
  CSS_TEXT,
  CSS_TEXT_MUTED,
  FONT,
  TEXT_DIM,
} from "../ui/theme.ts";
import {
  reviewTargetLabel,
  type ReviewIndex,
  type ReviewKeyboardEntry,
  type ReviewPrEntry,
  type ReviewSourceId,
  type ReviewTarget,
} from "./reviewSources.ts";
import {
  fetchPrKeyboards,
  usePrs,
  useRepoKeyboards,
  type PrStateFilter,
} from "./useReviewIndex.ts";

type RepoChoice = "ks" | "km";
type KindChoice = "repo" | "prs";

const REPOS: Array<{ id: RepoChoice; label: string; blurb: MessageDescriptor }> = [
  {
    id: "ks",
    label: "keyboard-studio/keyboards",
    blurb: msg({
      id: "review.picker.repoKs.blurb",
      message: "Curated studio submissions",
    }),
  },
  {
    id: "km",
    label: "keymanapp/keyboards",
    blurb: msg({
      id: "review.picker.repoKm.blurb",
      message: "The upstream Keyman library",
    }),
  },
];

// NB: KINDS carries no blurb — the cards render a per-repo blurb
// ("<repo> · default branch" / "<repo> · open pull requests") instead.
const KINDS: Array<{ id: KindChoice; label: MessageDescriptor }> = [
  {
    id: "repo",
    label: msg({
      id: "review.picker.kindRepo.label",
      message: "Published keyboards",
    }),
  },
  {
    id: "prs",
    label: msg({
      id: "review.picker.kindPrs.label",
      message: "Pull requests",
    }),
  },
];

function sourceId(repo: RepoChoice, kind: KindChoice): ReviewSourceId {
  return `${repo}-${kind}` as ReviewSourceId;
}

const TIER_COLORS: Record<string, string> = {
  release: CSS_SIL_GREEN,
  experimental: CSS_WARNING_TEXT,
  legacy: CSS_TEXT_MUTED,
};

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        padding: "1px 8px",
        color: TIER_COLORS[tier] ?? CSS_TEXT_MUTED,
        whiteSpace: "nowrap",
      }}
    >
      {tier}
    </span>
  );
}

function ChoiceCard({
  selected,
  onClick,
  title,
  titleMono,
  blurb,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  titleMono?: boolean;
  blurb: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      style={{
        textAlign: "left",
        background: selected ? BG_CARD : BG_INSET,
        border: `1px solid ${selected ? ACCENT : BORDER}`,
        boxShadow: selected ? `0 0 0 1px ${ACCENT}` : "none",
        borderRadius: 10,
        padding: "10px 12px",
        cursor: "pointer",
        fontFamily: FONT,
        color: CSS_TEXT,
      }}
    >
      <div
        style={{
          fontFamily: titleMono ? CSS_FONT_MONO : FONT,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12, color: TEXT_DIM, marginTop: 2 }}>{blurb}</div>
    </button>
  );
}

export function ReviewPicker({
  index,
  onRun,
  initialRepo,
  initialKind,
  initialPrNumber,
  autoRunSingle,
}: {
  index: ReviewIndex;
  onRun: (target: ReviewTarget) => void;
  /** Preselect a repo for /review hard links. */
  initialRepo?: "ks" | "km";
  /** Preselect the pulls/published choice for /review hard links. */
  initialKind?: "prs" | "repo";
  /** Preselect a PR number for /review hard links. */
  initialPrNumber?: number;
  /**
   * For /review hard links: when the PR touches exactly one keyboard,
   * run it immediately instead of showing the list.
   */
  autoRunSingle?: boolean;
}) {
  const { t } = useLingui();
  const [repo, setRepo] = useState<RepoChoice | null>(initialRepo ?? null);
  const [kind, setKind] = useState<KindChoice | null>(initialKind ?? null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReviewKeyboardEntry | null>(null);
  const [selectedPr, setSelectedPr] = useState<ReviewPrEntry | null>(null);
  const [prKeyboards, setPrKeyboards] = useState<ReviewKeyboardEntry[] | null>(null);
  const [prKeyboardsError, setPrKeyboardsError] = useState<string | null>(null);
  const [prStateFilter, setPrStateFilter] = useState<PrStateFilter>("open");

  const src: ReviewSourceId | null =
    repo && kind ? sourceId(repo, kind) : null;
  const repoKeyboards = useRepoKeyboards(index, src ?? "ks-repo", query);
  const {
    prs: openPrs,
    live: prsLive,
    loading: prsLoading,
    error: prsError,
  } = usePrs(index, src ?? "ks-prs", query, prStateFilter);

  // Hard link: preselect the PR by number once the list loads. If the PR
  // isn't under the current state filter (e.g. a link to a closed PR),
  // widen the filter to All so it can be found.
  useEffect(() => {
    if (initialPrNumber === undefined || selectedPr) return;
    const pr = openPrs.find((p) => p.number === initialPrNumber);
    if (pr) {
      setSelectedPr(pr);
      setSelected(null);
    } else if (!prsLoading && prStateFilter !== "all") {
      setPrStateFilter("all");
    }
  }, [initialPrNumber, openPrs, selectedPr, prsLoading, prStateFilter]);

  // Hard link: auto-run when the PR touches exactly one keyboard.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!autoRunSingle || autoRanRef.current) return;
    if (kind !== "prs" || !selectedPr || prKeyboards === null) return;
    if (prKeyboards.length !== 1) return;
    autoRanRef.current = true;
    const kb = prKeyboards[0]!;
    const owner = repo === "ks" ? "keyboard-studio" : "keymanapp";
    onRun({
      source: src!,
      owner,
      repo: "keyboards",
      path: kb.path,
      keyboardId: kb.id,
      displayName: kb.displayName,
      sha: selectedPr.headSha,
      prNumber: selectedPr.number,
      prTitle: selectedPr.title,
    });
  }, [autoRunSingle, kind, selectedPr, prKeyboards, repo, src, onRun]);

  const pickRepo = (r: RepoChoice) => {
    setRepo(r);
    setKind(null);
    setQuery("");
    setSelected(null);
    setSelectedPr(null);
    setPrKeyboards(null);
  };
  const pickKind = (k: KindChoice) => {
    setKind(k);
    setQuery("");
    setSelected(null);
    setSelectedPr(null);
    setPrKeyboards(null);
  };

  // Keyboards changed by the selected PR, live from its file list.
  useEffect(() => {
    if (!repo || kind !== "prs" || !selectedPr) {
      setPrKeyboards(null);
      return;
    }
    const owner = repo === "ks" ? "keyboard-studio" : "keymanapp";
    let cancelled = false;
    setPrKeyboards(null);
    setPrKeyboardsError(null);
    fetchPrKeyboards(owner, "keyboards", selectedPr.number).then(
      (kbs) => {
        if (!cancelled) setPrKeyboards(kbs);
      },
      (e: unknown) => {
        if (!cancelled) {
          setPrKeyboardsError(e instanceof Error ? e.message : String(e));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo, kind, selectedPr]);

  const target: ReviewTarget | null = useMemo(() => {
    if (!repo || !kind || !src) return null;
    const owner = repo === "ks" ? "keyboard-studio" : "keymanapp";
    if (kind === "repo") {
      if (!selected) return null;
      const repoInfo = index.repos[repo];
      if (!repoInfo) return null;
      return {
        source: src,
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        path: selected.path,
        keyboardId: selected.id,
        displayName: selected.displayName,
        sha: repoInfo.sha,
      };
    }
    if (!selectedPr || !selected) return null;
    return {
      source: src,
      owner,
      repo: "keyboards",
      path: selected.path,
      keyboardId: selected.id,
      displayName: selected.displayName,
      sha: selectedPr.headSha,
      prNumber: selectedPr.number,
      prTitle: selectedPr.title,
    };
  }, [repo, kind, src, index, selected, selectedPr]);

  const listKeyboards = kind === "repo" ? repoKeyboards : (prKeyboards ?? []);
  const repoLabel = repo === "ks" ? "keyboard-studio/keyboards" : "keymanapp/keyboards";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Q1 — repository */}
      <section
        aria-label={t({ id: "review.picker.whichRepo.ariaLabel", message: "Which repository" })}
      >
        <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
          <Trans id="review.picker.whichRepo.heading">1. Which repository?</Trans>
        </h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 8,
          }}
        >
          {REPOS.map((r) => (
            <ChoiceCard
              key={r.id}
              selected={repo === r.id}
              onClick={() => pickRepo(r.id)}
              title={r.label}
              titleMono
              blurb={t(r.blurb)}
            />
          ))}
        </div>
      </section>

      {/* Q2 — pulls or published */}
      {repo && (
        <section
          aria-label={t({
            id: "review.picker.prOrPublished.ariaLabel",
            message: "Pull requests or published keyboards",
          })}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
            <Trans id="review.picker.prOrPublished.heading">
              2. Pull requests or published keyboards?
            </Trans>
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 8,
            }}
          >
            {KINDS.map((k) => (
              <ChoiceCard
                key={k.id}
                selected={kind === k.id}
                onClick={() => pickKind(k.id)}
                title={t(k.label)}
                blurb={
                  k.id === "repo"
                    ? t({
                        id: "review.picker.kindRepo.blurbForRepo",
                        message: `${repoLabel} · default branch`,
                      })
                    : t({
                        id: "review.picker.kindPrs.blurbForRepo",
                        message: `${repoLabel} · open pull requests`,
                      })
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* Q3a — published keyboards */}
      {repo && kind === "repo" && (
        <section
          aria-label={t({ id: "review.picker.pickKeyboard.ariaLabel", message: "Pick a keyboard" })}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
            <Trans id="review.picker.pickKeyboard.heading">3. Pick a keyboard</Trans>
          </h3>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t({
              id: "review.picker.searchKeyboards.placeholder",
              message: "Search by id, name, or path… (e.g. amharic, cree, nko)",
            })}
            label={t({ id: "editor.baseResolution.searchKeyboardsLabel", message: "Search keyboards" })}
          />
          <KeyboardList
            keyboards={listKeyboards}
            selected={selected}
            onSelect={setSelected}
            emptyText={t({ id: "review.picker.noKeyboardsMatch", message: "No keyboards match." })}
          />
        </section>
      )}

      {/* Q3b — PRs, then keyboards changed in the PR */}
      {repo && kind === "prs" && !selectedPr && (
        <section
          aria-label={t({ id: "review.picker.pickPr.ariaLabel", message: "Pick a pull request" })}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
            <Trans id="review.picker.pickPr.heading">3. Pick a pull request</Trans>
          </h3>
          <div
            role="group"
            aria-label={t({
              id: "review.picker.prStateFilter.ariaLabel",
              message: "Filter pull requests by state",
            })}
            style={{ display: "flex", gap: 6, marginBottom: 8 }}
          >
            {(["all", "open", "closed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={prStateFilter === f}
                onClick={() => setPrStateFilter(f)}
                style={{
                  background: prStateFilter === f ? BG_CARD : BG_INSET,
                  border: `1px solid ${prStateFilter === f ? ACCENT : BORDER}`,
                  borderRadius: 20,
                  padding: "3px 12px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  fontSize: 12,
                  color: prStateFilter === f ? CSS_TEXT : TEXT_DIM,
                  textTransform: "capitalize",
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t({
              id: "review.picker.searchPrs.placeholder",
              message: "Search pull requests by number or title…",
            })}
            label={t({ id: "review.picker.searchPrs.label", message: "Search pull requests" })}
          />
          <p style={{ fontSize: 11, color: TEXT_DIM, margin: "0 0 8px" }}>
            {prsLoading && (
              <Trans id="review.picker.loadingPrList">Loading the live pull request list…</Trans>
            )}
            {!prsLoading && prsLive && (
              <Trans id="review.picker.prListLive">
                Live from GitHub · refreshed on each visit.
              </Trans>
            )}
            {!prsLoading &&
              !prsLive &&
              prsError &&
              t({
                id: "review.picker.prListCached",
                message: `Live list unavailable (${prsError}) — showing the cached list from ${
                  index?.generatedAt?.slice(0, 10) ??
                  t({
                    id: "review.picker.prListCachedFallback",
                    message: "the last index build",
                  })
                }.`,
              })}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {openPrs.length === 0 && !prsLoading && (
              <p style={{ fontSize: 13, color: TEXT_DIM }}>
                <Trans id="review.picker.noPrsMatch">No pull requests match.</Trans>
              </p>
            )}
            {openPrs.map((pr) => (
              <button
                key={pr.number}
                type="button"
                onClick={() => {
                  setSelectedPr(pr);
                  setSelected(null);
                }}
                style={{
                  textAlign: "left",
                  background: BG_CARD,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 10,
                  padding: "9px 12px",
                  cursor: "pointer",
                  fontFamily: FONT,
                  color: CSS_TEXT,
                }}
              >
                <span style={{ fontFamily: CSS_FONT_MONO, fontWeight: 700, fontSize: 13 }}>
                  #{pr.number}
                </span>{" "}
                <span
                  style={{
                    fontSize: 10.5,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 20,
                    padding: "1px 8px",
                    marginRight: 6,
                    color: pr.state === "open" ? CSS_SIL_GREEN : TEXT_DIM,
                    whiteSpace: "nowrap",
                  }}
                >
                  {pr.state}
                </span>
                <span style={{ fontSize: 13 }}>{pr.title}</span>
                <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                  head {pr.headSha.slice(0, 7)}
                  {pr.updatedAt
                    ? t({
                        id: "review.picker.prUpdated",
                        message: ` · updated ${pr.updatedAt.slice(0, 10)}`,
                      })
                    : ""}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {repo && kind === "prs" && selectedPr && (
        <section
          aria-label={t({
            id: "review.picker.prKeyboards.ariaLabel",
            message: "Keyboards changed in this pull request",
          })}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedPr(null);
              setSelected(null);
            }}
            style={{
              background: "none",
              border: "none",
              color: ACCENT,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: FONT,
              padding: 0,
              marginBottom: 6,
            }}
          >
            <Trans id="review.picker.allPrs">← All pull requests</Trans>
          </button>
          <h3 style={{ margin: "0 0 4px", fontSize: 13 }}>
            <span style={{ fontFamily: CSS_FONT_MONO, fontWeight: 700 }}>
              #{selectedPr.number}
            </span>{" "}
            {selectedPr.title}
          </h3>
          <p style={{ fontSize: 12, color: TEXT_DIM, margin: "0 0 8px" }}>
            <Trans id="review.picker.onlyPrKeyboards">Only the keyboards this PR changes:</Trans>
          </p>
          {prKeyboardsError && (
            <p style={{ fontSize: 13, color: CSS_WARNING_TEXT }}>
              <Trans id="review.picker.prKeyboardsError">
                Couldn&apos;t list this PR&apos;s keyboards: {prKeyboardsError}
              </Trans>
            </p>
          )}
          {prKeyboards === null && !prKeyboardsError && (
            <p style={{ fontSize: 13, color: TEXT_DIM }}>
              <Trans id="review.picker.readingPrFiles">Reading the PR&apos;s file list…</Trans>
            </p>
          )}
          {prKeyboards !== null && prKeyboards.length > 1 && (
            <div
              role="alert"
              style={{
                borderLeft: "4px solid var(--app-warning-text)",
                background: BG_INSET,
                borderRadius: "0 10px 10px 0",
                padding: "10px 14px",
                fontSize: 12.5,
                marginBottom: 8,
              }}
            >
              <strong style={{ color: CSS_WARNING_TEXT }}>
                <Trans id="review.picker.multiKeyboardPr">
                  ⚠ This PR touches {prKeyboards.length} keyboards.
                </Trans>
              </strong>{" "}
              <Trans id="review.picker.multiKeyboardPrNote">
                Review each one separately — a multi-keyboard PR deserves a
                closer look.
              </Trans>
            </div>
          )}
          {prKeyboards !== null && (
            <KeyboardList
              keyboards={prKeyboards}
              selected={selected}
              onSelect={setSelected}
              emptyText={t({
                id: "review.picker.prNoKeyboardFolders",
                message: "This PR touches no keyboard folders.",
              })}
            />
          )}
        </section>
      )}

      <p style={{ fontSize: 12, color: TEXT_DIM, margin: 0 }}>
        <Trans id="review.picker.sourceLimits">
          No uploads, no pasted URLs, no keyman.com downloads, no studio projects.
          If it isn&apos;t in one of these four places, it can&apos;t be checked here.
        </Trans>
      </p>

      {/* Pinned snapshot + run */}
      {target && (
        <section
          aria-label={t({ id: "review.picker.snapshot.ariaLabel", message: "Pinned snapshot" })}
          style={{
            background: BG_CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>
            <Trans id="review.picker.snapshotHeading">
              Pinned snapshot — the check is reproducible
            </Trans>
          </h3>
          <div
            style={{
              fontFamily: CSS_FONT_MONO,
              fontSize: 12,
              background: BG_INSET,
              border: `1px solid ${BORDER}`,
              borderRadius: 8,
              padding: "10px 12px",
              overflowX: "auto",
            }}
          >
            {reviewTargetLabel(target)}
          </div>
          <p style={{ fontSize: 12, color: TEXT_DIM }}>
            <Trans id="review.picker.snapshotNote">
              The battery runs against this exact commit. If the repo or PR moves on,
              re-run for a fresh report — old reports stay pinned to their commit.
            </Trans>
          </p>
          <button
            type="button"
            onClick={() => onRun(target)}
            style={{
              background: ACCENT,
              color: "var(--app-text-on-accent)",
              border: "none",
              borderRadius: 8,
              padding: "10px 18px",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              fontFamily: FONT,
            }}
          >
            <Trans id="review.picker.runHealthCheck">Run health check</Trans>
          </button>
        </section>
      )}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      style={{
        width: "100%",
        boxSizing: "border-box",
        background: BG_CARD,
        color: CSS_TEXT,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "9px 12px",
        fontSize: 13,
        fontFamily: FONT,
        marginBottom: 8,
      }}
    />
  );
}

function KeyboardList({
  keyboards,
  selected,
  onSelect,
  emptyText,
}: {
  keyboards: ReviewKeyboardEntry[];
  selected: ReviewKeyboardEntry | null;
  onSelect: (kb: ReviewKeyboardEntry) => void;
  emptyText: string;
}) {
  if (keyboards.length === 0) {
    return <p style={{ fontSize: 13, color: TEXT_DIM }}>{emptyText}</p>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {keyboards.map((kb) => (
        <button
          key={kb.path}
          type="button"
          aria-pressed={selected?.path === kb.path}
          onClick={() => onSelect(kb)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            textAlign: "left",
            background: BG_CARD,
            border: `1px solid ${selected?.path === kb.path ? ACCENT : BORDER}`,
            boxShadow: selected?.path === kb.path ? `0 0 0 1px ${ACCENT}` : "none",
            borderRadius: 10,
            padding: "9px 12px",
            cursor: "pointer",
            fontFamily: FONT,
            color: CSS_TEXT,
          }}
        >
          <span style={{ fontFamily: CSS_FONT_MONO, fontWeight: 700, fontSize: 13 }}>
            {kb.id}
          </span>
          <span style={{ fontSize: 12, color: TEXT_DIM }}>{kb.displayName}</span>
          <TierBadge tier={kb.tier} />
          <span style={{ fontSize: 11, color: TEXT_DIM, fontFamily: CSS_FONT_MONO }}>
            {kb.path}
          </span>
        </button>
      ))}
    </div>
  );
}
