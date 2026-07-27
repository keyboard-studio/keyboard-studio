// firstVisit — the durable "has this browser seen the app before?" flag.
//
// Backs the first-visit landing gate (proposal §9, docs/proposal-identity-ux-
// and-resume.md): a genuine first-time visitor lands on the WelcomeScreen; a
// returning visitor (or one with a resumable draft) skips straight into the
// app. The flag lives in localStorage so it survives reloads and the OAuth
// sign-in round trip (which returns to the app root with no hash).
//
// Writes are synchronous, so markVisited() called in a WelcomeScreen button
// handler is durably persisted before connect() redirects to the provider.

import { storageAvailable } from "./storageGuard.ts";

/** localStorage key for the durable first-visit flag. */
const VISITED_KEY = "ks.visited";

/** True once the browser has entered the app at least once. */
export function hasVisited(): boolean {
  if (!storageAvailable()) return false;
  try {
    return localStorage.getItem(VISITED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Mark this browser as having visited — called when leaving the welcome screen. */
export function markVisited(): void {
  if (!storageAvailable()) return;
  try {
    localStorage.setItem(VISITED_KEY, "1");
  } catch {
    // Quota / private-mode — a re-shown welcome screen is a harmless fallback.
  }
}
