// useSourcedExemplars — the Phase B propose-then-confirm inventory for the
// target language (spec 044 FR-016/FR-017).
//
// Reads the engine's single sourcing path through lib/services.ts, which loads
// the committed, pinned CLDR+SLDR index. Offline: no network request is made,
// here or anywhere downstream.
//
// `null` is a first-class, expected result — neither source covers the tag, or
// the confidence gate fired. The caller must then omit the exemplar option
// ENTIRELY rather than showing an empty or disabled one (obligation P2).

import { useEffect, useState } from "react";
import type { SourcedInventory } from "../lib/services.ts";
import { sourcedExemplars } from "../lib/services.ts";

export interface SourcedExemplarsState {
  /** null once resolved with no coverage; also null while still loading. */
  inventory: SourcedInventory | null;
  /** True until the lookup settles — the offer must not flash in and out. */
  loading: boolean;
}

/**
 * Resolve the sourced exemplar inventory for `bcp47`.
 *
 * Returns `{ inventory: null, loading: true }` until the index chunk resolves.
 * A failed lookup degrades to `{ inventory: null, loading: false }` — the
 * discovery-method list then shows today's two options, which is exactly the
 * pre-044 behaviour, so a missing or unloadable index can never block the step.
 */
export function useSourcedExemplars(bcp47: string | undefined): SourcedExemplarsState {
  const [state, setState] = useState<SourcedExemplarsState>({ inventory: null, loading: true });

  useEffect(() => {
    if (bcp47 === undefined || bcp47.trim() === "") {
      setState({ inventory: null, loading: false });
      return;
    }
    let cancelled = false;
    setState({ inventory: null, loading: true });
    sourcedExemplars(bcp47)
      .then((inventory) => {
        if (!cancelled) setState({ inventory, loading: false });
      })
      .catch(() => {
        // Degrade to "no proposal available" rather than surfacing an error:
        // the author still has every pre-044 way to build their alphabet.
        if (!cancelled) setState({ inventory: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [bcp47]);

  return state;
}

/** Characters of one tier, in the order the source attested them. */
export function tierChars(inv: SourcedInventory, tier: string): string[] {
  return inv.characters.filter((c) => c.tier === tier).map((c) => c.char);
}
