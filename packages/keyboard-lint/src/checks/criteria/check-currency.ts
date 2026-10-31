// Check 18.7 — KM_LINT_MANDATED_CHAR_MISSING (spec 084 Batch 3).
//
// "The keyboard can produce the mandated characters for currency (if
// applicable)": for every BCP47 tag with a region subtag, CLDR's
// territory data names the region's current currency and its symbol;
// every constituent character of that symbol must be producible by
// the keyboard (the produced set, as scanned for the encoding
// checks). A symbol character the keyboard cannot produce → finding.
//
// Degradation is the assembly's job, not the check's: when a tag's
// region has NO CLDR currency entry, the assembly names this code in
// contextMissing so the row resolves Not yet checkable with that
// reason — never a guessed mandate. A tag with no region subtag
// mandates nothing and is silent here.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { CLDR_TERRITORY_CURRENCY } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";
import { regionSubtagOf } from "./check-bcp47.js";
import { producedCharacters } from "./check-produced-set.js";

/** One region's unmet currency mandate. */
export interface MandatedCurrencyGap {
  region: string;
  currencyCode: string;
  symbol: string;
  /** The symbol's constituent characters the keyboard cannot produce. */
  missingChars: string[];
}

/**
 * The currency mandates the keyboard fails, one per region (regions
 * deduplicated across tags). Regions with no CLDR entry are skipped —
 * the assembly names them context-missing instead.
 */
export function mandatedCurrencyGaps(
  ir: KeyboardIR,
  tags: readonly string[],
): MandatedCurrencyGap[] {
  const produced = producedCharacters(ir);
  const regions = new Set<string>();
  for (const tag of tags) {
    const region = regionSubtagOf(tag);
    if (region !== undefined) regions.add(region.toUpperCase());
  }
  const gaps: MandatedCurrencyGap[] = [];
  for (const region of [...regions].sort()) {
    const entry = CLDR_TERRITORY_CURRENCY[region];
    if (entry === undefined) continue;
    const missingChars = [...new Set([...entry.symbol])].filter(
      (ch) => !produced.has(ch),
    );
    if (missingChars.length > 0) {
      gaps.push({
        region,
        currencyCode: entry.currency,
        symbol: entry.symbol,
        missingChars,
      });
    }
  }
  return gaps;
}

/** 18.7 — an unproducible mandated currency symbol → one finding. */
export function checkMandatedCurrencyChars(
  ir: KeyboardIR,
  tags: readonly string[],
  keyboardId: string,
): CheckResult {
  const gaps = mandatedCurrencyGaps(ir, tags);
  if (gaps.length === 0) {
    const regions = [
      ...new Set(
        tags
          .map((t) => regionSubtagOf(t))
          .filter((r): r is string => r !== undefined)
          .map((r) => r.toUpperCase()),
      ),
    ].sort();
    if (regions.length === 0)
      return checkPassed("KM_LINT_MANDATED_CHAR_MISSING", [
        "No region subtags in the tags: no currency mandate.",
      ]);
    return checkPassed("KM_LINT_MANDATED_CHAR_MISSING", [
      `All currency symbols producible for region(s): ${regions.join(", ")}.`,
    ]);
  }
  const detail = gaps
    .map(
      (g) =>
        `${g.region} (${g.currencyCode} "${g.symbol}": missing ${g.missingChars.join(", ")})`,
    )
    .join("; ");
  return checkFailed("KM_LINT_MANDATED_CHAR_MISSING", [
    criteriaFinding({
      code: "KM_LINT_MANDATED_CHAR_MISSING",
      file: kmnPath(keyboardId),
      message: `The keyboard cannot produce the mandated currency character(s) for its region(s): ${detail}.`,
      hint: "Add the currency symbol's characters to the keyboard's output (or correct the region subtag).",
    }),
  ]);
}
