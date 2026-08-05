/**
 * Facet-definition loader + validator (spec 036 T024; US2 acceptance 3).
 *
 * Reads every `content/keyboard-facets/*.yaml` definition and validates each
 * against contracts/facet-definition.schema.md before the build reads it, so a
 * malformed definition fails the build loud rather than shipping a broken shape.
 *
 * Checks implemented here (the definition-shape gate the build depends on):
 *   - shape: the JSON-Schema required fields + types + `id` pattern.
 *   - C1 id↔path:   `id` matches the filename stem.
 *   - C2 uniqueness: no duplicate `id` across the directory.
 *   - C3 limits↔valueType: enum/set/histogram ⇒ `limits.values` present + non-empty;
 *                          scalar ⇒ `limits.domain` present.
 *
 * C4 (feedsSessionFacets resolve to real content/facets ids) and C5 (self-check)
 * are the repo-lint's job (T032) — they cross-reference the wider catalog and are
 * reimplemented there in the `facet-lint` JS style. This module is the build-time
 * subset the orchestrator needs to load defs safely.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { parse as parseYaml } from "yaml";

import type { FacetDefinition } from "./types.js";

const ID_RE = /^[a-z][a-z0-9-]*$/;
const VALUE_TYPES = ["enum", "set", "scalar", "histogram"];
const ARCHETYPES = ["character-content", "rule-structure", "declared-metadata"];
const CLOSED_SET_TYPES = ["enum", "set", "histogram"];

/**
 * Validate one parsed definition's shape (JSON-Schema required fields/types +
 * C3 limits↔valueType). Returns an array of human-readable problem strings;
 * empty means the definition is shape-valid. C1/C2 are path/cross-file checks
 * done by the loader, not here.
 */
export function validateFacetDefinition(rec: unknown): string[] {
  const problems: string[] = [];
  const need = (field: string, ok: boolean, why: string): void => {
    if (!ok) problems.push(`${field}: ${why}`);
  };

  if (rec === null || typeof rec !== "object" || Array.isArray(rec)) {
    return ["definition is not a YAML mapping"];
  }
  const r = rec as Record<string, unknown>;

  need("id", typeof r.id === "string" && ID_RE.test(r.id), "must match ^[a-z][a-z0-9-]*$");
  need("title", typeof r.title === "string" && r.title.trim().length > 0, "required non-empty string");
  need(
    "description",
    typeof r.description === "string" && r.description.trim().length > 0,
    "required non-empty string",
  );
  need("valueType", VALUE_TYPES.includes(r.valueType as string), `must be one of ${VALUE_TYPES.join("|")}`);

  // limits shape + C3 limits↔valueType.
  const limits = r.limits;
  if (limits === null || typeof limits !== "object" || Array.isArray(limits)) {
    need("limits", false, "required mapping");
  } else {
    const l = limits as Record<string, unknown>;
    if (l.values !== undefined) {
      need(
        "limits.values",
        Array.isArray(l.values) && l.values.length >= 1 && l.values.every((v) => typeof v === "string"),
        "must be a non-empty array of strings",
      );
    }
    if (l.domain !== undefined) {
      need(
        "limits.domain",
        Array.isArray(l.domain) && l.domain.length === 2 && l.domain.every((v) => typeof v === "number"),
        "must be a [min, max] number pair",
      );
    }
    if (l.open !== undefined) {
      need("limits.open", typeof l.open === "boolean", "must be a boolean");
    }
    // C3: the value domain a facet's type demands must actually be stated.
    if (CLOSED_SET_TYPES.includes(r.valueType as string)) {
      need(
        "limits.values",
        Array.isArray(l.values) && l.values.length >= 1,
        `is required (non-empty) when valueType is ${r.valueType} (C3)`,
      );
    } else if (r.valueType === "scalar") {
      need("limits.domain", Array.isArray(l.domain) && l.domain.length === 2, "is required when valueType is scalar (C3)");
    }
  }

  need(
    "likelihoodSemantics",
    typeof r.likelihoodSemantics === "string" && r.likelihoodSemantics.trim().length > 0,
    "required non-empty string",
  );

  const der = r.derivation;
  if (der === null || typeof der !== "object" || Array.isArray(der)) {
    need("derivation", false, "required mapping");
  } else {
    const d = der as Record<string, unknown>;
    need("derivation.archetype", ARCHETYPES.includes(d.archetype as string), `must be one of ${ARCHETYPES.join("|")}`);
    need(
      "derivation.classifierId",
      typeof d.classifierId === "string" && d.classifierId.trim().length > 0,
      "required non-empty string",
    );
    need(
      "derivation.fallbackChain",
      Array.isArray(d.fallbackChain) && d.fallbackChain.length >= 1 && d.fallbackChain.every((v) => typeof v === "string"),
      "must be a non-empty array of strings",
    );
  }

  need(
    "feedsSessionFacets",
    Array.isArray(r.feedsSessionFacets) && r.feedsSessionFacets.every((v) => typeof v === "string"),
    "must be an array of strings",
  );
  need("schemaVersion", Number.isInteger(r.schemaVersion) && (r.schemaVersion as number) >= 1, "must be an integer >= 1");

  return problems;
}

/**
 * Load + validate every `content/keyboard-facets/*.yaml`, sorted by id. Throws
 * (fail loud, US2 acceptance 3) on any shape/C1/C2/C3 violation, aggregating all
 * problems into one message so a caller sees every fault at once. Returns [] when
 * the directory does not exist (no facets defined yet).
 */
export function loadFacetDefs(dir: string): FacetDefinition[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  const problems: string[] = [];
  const seen = new Map<string, string>();
  const defs: FacetDefinition[] = [];

  for (const file of files) {
    const stem = basename(file, ".yaml");
    let rec: unknown;
    try {
      rec = parseYaml(readFileSync(join(dir, file), "utf8"));
    } catch (err) {
      problems.push(`${file}: YAML parse error: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }

    for (const p of validateFacetDefinition(rec)) problems.push(`${file}: ${p}`);

    const id = (rec as { id?: unknown })?.id;
    if (typeof id !== "string") continue;

    // C1 id↔path.
    if (id !== stem) problems.push(`${file}: id '${id}' does not match filename stem '${stem}' (C1)`);
    // C2 uniqueness.
    if (seen.has(id)) problems.push(`${file}: duplicate facet id '${id}' (also in ${seen.get(id)}) (C2)`);
    else seen.set(id, file);

    defs.push(rec as FacetDefinition);
  }

  if (problems.length > 0) {
    throw new Error(
      `facet-index build: ${problems.length} facet-definition problem(s) in ${dir}:\n  ` + problems.join("\n  "),
    );
  }

  return defs.sort((a, b) => a.id.localeCompare(b.id));
}
