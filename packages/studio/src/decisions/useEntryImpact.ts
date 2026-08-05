// useEntryImpact — resolve ONE entry's impact when the author expands it, and not
// before (spec 059 FR-011, contracts/impact-resolution.md §4).
//
// The trail mounts having computed no impact for any entry. That is a property of
// this hook's shape, not a claim about how fast the resolution is: `expanded` gates
// the effect, so a hundred collapsed rows do a hundred times nothing. 053 FR-010 and
// 057 FR-011 both hold by construction (SC-006).
//
// Two things earn their complexity here:
//
//   A STORED CAPTURE RESOLVES SYNCHRONOUSLY, on the first render, with
//   `pending: false`. Routing it through the async path would make a fact recorded
//   at a step boundary flicker through "working it out…" every time the row is
//   opened — an artifact of the plumbing, not of anything the author did.
//
//   A SUPERSEDED REQUEST IS DISCARDED, not applied. Collapse-then-expand, or a
//   newer expand of the same row, must not have an older in-flight projection land
//   on top of the newer answer.
//
// NOT MEMOISED across collapse/expand, deliberately: the working copy may have moved
// on between openings, and a re-derived counterfactual should reflect the artifact as
// it now is. Same reasoning as the existing comment in DecisionEntryRow.

import { useEffect, useRef, useState } from "react";
import type { DecisionEntry, DecisionImpact } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";

export interface EntryImpactState {
  /**
   * The resolved impact, or `null` for a shed entry (and while a first async
   * resolution is still in flight — read `pending` to tell those apart).
   */
  impact: DecisionImpact | null;
  /** True while an async resolution for this expansion is outstanding. */
  pending: boolean;
}

/**
 * Whether this entry's impact can be answered without going async.
 *
 * Mirrors the first two rows of the resolver's precedence table: a shed entry and a
 * stored capture are both known facts, and neither is re-derived.
 */
function storedAnswer(entry: DecisionEntry): { known: true; impact: DecisionImpact | null } | { known: false } {
  if (entry.impact === null) return { known: true, impact: null };
  if (entry.impact !== undefined) return { known: true, impact: entry.impact };
  return { known: false };
}

/**
 * Resolve `entry`'s impact while `expanded`, via the injected async resolver.
 *
 * The resolver is a parameter rather than an import so `decisions/` keeps needing no
 * store import — the same arrangement `DecisionTrailView` already uses for the sync
 * resolver, which is what lets the trail render against a fixture record.
 *
 * There is deliberately NO batch form and no signature accepting a list of entries:
 * FR-011 is about what can be asked, not about what happens to be fast.
 */
export function useEntryImpact(
  entry: DecisionEntry,
  expanded: boolean,
  resolve: (entry: DecisionEntry) => Promise<DecisionImpact | null>,
): EntryImpactState {
  const stored = storedAnswer(entry);
  const [asyncState, setAsyncState] = useState<EntryImpactState>({
    impact: null,
    pending: false,
  });

  // Monotonic request id: only the newest expansion's result may be applied.
  const requestRef = useRef(0);

  useEffect(() => {
    // Nothing runs until the author expands (FR-011), and nothing runs for an entry
    // whose answer is already known (SC-005).
    if (!expanded || stored.known) {
      setAsyncState({ impact: null, pending: false });
      return;
    }

    const requestId = ++requestRef.current;
    let cancelled = false;
    setAsyncState({ impact: null, pending: true });

    resolve(entry)
      .then((impact) => {
        if (cancelled || requestId !== requestRef.current) return;
        setAsyncState({ impact, pending: false });
      })
      .catch((err: unknown) => {
        // LOG FIRST, then map. The author-facing message for a thrown derivation and
        // for "no base chosen yet" is deliberately the same — there is nothing else
        // honest to say to them without a result — but the two are NOT the same event
        // for a developer, and swallowing the error entirely would make a real
        // regression in the projection read as ordinary, expected behaviour.
        devLog.warn(
          `[useEntryImpact] impact resolution failed for ${entry.entryId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (cancelled || requestId !== requestRef.current) return;
        // A failed projection is not an impact of "none" — the row must not read as
        // "this decision changed nothing" because a derivation threw.
        setAsyncState({
          impact: { state: "unavailable", reason: "no-working-copy-yet" },
          pending: false,
        });
      });

    return () => {
      // A collapse (or a newer expand) supersedes this request; its result is
      // discarded rather than applied to whatever the row now shows.
      cancelled = true;
    };
    // `stored.known` rather than `stored` — a fresh object each render would
    // re-run the effect on every render and re-project on every keystroke elsewhere
    // in the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, expanded, stored.known, resolve]);

  // A stored capture (or a shed entry) answers immediately, with no pending state.
  if (stored.known) return { impact: stored.impact, pending: false };
  return asyncState;
}
