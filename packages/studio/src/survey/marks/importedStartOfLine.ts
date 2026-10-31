// importedStartOfLine — the Track 2 import seed for the per-mark
// "start of line" box (issue #2374).
//
// Moved from the retired `guardSpecification.ts` (spec 104 FR-013): the
// keyboard-wide guard seed is gone, but its classification still feeds the
// per-mark box seeding — an imported keyboard whose T_ mark keys produce
// their marks UNGUARDED (with no guarded ones) seeds every attachment row's
// start-of-line box ticked (`origin: "imported"`), so a re-imported
// emit-keyboard does not silently flip to blocked-at-line-start. Guarded
// marks, a mixed population, or no T_ mark keys seed nothing (the unchecked
// default already reproduces the guarded behaviour).
//
// Detection reuses contracts signals only (the spec 063 rule join's role
// classification + produced sets) — no hand-rolled rule parsing: a T_
// mark key is GUARDED when one of its bindings is a `guard` rule
// (`any(diablock) + [T_0300] > context`) or a context-carrying producing
// rule, and UNGUARDED when it produces its mark with neither.

import type {
  KeyboardIR,
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  producedByKeyId,
} from "@keyboard-studio/contracts";

/** Every char is one combining mark (Mn/Mc/Me) — the keyIdMinting test, restated locally. */
const COMBINING_MARK_RE = /^\p{M}$/u;

function isMarkChar(ch: string): boolean {
  return COMBINING_MARK_RE.test(ch);
}

/** Visit every key occurrence in a layout, subkeys (sk / multitap / flick) included. */
function walkKeys(
  layout: TouchLayoutIR,
  visit: (key: TouchKeyIR, platformId: string, layerId: string) => void,
): void {
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      const walk = (key: TouchKeyIR): void => {
        visit(key, platform.id, layer.id);
        for (const sub of key.sk ?? []) walk(sub);
        for (const sub of key.multitap ?? []) walk(sub);
        if (key.flick) {
          for (const sub of Object.values(key.flick)) {
            if (sub) walk(sub);
          }
        }
      };
      for (const row of layer.rows) {
        for (const key of row.keys) walk(key);
      }
    }
  }
}

interface MarkKeyClass {
  guarded: number;
  unguarded: number;
}

/**
 * Classify an IR's T_ mark keys by whether their production is guarded.
 * A key counts once per distinct id — the same T_ id on three layers is
 * one key identity with one behaviour.
 */
function classifyImportedMarkKeys(ir: KeyboardIR): MarkKeyClass {
  const index = buildTouchKeyRuleIndex(ir);
  const seen = new Set<string>();
  let guarded = 0;
  let unguarded = 0;
  if (ir.touchLayout == null) return { guarded, unguarded };
  walkKeys(ir.touchLayout, (key) => {
    if (!key.id.startsWith("T_") || seen.has(key.id)) return;
    const produced = producedByKeyId(index, key.id);
    if (!produced.some((ch) => isMarkChar(ch))) return;
    seen.add(key.id);
    const isGuarded = bindingsForKeyId(index, key.id).some(
      (b) => b.role === "guard" || b.contextGuarded,
    );
    if (isGuarded) guarded += 1;
    else unguarded += 1;
  });
  return { guarded, unguarded };
}

/**
 * Whether the imported keyboard's own marks seed the start-of-line box
 * ticked: unguarded producing T_ mark keys and no guarded ones. Anything
 * else — guarded marks, a mixed population, no T_ mark keys — seeds
 * nothing; the unticked default already matches.
 */
export function detectImportedStartOfLineSeed(ir: KeyboardIR): boolean {
  const { guarded, unguarded } = classifyImportedMarkKeys(ir);
  return guarded === 0 && unguarded > 0;
}
