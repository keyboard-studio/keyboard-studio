// Thin custom renderer for the pb_character_inventory decision-spike module
// (km/decisions-spike).
//
// Presentational + controlled: the runner owns the value, this component only
// renders and reports. It reuses the existing character-path helpers
// (`parseUPlusNotation` from @keyboard-studio/contracts, `nfcDedup` from the
// survey character utilities) read-only — PhaseB.tsx and every store are
// untouched. The point: a bulk editor dissolves into the same module registry
// as a one-line question; size lives in the renderer, not the module system.

import { useState } from "react";
import { parseUPlusNotation } from "@keyboard-studio/contracts";
import type { DecisionRendererProps } from "../../decisions/decisionTypes.ts";
import { nfcDedup } from "../charNormUtils.ts";

/** InventoryRenderer's contract: the shared DecisionRendererProps at T = string[]. */
export type InventoryRendererProps = DecisionRendererProps<string[]>;

export function InventoryRenderer({ value, onChange }: InventoryRendererProps) {
  const [draft, setDraft] = useState("");
  // The runner may hand down undefined before the first answer exists.
  const chars = value ?? [];

  const addDraft = () => {
    const text = draft.trim();
    if (text.length === 0) return;
    // Accept U+XXXX notation or a literal character.
    const ch = parseUPlusNotation(text) ?? Array.from(text)[0];
    if (ch === undefined || ch.length === 0) return;
    onChange(nfcDedup([], [...chars, ch]));
    setDraft("");
  };

  const removeChar = (ch: string) => {
    onChange(chars.filter((c) => c !== ch));
  };

  return (
    <div className="inventory-renderer">
      <div role="list" aria-label="Character inventory">
        {chars.map((ch) => (
          <div key={ch} role="listitem">
            <button
              type="button"
              title={`Remove ${ch}`}
              aria-label={`Remove ${ch}`}
              onClick={() => removeChar(ch)}
            >
              {ch}
            </button>
          </div>
        ))}
      </div>
      <input
        aria-label="Add a character (literal or U+XXXX)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addDraft();
        }}
      />
      <button type="button" onClick={addDraft}>
        Add
      </button>
    </div>
  );
}
