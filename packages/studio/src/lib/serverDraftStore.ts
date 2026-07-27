// serverDraftStore — transport for the signed-in cloud-draft backup.
//
// A signed-in author's in-progress keyboard is mirrored to the server so it
// survives a cleared browser, a new tab, or a different device. This module is
// only the HTTP transport to /drafts (see api/drafts/* and the backend
// draft-handlers); the capture/apply of the draft record itself, and the
// debounced sync orchestration, live in draftPersistence.ts
// (recordProjectSubmission / deleteProject / startCloudSync).
//
// Guests never reach here — every call requires a verified GitHub token, which
// the backend re-verifies against GitHub /user. The server, not the client, is
// the source of the owner identity; we only carry the bearer token.
//
// All calls fail soft: a network error, 401, 502, or 503 resolves to a benign
// result (null on read, false on write, [] on list) so the local-first
// localStorage path keeps working and authoring never breaks on a backend
// hiccup.
//
// Multi-project ("My keyboards") note: every per-project call below threads a
// `draftId` (the client's projectKey — see draftPersistence.ts) through to the
// `?draftId=` query string. The backend's PUT handler actually reads the
// routing id from `meta.draftId` in the body (not the query string) — see
// api/drafts/index.ts putDraft — but we still append it to the URL on PUT too,
// for symmetry with GET/DELETE. Omitting `draftId` (the pre-multi-draft call
// shape) lands in the server's reserved single-slot default, unchanged from
// today.
//
// Ported from dev's reference implementation (specs/047-my-keyboards) with the
// HTTP contract kept identical; the only change is the local `draft` parameter
// type, which is main's `DurableDraft` rather than dev's separate `StudioDraft`
// shape. `DurableDraft` is imported from draftTypes.ts (NOT draftPersistence.ts)
// deliberately — draftPersistence.ts has a real runtime dependency on THIS
// module (recordProjectSubmission/deleteProject/startCloudSync call the fetch
// functions below), so this module must not import anything, even a type,
// back from draftPersistence.ts — depcruise flags type-only cycles too. See
// draftTypes.ts's header comment.

import { getBackendUrl } from "./githubOAuth.ts";
import type { DurableDraft, DraftMeta } from "./draftTypes.ts";

/** Metadata row the server keeps alongside the opaque draft blob. */
export interface ServerDraftMeta {
  savedAt: number;
  activeStepId: string;
  label: string | null;
  keyboardId: string | null;
  schemaVersion: number;
  /**
   * The client's per-project key ("My keyboards"). Optional so a pre-existing
   * caller shape (single-draft era) still type-checks; the server defaults an
   * absent value to its reserved single-slot id.
   */
  draftId?: string;
  /** Draft lifecycle; the server defaults this to "draft" when omitted. */
  status?: "draft" | "submitted";
  /** URL of the PR opened from this draft, once submitted, or null. */
  prUrl?: string | null;
}

function draftsUrl(path: string, draftId?: string): string {
  const base = `${getBackendUrl()}/drafts${path}`;
  return draftId !== undefined ? `${base}?draftId=${encodeURIComponent(draftId)}` : base;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Convert a server metadata row to a resume-affordance DraftMeta (cloud source). */
export function serverMetaToDraftMeta(meta: ServerDraftMeta): DraftMeta {
  return {
    savedAt: meta.savedAt,
    activeStepId: meta.activeStepId as DraftMeta["activeStepId"],
    label: meta.label,
    source: "cloud",
  };
}

/**
 * Upsert the caller's draft for one project on the server. Returns true on
 * success. Swallows every failure (offline, quota/413, 401, 5xx) as false —
 * the caller keeps the local draft regardless.
 */
export async function saveServerDraft(
  token: string,
  meta: ServerDraftMeta,
  draft: DurableDraft,
  draftId: string,
): Promise<boolean> {
  try {
    const res = await fetch(draftsUrl("", draftId), {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ meta, draft }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget save for page-unload flushes. Uses fetch keepalive so the
 * request survives the document being torn down (sendBeacon can't set the
 * Authorization header, so keepalive fetch is used instead). Best-effort.
 */
export function saveServerDraftBeacon(
  token: string,
  meta: ServerDraftMeta,
  draft: DurableDraft,
  draftId: string,
): void {
  try {
    void fetch(draftsUrl("", draftId), {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ meta, draft }),
      keepalive: true,
    });
  } catch {
    // Unload path — nothing we can do; the local draft is already saved.
  }
}

/** Fetch one project's server draft metadata (for a future resume affordance), or null. */
export async function loadServerDraftMeta(
  token: string,
  draftId: string,
): Promise<ServerDraftMeta | null> {
  try {
    const res = await fetch(draftsUrl("", draftId), { method: "GET", headers: authHeaders(token) });
    if (!res.ok) return null;
    const body = (await res.json()) as { meta: ServerDraftMeta | null };
    return body.meta ?? null;
  } catch {
    return null;
  }
}

/**
 * List every one of the caller's projects' server metadata ("My keyboards"),
 * newest caller-side sort left to the consumer. Returns `[]` on any failure
 * (network, 401, 502, 503) — the list screen falls back to the local project
 * index rather than erroring the whole page.
 */
export async function listServerDrafts(token: string): Promise<ServerDraftMeta[]> {
  try {
    const res = await fetch(draftsUrl(""), { method: "GET", headers: authHeaders(token) });
    if (!res.ok) return [];
    const body = (await res.json()) as { drafts: ServerDraftMeta[] };
    return Array.isArray(body.drafts) ? body.drafts : [];
  } catch {
    return [];
  }
}

/** Fetch one project's full server draft payload (for Restore), or null. */
export async function loadServerDraftContent(
  token: string,
  draftId: string,
): Promise<DurableDraft | null> {
  try {
    const res = await fetch(draftsUrl("/content", draftId), {
      method: "GET",
      headers: authHeaders(token),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { draft: DurableDraft | null };
    return body.draft ?? null;
  } catch {
    return null;
  }
}

/** Delete one project's server draft. Best-effort; returns true on success. */
export async function clearServerDraft(token: string, draftId: string): Promise<boolean> {
  try {
    const res = await fetch(draftsUrl("", draftId), { method: "DELETE", headers: authHeaders(token) });
    return res.ok;
  } catch {
    return false;
  }
}
