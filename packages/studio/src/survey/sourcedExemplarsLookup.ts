// sourcedExemplarsLookup -- the lookup useSourcedExemplars runs for a tag, as a
// plain function so the UI hook and a headless caller (spec 107's scripted
// author) take the same path.

import type { ExemplarInventory } from "../lib/services.ts";
import { sourcedExemplars } from "../lib/services.ts";

/**
 * No tag means no offer; a failed lookup degrades to no offer rather than an
 * error (the author still has every pre-044 way to build their alphabet).
 */
export async function resolveSourcedExemplars(bcp47: string | undefined): Promise<ExemplarInventory | null> {
  if (bcp47 === undefined || bcp47.trim() === "") return null;
  try {
    return await sourcedExemplars(bcp47);
  } catch {
    return null;
  }
}
