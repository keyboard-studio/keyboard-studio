// Adaptation-question catalog loader (spec 038; contract question-catalog).
//
// Parses content/adaptation-questions/*.yaml into typed QuestionRecords for the
// firing evaluator. The catalog is the same content-owned data the plain-node
// `adaptation-catalog-lint` validates; this loader is the runtime consumer.
//
// Bundled via Vite import.meta.glob (eager, raw) — the same mechanism
// browserPatternLibrary.ts uses for content/patterns. The glob resolves
// relative to THIS file (packages/studio/src/adaptation/), so the repo-root
// content/ tree is four levels up.

import { parse } from "yaml";

export type QuestionFamily = "script-alignment" | "inheritance-posture" | "trust-policy";

/** A parsed catalog record — the typed mirror of the YAML schema (README). */
export interface QuestionRecord {
  id: string;
  family: QuestionFamily;
  elicits: string;
  firingCondition: string;
  prefill: { facets: string[]; sessionFacet?: string };
  provenanceLabel: string;
  consumers: string[];
  noEvidenceDegradation: "ask-plainly" | "record-no-default";
  scope: "session" | "workflow";
  renders: boolean;
  status: "candidate" | "validated" | "active" | "retired";
}

const FAMILIES: readonly QuestionFamily[] = [
  "script-alignment",
  "inheritance-posture",
  "trust-policy",
];

/**
 * Parse a map of `{ path: rawYaml }` into typed records. Malformed records are
 * skipped with a console warning (the lint is the hard gate; the runtime stays
 * resilient), mirroring browserPatternLibrary.loadAll. Sorted by id for
 * deterministic evaluation order.
 */
export function loadAdaptationCatalog(rawByPath: Record<string, string>): QuestionRecord[] {
  const records: QuestionRecord[] = [];
  for (const [path, raw] of Object.entries(rawByPath)) {
    if (typeof raw !== "string") continue;
    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (e) {
      console.warn(`[adaptation catalog] YAML parse error in ${path}: ${String(e)}`);
      continue;
    }
    const rec = coerce(parsed);
    if (rec === null) {
      console.warn(`[adaptation catalog] skipping ${path}: does not match record schema`);
      continue;
    }
    records.push(rec);
  }
  records.sort((a, b) => a.id.localeCompare(b.id));
  return records;
}

function coerce(parsed: unknown): QuestionRecord | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;
  const prefill = r["prefill"];
  if (
    typeof r["id"] !== "string" ||
    !FAMILIES.includes(r["family"] as QuestionFamily) ||
    typeof r["firingCondition"] !== "string" ||
    prefill === null ||
    typeof prefill !== "object" ||
    !Array.isArray((prefill as Record<string, unknown>)["facets"]) ||
    !Array.isArray(r["consumers"])
  ) {
    return null;
  }
  const p = prefill as Record<string, unknown>;
  return {
    id: r["id"] as string,
    family: r["family"] as QuestionFamily,
    elicits: String(r["elicits"] ?? ""),
    firingCondition: r["firingCondition"] as string,
    prefill: {
      facets: (p["facets"] as unknown[]).map(String),
      ...(typeof p["sessionFacet"] === "string" ? { sessionFacet: p["sessionFacet"] } : {}),
    },
    provenanceLabel: String(r["provenanceLabel"] ?? ""),
    consumers: (r["consumers"] as unknown[]).map(String),
    noEvidenceDegradation: r["noEvidenceDegradation"] as QuestionRecord["noEvidenceDegradation"],
    scope: r["scope"] as QuestionRecord["scope"],
    renders: r["renders"] === true,
    status: r["status"] as QuestionRecord["status"],
  };
}

// ---------------------------------------------------------------------------
// Bundled catalog — the real content/adaptation-questions/*.yaml records.
// Eager glob so the catalog is available synchronously at module init, like the
// browser pattern library. Empty until the US phases land the records.
// ---------------------------------------------------------------------------

const CATALOG_MODULES = import.meta.glob(
  "../../../../content/adaptation-questions/*.yaml",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

/** The bundled catalog, loaded once at module init. */
export const adaptationCatalog: QuestionRecord[] = loadAdaptationCatalog(CATALOG_MODULES);
