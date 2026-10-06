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
  // The result is stored WITH the tag it answers. When the tag changes, the
  // render before the effect re-runs would otherwise hand back the previous
  // tag's settled `{ loading: false }` — and a caller that latches its
  // default on the first settled result (IntroChooser) would latch on the
  // wrong answer and never pre-select the exemplar option.
  const [state, setState] = useState<{
    tag: string | undefined;
    inventory: SourcedInventory | null;
  } | null>(null);

  const hasTag = bcp47 !== undefined && bcp47.trim() !== "";

  useEffect(() => {
    if (bcp47 === undefined || !hasTag) return;
    let cancelled = false;
    sourcedExemplars(bcp47)
      .then((inventory) => {
        if (!cancelled) setState({ tag: bcp47, inventory });
      })
      .catch(() => {
        // Degrade to "no proposal available" rather than surfacing an error:
        // the author still has every pre-044 way to build their alphabet.
        if (!cancelled) setState({ tag: bcp47, inventory: null });
      });
    return () => {
      cancelled = true;
    };
  }, [bcp47, hasTag]);

  if (!hasTag) return { inventory: null, loading: false };
  if (state === null || state.tag !== bcp47) return { inventory: null, loading: true };
  return { inventory: state.inventory, loading: false };
}
