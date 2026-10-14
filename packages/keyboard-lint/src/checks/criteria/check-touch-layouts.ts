// Check 7.19 — KM_LINT_REDUNDANT_TOUCH_LAYOUTS (spec 084 Batch 2).
//
// "If both phone and tablet touch layouts are identical, removal of
// one was requested." When the two platforms carry the same layers,
// the tablet platform adds nothing — Keyman falls back to the phone
// layout — so shipping both is dead weight the source review asks to
// remove.
//
// The comparison is a normalized deep-compare of the two platforms'
// LAYERS (ids, rows, key ids and key text, in order). The platforms'
// font selections are excluded: layout identity is what this criterion
// judges, and a font difference between the platforms is criterion
// 7.20's finding on its own row.

import type { LintFinding, TouchLayoutIR } from "@keyboard-studio/contracts";
import { criteriaFinding } from "./_shared.js";

/** Canonical string form of one platform's layers, for comparison. */
function canonicalLayers(platform: TouchLayoutIR["platforms"][number]): string {
  return JSON.stringify(
    platform.layers.map((layer) => ({
      id: layer.id,
      rows: layer.rows.map((row) =>
        row.keys.map((key) => ({ id: key.id, text: key.text ?? "" })),
      ),
    })),
  );
}

/** 7.19 — phone and tablet platforms both present with identical layers → finding. */
export function checkRedundantTouchLayouts(
  touchLayout: TouchLayoutIR,
  touchLayoutPath: string,
): LintFinding[] {
  const phone = touchLayout.platforms.find((p) => p.id === "phone");
  const tablet = touchLayout.platforms.find((p) => p.id === "tablet");
  if (phone === undefined || tablet === undefined) return [];
  if (phone.layers.length === 0) return [];
  if (canonicalLayers(phone) !== canonicalLayers(tablet)) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_REDUNDANT_TOUCH_LAYOUTS",
      file: touchLayoutPath,
      message:
        "The phone and tablet touch layouts are identical; one of them is redundant.",
      hint: "Remove the duplicate platform layout — Keyman uses the remaining layout for both form factors.",
    }),
  ];
}
