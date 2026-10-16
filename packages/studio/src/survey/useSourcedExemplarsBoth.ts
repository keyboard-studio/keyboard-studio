// useSourcedExemplarsBoth — both CLDR and SLDR inventories for the union
// action (#1369).
//
// Returns the CLDR and SLDR inventories separately so the UI can offer the
// "also show what SLDR has" action when both sides cover the tag. Either
// side may be null (doesn't cover the tag, or its gate fired).

import { useEffect, useState } from "react";
import type { SourcedInventory } from "../lib/services.ts";
import { sourcedExemplarsBoth } from "../lib/services.ts";

export interface SourcedExemplarsBothState {
  cldr: SourcedInventory | null;
  sldr: SourcedInventory | null;
  resolvedTag: string | null;
  loading: boolean;
}

export function useSourcedExemplarsBoth(bcp47: string | undefined): SourcedExemplarsBothState {
  const [state, setState] = useState<{
    tag: string | undefined;
    result: { resolvedTag: string; cldr: SourcedInventory | null; sldr: SourcedInventory | null } | null;
  } | null>(null);

  const hasTag = bcp47 !== undefined && bcp47.trim() !== "";

  useEffect(() => {
    if (bcp47 === undefined || !hasTag) return;
    let cancelled = false;
    sourcedExemplarsBoth(bcp47)
      .then((result) => {
        if (!cancelled) setState({ tag: bcp47, result });
      })
      .catch(() => {
        if (!cancelled) setState({ tag: bcp47, result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [bcp47, hasTag]);

  if (!hasTag) return { cldr: null, sldr: null, resolvedTag: null, loading: false };
  if (state === null || state.tag !== bcp47) {
    return { cldr: null, sldr: null, resolvedTag: null, loading: true };
  }
  return {
    cldr: state.result?.cldr ?? null,
    sldr: state.result?.sldr ?? null,
    resolvedTag: state.result?.resolvedTag ?? null,
    loading: false,
  };
}
