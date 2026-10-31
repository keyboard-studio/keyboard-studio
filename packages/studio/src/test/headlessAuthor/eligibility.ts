// Eligibility -- decided BEFORE scaffolding (spec 107 research R6), so that
// "skipped" means only "not eligible" and a keyboard that passes here and then
// fails to scaffold is a failure, never a skip. There is no try/catch around
// parse() or the scaffold anywhere in the author.
//
// Order: present under the corpus root; the codec parses it without error
// (docs/import-corpus.json: no parse errors);
// script not routed to the CJK/Ethiopic stub by the product's own routing
// (isExcludedScript); inside the requested slice.
//
// Parse completeness, not round-trip status, is what Art. II protects: a
// starting point the codec cannot parse fails the whole scaffold. A
// `round-trip-divergence` keyboard parses fully and only emits a structurally
// different .kmn (byte-identical round-trip is out of scope for v1); spec 106's
// replay already compiles three of them (basic_kbdfr, sil_cameroon_qwerty,
// sil_cameroon_azerty). Layer A' I1 is not used: it is a token-count
// heuristic with documented false positives (it flags chechen_latin, whose
// readonly groups the codec keeps as fidelity-only groups). A keyboard that
// parses and then fails to scaffold is a failure the sweep reports, never a
// skip. The skip reason keeps its id, `not-codec-clean`, and means "the codec
// reports parse errors" (owner ruling, 2026-10-30).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseKps } from "@keyboard-studio/engine";
import { isExcludedScript } from "../../lib/excludedScriptFamilies.ts";
import { CORPUS } from "../sc004Harness.ts";
import type { SkipReason } from "./caseTypes.ts";
import { lookupGroup } from "./loadCases.ts";

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT_CORPUS_PATH = resolve(here, "../../../../../docs/import-corpus.json");

/**
 * Most rules (`ruleCount` in docs/import-corpus.json) a sweep walk is attempted on. Measured
 * 2026-10-31, one walk each (profile 1, backspace whole, KS_AUTHOR_TRACE=1): 108 rules 3.6 s,
 * 351 rules 5.2 s, 1,802 rules 9.8 s, 2,285 rules 37 s, 3,790 rules 32 s, 4,144 rules 49 s,
 * 25,474 rules over 440 s (killed), 58,026 rules about 900 s. The corpus median is 108 rules, p95
 * 351, max 72,222. Cost is superlinear above about 2,000 rules, so the cap sits just above the
 * largest keyboard measured at under 10 s, leaving a wide margin under the 180 s case timeout on
 * a slower CI runner. It excludes 9 of the 921 keyboards (those with more than 2,000 rules).
 */
export const MAX_SWEEP_RULE_COUNT = 2000;

export type Slice = "all-eligible" | "latin" | { ids: readonly string[] };

export interface EligibilityDeps {
  /** The directory under the corpus root holding `<base>/`, or undefined when absent. */
  groupOf?: (base: string) => string | undefined;
  /**
   * Whether the codec parses `base` without error, per `docs/import-corpus.json`;
   * undefined when unlisted.
   */
  parsesCompletely?: (base: string) => boolean | undefined;
  /** The keyboard's script as the product's .kps reader derives it. */
  scriptOf?: (base: string, group: string) => string | undefined;
  /** The keyboard's rule count per `docs/import-corpus.json`; undefined when unlisted. */
  ruleCountOf?: (base: string) => number | undefined;
}

export interface EligibilityOptions {
  /**
   * Skip keyboards over MAX_SWEEP_RULE_COUNT as `too-large`. Only the sweep tiers set this: the
   * explicit harness, PR-set and single-case runs name their keyboards on purpose.
   */
  sizeCap?: boolean;
}

interface CorpusRow {
  parses: boolean;
  ruleCount: number;
}

let corpusCache: Map<string, CorpusRow> | undefined;

function corpusRow(base: string): CorpusRow | undefined {
  if (corpusCache === undefined) {
    const doc = JSON.parse(readFileSync(IMPORT_CORPUS_PATH, "utf8")) as {
      keyboards: { keyboardId: string; parseErrors: unknown[]; ruleCount: number }[];
    };
    corpusCache = new Map(
      doc.keyboards.map((k) => [k.keyboardId, { parses: k.parseErrors.length === 0, ruleCount: k.ruleCount }]),
    );
  }
  return corpusCache.get(base);
}

function defaultParsesCompletely(base: string): boolean | undefined {
  return corpusRow(base)?.parses;
}

function defaultRuleCountOf(base: string): number | undefined {
  return corpusRow(base)?.ruleCount;
}

function defaultScriptOf(base: string, group: string): string | undefined {
  const kps = join(CORPUS, group, base, "source", `${base}.kps`);
  if (!existsSync(kps)) return undefined;
  return parseKps(readFileSync(kps, "utf8")).script;
}

export function eligibility(
  base: string,
  slice: Slice = "all-eligible",
  deps: EligibilityDeps = {},
  options: EligibilityOptions = {},
): { eligible: true; group: string } | { eligible: false; reason: SkipReason } {
  const no = (reason: SkipReason): { eligible: false; reason: SkipReason } => ({ eligible: false, reason });

  const group = (deps.groupOf ?? ((b: string) => lookupGroup(b)))(base);
  if (group === undefined) return no("missing");

  if ((deps.parsesCompletely ?? defaultParsesCompletely)(base) !== true) return no("not-codec-clean");

  const script = (deps.scriptOf ?? defaultScriptOf)(base, group);
  if (script !== undefined && isExcludedScript(script)) return no("unsupported-script-stub");

  if (slice === "latin" && script !== "Latn") return no("outside-slice");
  if (typeof slice === "object" && !slice.ids.includes(base)) return no("outside-slice");

  if (options.sizeCap === true) {
    const rules = (deps.ruleCountOf ?? defaultRuleCountOf)(base);
    if (rules !== undefined && rules > MAX_SWEEP_RULE_COUNT) return no("too-large");
  }

  return { eligible: true, group };
}
