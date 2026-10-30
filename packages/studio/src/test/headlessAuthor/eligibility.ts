// Eligibility -- decided BEFORE scaffolding (spec 107 research R6), so that
// "skipped" means only "not eligible" and a keyboard that passes here and then
// fails to scaffold is a failure, never a skip. There is no try/catch around
// parse() or the scaffold anywhere in the author.
//
// Order: present under the corpus root; import-corpus status clean or
// clean-with-opaque; script not routed to the CJK/Ethiopic stub by the
// product's own routing (isExcludedScript); inside the requested slice.

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
  /** The `docs/import-corpus.json` status for `base`, or undefined when unlisted. */
  importStatus?: (base: string) => string | undefined;
  /** The keyboard's script as the product's .kps reader derives it. */
  scriptOf?: (base: string, group: string) => string | undefined;
}

let importStatusCache: Map<string, string> | undefined;

function defaultImportStatus(base: string): string | undefined {
  if (importStatusCache === undefined) {
    const doc = JSON.parse(readFileSync(IMPORT_CORPUS_PATH, "utf8")) as {
      keyboards: { keyboardId: string; status: string }[];
    };
    importStatusCache = new Map(doc.keyboards.map((k) => [k.keyboardId, k.status]));
  }
  return importStatusCache.get(base);
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

  const status = (deps.importStatus ?? defaultImportStatus)(base);
  if (status !== "clean" && status !== "clean-with-opaque") return no("not-codec-clean");

  const script = (deps.scriptOf ?? defaultScriptOf)(base, group);
  if (script !== undefined && isExcludedScript(script)) return no("unsupported-script-stub");

  if (slice === "latin" && script !== "Latn") return no("outside-slice");
  if (typeof slice === "object" && !slice.ids.includes(base)) return no("outside-slice");

  return { eligible: true, group };
}
