// serverDraftStore — transport for the signed-in cloud-draft backup.
//
// A signed-in author's in-progress keyboard is mirrored to the server so it
// survives a cleared browser, a new tab, or a different device. This module is
// only the HTTP transport to /drafts (see api/drafts/* and the backend
// draft-handlers); the capture/apply of the StudioDraft itself, and the
// debounced sync orchestration, live in draftAutosave.ts.
//
// Guests never reach here — every call requires a verified GitHub token, which
// the backend re-verifies against GitHub /user. The server, not the client, is
// the source of the owner identity; we only carry the bearer token.
//
// All calls fail soft: a network error, 401, 502, or 503 resolves to a benign
// result (null on read, false on write) so the local-first localStorage path
// keeps working and authoring never breaks on a backend hiccup.

import { getBackendUrl } from "./githubOAuth.ts";
import type { StudioDraft, DraftMeta } from "./draftTypes.ts";

/** Metadata row the server keeps alongside the opaque draft blob. */
export interface ServerDraftMeta {
  savedAt: number;
  activeStepId: string;
  label: string | null;
  keyboardId: string | null;
  schemaVersion: number;
}

function draftsUrl(path = ""): string {
  return `${getBackendUrl()}/drafts${path}`;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Convert a server metadata row to the resume-banner DraftMeta (cloud source). */
export function serverMetaToDraftMeta(meta: ServerDraftMeta): DraftMeta {
  return {
    savedAt: meta.savedAt,
    activeStepId: meta.activeStepId as DraftMeta["activeStepId"],
    label: meta.label,
    source: "cloud",
  };
}

/**
 * Upsert the caller's draft on the server. Returns true on success. Swallows
 * every failure (offline, quota/413, 401, 5xx) as false — the caller keeps the
 * local draft regardless.
 */
export async function saveServerDraft(
  token: string,
  meta: ServerDraftMeta,
  draft: StudioDraft,
): Promise<boolean> {
  try {
    const res = await fetch(draftsUrl(), {
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
  draft: StudioDraft,
): void {
  try {
    void fetch(draftsUrl(), {
      method: "PUT",
      headers: authHeaders(token),
      body: JSON.stringify({ meta, draft }),
      keepalive: true,
    });
  } catch {
    // Unload path — nothing we can do; the local draft is already saved.
  }
}

/** Fetch the server draft metadata (for the resume banner), or null. */
export async function loadServerDraftMeta(token: string): Promise<ServerDraftMeta | null> {
  try {
    const res = await fetch(draftsUrl(), { method: "GET", headers: authHeaders(token) });
    if (!res.ok) return null;
    const body = (await res.json()) as { meta: ServerDraftMeta | null };
    return body.meta ?? null;
  } catch {
    return null;
  }
}

/** Fetch the full server draft payload (for Restore), or null. */
export async function loadServerDraftContent(token: string): Promise<StudioDraft | null> {
  try {
    const res = await fetch(draftsUrl("/content"), { method: "GET", headers: authHeaders(token) });
    if (!res.ok) return null;
    const body = (await res.json()) as { draft: StudioDraft | null };
    return body.draft ?? null;
  } catch {
    return null;
  }
}

/** Delete the caller's server draft. Best-effort; returns true on success. */
export async function clearServerDraft(token: string): Promise<boolean> {
  try {
    const res = await fetch(draftsUrl(), { method: "DELETE", headers: authHeaders(token) });
    return res.ok;
  } catch {
    return false;
  }
}
