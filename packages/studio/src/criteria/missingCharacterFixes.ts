// missingCharacterFixes: the "add character" fix offered for each expected
// character the keyboard cannot type (spec 111 FR-018a). One fix per 18.6
// finding, routed to the mechanisms gallery where the character is placed.
// The fix is an offer: it applies nothing by itself.

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import { findingKeyOf } from "./openRatchet.ts";

export const INVENTORY_UNCOVERED = "KM_LINT_INVENTORY_UNCOVERED";

interface FindingLike {
  code: string;
  message?: string;
  location?: { file?: string } | undefined;
}

export function missingCharacterFixes(findings: readonly FindingLike[]): SuggestedFix[] {
  const out = new Map<string, SuggestedFix>();
  for (const f of findings) {
    if (f.code !== INVENTORY_UNCOVERED) continue;
    const hex = f.message?.match(/U\+([0-9A-Fa-f]{4,6})/)?.[1]?.toUpperCase();
    if (hex === undefined) continue;
    const ch = String.fromCodePoint(parseInt(hex, 16));
    const id = `generate-missing:add:mechanisms:U+${hex}`;
    if (out.has(id)) continue;
    out.set(id, {
      id,
      kind: "generate-missing",
      findingKey: findingKeyOf(f.code, f.location?.file, f.message),
      preview: [],
      status: "pending",
      title: `Add U+${hex} ${ch} to the keyboard`,
      action: { target: "mechanisms", change: "add", subject: ch },
    });
  }
  return [...out.values()];
}
