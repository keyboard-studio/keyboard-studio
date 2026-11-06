// Check 18.18 — KM_LINT_TOUCH_SYMBOLS_LAYER.
//
// A touch layout has a `symbol` layer, and every other layer carries a
// `K_SYMBOLS` link key to reach it (`symbol-caps` from the caps layers), so
// punctuation and symbols are reachable on a phone or tablet. Layouts that
// use the numerals scheme (a `K_NUMERALS` key, whose `numeric` layer links on
// to symbols and currencies) already provide their own route and need no
// `K_SYMBOLS` key. The symbol family itself (`symbol`, `symbol-caps`,
// `numeric`, `currency`) is exempt from carrying the link.

import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

const CODE = "KM_LINT_TOUCH_SYMBOLS_LAYER";

/** Layers that are part of the symbols route and need no K_SYMBOLS link. */
export const isTouchSymbolFamilyLayer = (id: string): boolean =>
  /^(symbol|numeric|currency)/i.test(id);

/** 18.18 — symbols layer present and linked. `ir` undefined means no touch layout. */
export function checkTouchSymbolsLayer(
  ir: TouchLayoutIR | undefined,
  path: string,
): CheckResult {
  if (ir === undefined) {
    return checkPassed(CODE, ["No touch layout: the symbols layer does not apply."]);
  }
  const findings: ReturnType<typeof criteriaFinding>[] = [];
  let checkedPlatforms = 0;
  for (const platform of ir.platforms) {
    if (!platform.layers.some((l) => l.id === "default")) continue;
    checkedPlatforms += 1;
    const where = `Platform "${platform.id}"`;
    // The numerals scheme reaches symbols through its own layers.
    const usesNumerals = platform.layers.some((l) =>
      l.rows.some((r) => r.keys.some((k) => k.id === "K_NUMERALS")),
    );
    if (usesNumerals) continue;
    if (!platform.layers.some((l) => l.id === "symbol")) {
      findings.push(
        criteriaFinding({
          code: "KM_LINT_TOUCH_SYMBOLS_LAYER",
          file: path,
          message: `${where}: no symbol layer.`,
          hint: "Add a symbol layer of punctuation and symbols, and a K_SYMBOLS key on the other layers to reach it.",
        }),
      );
      continue;
    }
    const unlinked = platform.layers
      .filter((l) => !isTouchSymbolFamilyLayer(l.id))
      .filter((l) => !l.rows.some((r) => r.keys.some((k) => k.id === "K_SYMBOLS")))
      .map((l) => l.id);
    if (unlinked.length > 0) {
      findings.push(
        criteriaFinding({
          code: "KM_LINT_TOUCH_SYMBOLS_LAYER",
          file: path,
          message: `${where}: no K_SYMBOLS link key on: ${unlinked.join(", ")}.`,
          hint: 'Add a { "id": "K_SYMBOLS", "text": "*Symbol*", "sp": 1, "nextlayer": "symbol" } key beside the menu key of each layer (symbol-caps from the caps layers).',
        }),
      );
    }
  }
  if (findings.length > 0) return checkFailed(CODE, findings);
  if (checkedPlatforms === 0) {
    return checkPassed(CODE, ["No touch platform has a default layer: the symbols layer does not apply."]);
  }
  return checkPassed(CODE, [`Checked ${checkedPlatforms} platform(s): the symbol layer exists and is linked.`]);
}
