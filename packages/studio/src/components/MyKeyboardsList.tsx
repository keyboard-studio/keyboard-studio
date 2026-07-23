// MyKeyboardsList — the "My keyboards" section on the profile page.
// Replaces the disabled placeholder that used to live inline in
// ProfileScreen.tsx.
//
// List sourcing:
//   - Signed-out: the local project index (lib/draftPersistence.ts
//     listDrafts()) only — no server call is attempted (matches the existing
//     guest posture of serverDraftStore.ts).
//   - Signed-in: the local index merged with the signed-in cloud list
//     (serverDraftStore.ts listServerDrafts()), deduped by projectKey (see
//     mergeProjectEntries below).
//
// Fail-soft note: listServerDrafts() already swallows every transport failure
// (network error, 401, 502, 503, unconfigured backend) into an empty array —
// see its docstring in serverDraftStore.ts. That means THIS component cannot
// distinguish "the signed-in author genuinely has zero cloud-backed projects"
// from "the cloud fetch failed" — both collapse to the same empty list, and
// the merge falls back to the local index either way. Surfacing a
// distinguishable error state would require serverDraftStore.ts to expose the
// failure reason instead of swallowing it, which is out of scope here (the
// client transport is consumed as-is, not modified) — a known, reported gap.
//
// Resume flow (DEVIATION from the dev reference implementation): dev defers
// applying the draft to a StudioShell-owned resume banner, and this component
// only pins the active-project pointer before navigating. Main has no such
// banner — `main.tsx` calls `loadDraft()` (the boot-time apply) exactly once,
// pre-mount, so navigating to `#survey` after merely pinning the pointer
// would NOT actually load the picked project's stores. Instead, Resume here
// calls `resumeProject()` directly (which applies the draft to both stores
// via `loadDraft` AND sets the active-project flag `loadDraft` already sets
// on success — `wasDraftRestoredThisBoot()` — so SurveyView's mount effect
// does not reset the just-resumed session out from under it), then navigates
// only on a successful apply.
//
// Ported from the dev reference implementation's MyKeyboardsList.tsx
// (specs/047-my-keyboards) with its draft-engine imports rewired onto main's
// draftPersistence.ts and its user-facing strings converted to main's
// @lingui convention.

import { useCallback, useEffect, useRef, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { useGitHubAuth } from "../hooks/useGitHubAuth.ts";
import {
  listDrafts,
  deleteProject,
  resumeProject,
  PENDING_PROJECT_KEY,
  type ProjectIndexEntry,
} from "../lib/draftPersistence.ts";
import { listServerDrafts, type ServerDraftMeta } from "../lib/serverDraftStore.ts";
import { relativeTime, type RelativeTimeValue } from "../lib/relativeTime.ts";
import { navigateTo } from "../lib/navigate.ts";
import { BG_CARD, BORDER, ACCENT, TEXT_DIM, TEXT_MAIN, FONT } from "../lib/galleryTheme.ts";
import { SUCCESS_ACCENT } from "../ui/theme.ts";

// ---------------------------------------------------------------------------
// Merge / dedupe
// ---------------------------------------------------------------------------

/**
 * Merge the local project index with the signed-in cloud list, deduped by
 * projectKey (the server's `draftId`). A project present in both places shows
 * once: submitted beats draft (a submission is the more advanced state), and
 * otherwise the newer `savedAt` wins. Exported for unit testing.
 */
export function mergeProjectEntries(
  local: ProjectIndexEntry[],
  cloud: ServerDraftMeta[],
): ProjectIndexEntry[] {
  const byKey = new Map<string, ProjectIndexEntry>();
  for (const entry of local) byKey.set(entry.projectKey, entry);

  for (const meta of cloud) {
    const projectKey = meta.draftId;
    // A row with no draftId can't be keyed, resumed, or deleted by this list —
    // skip it rather than guessing a key (see module docstring).
    if (projectKey === undefined || projectKey === "") continue;

    const existing = byKey.get(projectKey);
    const cloudEntry: ProjectIndexEntry = {
      projectKey,
      savedAt: meta.savedAt,
      // The server's activeStepId is a plain string; the same cast is already
      // used by serverMetaToDraftMeta() in serverDraftStore.ts.
      activeStepId: meta.activeStepId as ProjectIndexEntry["activeStepId"],
      label: meta.label,
      // langTag is a client-only display convenience the server doesn't carry
      // — keep the local value when we have one for this project.
      langTag: existing?.langTag ?? null,
      status: meta.status ?? "draft",
      prUrl: meta.prUrl ?? null,
    };
    byKey.set(projectKey, existing === undefined ? cloudEntry : preferEntry(existing, cloudEntry));
  }

  return [...byKey.values()].sort((a, b) => b.savedAt - a.savedAt);
}

function preferEntry(a: ProjectIndexEntry, b: ProjectIndexEntry): ProjectIndexEntry {
  if (a.status === "submitted" && b.status !== "submitted") return a;
  if (b.status === "submitted" && a.status !== "submitted") return b;
  return a.savedAt >= b.savedAt ? a : b;
}

// ---------------------------------------------------------------------------
// Styles — reusing the ProfileScreen left-column visual language.
// ---------------------------------------------------------------------------

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const headingStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: TEXT_MAIN,
  fontFamily: FONT,
};

const listStyle: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 8,
  background: BG_CARD,
  border: `1px solid ${BORDER}`,
  fontFamily: FONT,
};

const cardTitleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  justifyContent: "space-between",
};

const cardTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: TEXT_MAIN,
  overflowWrap: "anywhere",
};

const metaLineStyle: React.CSSProperties = {
  fontSize: 12,
  color: TEXT_DIM,
};

function badgeStyle(status: ProjectIndexEntry["status"]): React.CSSProperties {
  return {
    flexShrink: 0,
    fontSize: 11,
    fontWeight: 700,
    padding: "2px 8px",
    borderRadius: 999,
    color: "#0d1117",
    background: status === "submitted" ? SUCCESS_ACCENT : ACCENT,
  };
}

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const actionButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  fontFamily: FONT,
  cursor: "pointer",
  background: "transparent",
  color: TEXT_MAIN,
  border: `1px solid ${BORDER}`,
  textDecoration: "none",
  display: "inline-block",
};

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: TEXT_DIM,
  fontFamily: FONT,
  fontStyle: "italic",
};

const statusLineStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: TEXT_DIM,
  fontFamily: FONT,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MyKeyboardsList() {
  const { t } = useLingui();

  // Independent useGitHubAuth() call (rather than threading the token down
  // from a parent) so this component is self-contained and independently
  // testable — mirrors the mocking idiom already used by ProfileScreen.test.tsx
  // and AccountControl.test.tsx (mock useGitHubAuth at the module boundary).
  const { status: ghStatus, token } = useGitHubAuth();
  const isSignedIn = ghStatus === "connected" || ghStatus === "needs-scope";
  const accessToken = token?.accessToken ?? null;

  const [entries, setEntries] = useState<ProjectIndexEntry[]>(() => listDrafts());
  const [loading, setLoading] = useState(false);

  // Guards against setting state after unmount (e.g. navigating away while the
  // signed-in cloud fetch is still in flight).
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Race guard: projectKeys deleted via handleDelete in THIS component
  // instance's lifetime. A signed-in refresh's `listServerDrafts()` call can
  // still be in flight when a Delete completes (see handleDelete) — if that
  // stale cloud response was fetched before the server-side row was cleared,
  // it can still list the just-deleted project. Re-reading the local index
  // (below) only guards against the OTHER half of this race (a stale `local`
  // closure variable); it does nothing about a stale-but-real cloud entry,
  // since mergeProjectEntries deliberately does not drop a cloud row absent
  // from local (that's how a genuinely cloud-only project — e.g. synced from
  // another device, not yet mirrored locally — is meant to surface). This set
  // is the targeted exception: only keys THIS session explicitly deleted are
  // filtered out of a merge result, so an untouched cloud-only project is
  // never hidden.
  const deletedKeysRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async (): Promise<void> => {
    const local = listDrafts();
    if (mountedRef.current) setEntries(local);

    if (!isSignedIn || accessToken === null) {
      if (mountedRef.current) setLoading(false);
      return;
    }

    if (mountedRef.current) setLoading(true);
    const cloud = await listServerDrafts(accessToken);
    if (!mountedRef.current) return;
    // Re-read the local index rather than reusing `local`: a Delete that
    // completed while this fetch was in flight should not be re-introduced.
    // Also drop any key this session has explicitly deleted (deletedKeysRef)
    // — closes the other half of the race, where the cloud response itself
    // (fetched before the delete's server round trip landed) still lists the
    // deleted project.
    const merged = mergeProjectEntries(listDrafts(), cloud).filter(
      (entry) => !deletedKeysRef.current.has(entry.projectKey),
    );
    setEntries(merged);
    setLoading(false);
  }, [isSignedIn, accessToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function handleResume(projectKey: string): void {
    // See the module docstring's "Resume flow" note: main applies the draft
    // right here (resumeProject), rather than deferring to a resume banner
    // dev's architecture has and main does not.
    const applied = resumeProject(projectKey);
    if (applied) {
      navigateTo("survey");
    }
    // else: a corrupt/wrong-shaped draft failed to apply — leave the card in
    // place rather than silently navigating into an empty wizard.
  }

  function handleDelete(projectKey: string): void {
    // The lingui macro requires `message` to be a string/template literal —
    // NOT a `+`-concatenated BinaryExpression — hence the single template
    // literal here rather than the two-line concatenation this was ported
    // from.
    const confirmed = t({
      id: "profile.myKeyboards.deleteConfirm",
      message: `Delete this keyboard from My keyboards? This only removes the studio's record — it does not close or affect any pull request already opened on GitHub.`,
    });
    if (typeof window !== "undefined" && !window.confirm(confirmed)) return;
    // Record BEFORE the async deleteProject call so a refresh already in
    // flight (its listServerDrafts() call issued before this delete) can't
    // resurrect this key when it resolves — see deletedKeysRef above.
    deletedKeysRef.current.add(projectKey);
    void deleteProject(projectKey, accessToken).then(() => {
      void refresh();
    });
  }

  function displayLabel(entry: ProjectIndexEntry): string {
    if (entry.label !== null && entry.label.trim() !== "") return entry.label;
    if (entry.projectKey !== PENDING_PROJECT_KEY) return entry.projectKey;
    return t({ id: "profile.myKeyboards.untitled", message: "Untitled keyboard" });
  }

  function statusLabel(status: ProjectIndexEntry["status"]): string {
    return status === "submitted"
      ? t({ id: "profile.myKeyboards.status.submitted", message: "Submitted" })
      : t({ id: "profile.myKeyboards.status.draft", message: "Draft" });
  }

  // Renders relativeTime.ts's structured { unit, count } (P1-4 — see that
  // module's header note for why the plural rendering lives here, not
  // there): each branch is its own translatable id/message rather than one
  // shared template, so a translator can adapt word order per unit. The
  // `plural()` macro compiles to a proper ICU `{count, plural, one {...}
  // other {...}}` message — resolved against THIS component's live `t()`
  // (from useLingui()), never the argument-less fallback that can't evaluate
  // plural-category selection.
  function lastEditedLabel(relative: RelativeTimeValue): string {
    switch (relative.unit) {
      case "now":
        return t({ id: "profile.myKeyboards.lastEdited.now", message: "Last edited just now" });
      case "minute":
        return t({
          id: "profile.myKeyboards.lastEdited.minutes",
          message: plural(relative.count, {
            one: "Last edited # minute ago",
            other: "Last edited # minutes ago",
          }),
        });
      case "hour":
        return t({
          id: "profile.myKeyboards.lastEdited.hours",
          message: plural(relative.count, {
            one: "Last edited # hour ago",
            other: "Last edited # hours ago",
          }),
        });
      case "day":
        return t({
          id: "profile.myKeyboards.lastEdited.days",
          message: plural(relative.count, {
            one: "Last edited # day ago",
            other: "Last edited # days ago",
          }),
        });
    }
  }

  return (
    <section
      aria-label={t({ id: "profile.myKeyboards.sectionAriaLabel", message: "My keyboards" })}
      style={sectionStyle}
    >
      <h2 style={headingStyle}>
        <Trans id="profile.myKeyboards.heading">My keyboards</Trans>
      </h2>

      {loading && (
        <p role="status" aria-live="polite" style={statusLineStyle} data-testid="my-keyboards-loading">
          <Trans id="profile.myKeyboards.loading">Loading your keyboards&hellip;</Trans>
        </p>
      )}

      {!loading && entries.length === 0 && (
        <p style={emptyStyle} data-testid="my-keyboards-empty">
          <Trans id="profile.myKeyboards.empty">You haven&rsquo;t started a keyboard yet.</Trans>
        </p>
      )}

      {entries.length > 0 && (
        <ul
          role="list"
          aria-label={t({ id: "profile.myKeyboards.listAriaLabel", message: "Your keyboards" })}
          style={listStyle}
        >
          {entries.map((entry) => {
            const name = displayLabel(entry);
            const status = statusLabel(entry.status);
            const relative = relativeTime(entry.savedAt);
            return (
              <li key={entry.projectKey} style={cardStyle} data-testid="my-keyboards-card">
                <div style={cardTitleRowStyle}>
                  <span style={cardTitleStyle}>{name}</span>
                  <span
                    style={badgeStyle(entry.status)}
                    aria-label={t({
                      id: "profile.myKeyboards.statusAriaLabel",
                      message: `Status: ${status}`,
                    })}
                  >
                    {status}
                  </span>
                </div>

                {entry.langTag !== null && <div style={metaLineStyle}>{entry.langTag}</div>}
                <div style={metaLineStyle}>{lastEditedLabel(relative)}</div>

                <div style={actionsRowStyle}>
                  {entry.status === "draft" && (
                    <button
                      type="button"
                      style={actionButtonStyle}
                      aria-label={t({
                        id: "profile.myKeyboards.resumeAriaLabel",
                        message: `Resume ${name}`,
                      })}
                      onClick={() => handleResume(entry.projectKey)}
                    >
                      <Trans id="profile.myKeyboards.resumeButton">Resume</Trans>
                    </button>
                  )}
                  {entry.status === "submitted" && entry.prUrl !== null && (
                    <a
                      href={entry.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={actionButtonStyle}
                      aria-label={t({
                        id: "profile.myKeyboards.viewPrAriaLabel",
                        message: `View PR for ${name}`,
                      })}
                    >
                      <Trans id="profile.myKeyboards.viewPrButton">View PR</Trans>
                    </a>
                  )}
                  <button
                    type="button"
                    style={actionButtonStyle}
                    aria-label={t({
                      id: "profile.myKeyboards.deleteAriaLabel",
                      message: `Delete ${name}`,
                    })}
                    onClick={() => handleDelete(entry.projectKey)}
                  >
                    <Trans id="profile.myKeyboards.deleteButton">Delete</Trans>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
