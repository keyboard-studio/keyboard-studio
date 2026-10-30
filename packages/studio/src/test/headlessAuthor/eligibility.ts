// Eligibility -- decided BEFORE scaffolding (spec 107 research R6), so that
// "skipped" means only "not eligible" and a keyboard that passes here and then
// fails to scaffold is a failure, never a skip. There is no try/catch around
// parse() or the scaffold anywhere in the author.
//
// Order: present under the corpus root; the codec parses it completely
// (docs/import-corpus.json: no parse errors and Layer A' I1 parse-complete);
// script not routed to the CJK/Ethiopic stub by the product's own routing
// (isExcludedScript); inside the requested slice.
//
// Parse completeness, not round-trip status, is what Art. II protects: a
// starting point the codec cannot parse fails the whole scaffold. A
// `round-trip-divergence` keyboard parses fully and only emits a structurally
// different .kmn (byte-identical round-trip is out of scope for v1); spec 106's
// replay already compiles three of them (basic_kbdfr, sil_cameroon_qwerty,
// sil_cameroon_azerty). The skip reason keeps its id, `not-codec-clean`, and
// means "the codec does not parse it completely" (owner ruling, 2026-10-30).

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

export type Slice = "all-eligible" | "latin" | { ids: readonly string[] };

export interface EligibilityDeps {
  /** The directory under the corpus root holding `<base>/`, or undefined when absent. */
  groupOf?: (base: string) => string | undefined;
  /**
   * Whether the codec parses `base` completely, per `docs/import-corpus.json`
   * (no parse errors, I1 parse-complete); undefined when unlisted.
   */
  parsesCompletely?: (base: string) => boolean | undefined;
  /** The keyboard's script as the product's .kps reader derives it. */
  scriptOf?: (base: string, group: string) => string | undefined;
}

let parseCache: Map<string, boolean> | undefined;

function defaultParsesCompletely(base: string): boolean | undefined {
  if (parseCache === undefined) {
    const doc = JSON.parse(readFileSync(IMPORT_CORPUS_PATH, "utf8")) as {
      keyboards: { keyboardId: string; parseErrors: unknown[]; layerAPrime?: { i1ParseComplete?: boolean } }[];
    };
    parseCache = new Map(
      doc.keyboards.map((k) => [k.keyboardId, k.parseErrors.length === 0 && k.layerAPrime?.i1ParseComplete === true]),
    );
  }
  return parseCache.get(base);
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
): { eligible: true; group: string } | { eligible: false; reason: SkipReason } {
  const no = (reason: SkipReason): { eligible: false; reason: SkipReason } => ({ eligible: false, reason });

  const group = (deps.groupOf ?? ((b: string) => lookupGroup(b)))(base);
  if (group === undefined) return no("missing");

  if ((deps.parsesCompletely ?? defaultParsesCompletely)(base) !== true) return no("not-codec-clean");

  const script = (deps.scriptOf ?? defaultScriptOf)(base, group);
  if (script !== undefined && isExcludedScript(script)) return no("unsupported-script-stub");

  if (slice === "latin" && script !== "Latn") return no("outside-slice");
  if (typeof slice === "object" && !slice.ids.includes(base)) return no("outside-slice");

  return { eligible: true, group };
}
