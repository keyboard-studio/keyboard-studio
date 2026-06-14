import { parse } from "yaml";
import { PatternSchema } from "./patternSchema.js";
import type { RawPattern } from "./patternSchema.js";
import { runAllChecks } from "../validator/index.js";
import { makePattern } from "@keyboard-studio/contracts";
import type { Pattern, PatternCategory, StrategyId, DemoObject } from "@keyboard-studio/contracts";
import type { PatternFilter, LoadReport } from "./types.js";

/** In-memory cache populated by the last successful {@link loadPatterns} call. */
let _cache: Pattern[] = [];

/**
 * In-flight guard: holds the active `loadPatterns` promise while a load is in
 * progress. A second concurrent call receives the same promise rather than
 * racing to reset `_cache` mid-flight.
 */
let _loading: Promise<{ patterns: Pattern[]; report: LoadReport }> | null = null;

/**
 * Discover and load all YAML pattern files under `contentDir`.
 *
 * Validation failures are collected into a {@link LoadReport} rather than
 * thrown. The cache is replaced atomically on each call. Concurrent calls
 * receive the same in-flight promise so that `_cache` is never reset
 * mid-load by a second caller.
 *
 * @param contentDir - Root of the pattern YAML tree. Defaults to
 *   `<cwd>/content/patterns` so it works in both dev and test contexts.
 * @returns Object with the loaded `patterns` array and a `report` summarising
 *   skipped and flagged files.
 */
export function loadPatterns(
  contentDir?: string,
): Promise<{ patterns: Pattern[]; report: LoadReport }> {
  if (_loading !== null) {
    return _loading;
  }

  _loading = _doLoad(contentDir).finally(() => {
    _loading = null;
  });

  return _loading;
}

async function _doLoad(
  contentDir?: string,
): Promise<{ patterns: Pattern[]; report: LoadReport }> {
  // Dynamic imports keep node:fs/promises and node:path out of the static
  // module graph so Vite can bundle the engine for the browser without errors.
  // loadPatterns() is never called in the browser; the SPA uses import.meta.glob.
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, extname } = await import("node:path");

  const dir = contentDir ?? join(process.cwd(), "content", "patterns");
  const report: LoadReport = { loaded: 0, skipped: [], flagged: [] };
  const patterns: Pattern[] = [];

  let yamlFiles: string[];
  try {
    yamlFiles = await collectYamlFiles(dir, readdir, extname, join);
  } catch (e) {
    console.warn(`[pattern-library] cannot read directory ${dir}: ${String(e)}`);
    _cache = [];
    return { patterns: [], report };
  }

  for (const file of yamlFiles) {
    let raw: string;
    try {
      raw = await readFile(file, "utf-8");
    } catch (e) {
      const reason = `File read error: ${String(e)}`;
      console.warn(`[pattern-library] skipping ${file}: ${reason}`);
      report.skipped.push({ file, reason });
      continue;
    }

    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (e) {
      const reason = `YAML parse error: ${String(e)}`;
      console.warn(`[pattern-library] skipping ${file}: ${reason}`);
      report.skipped.push({ file, reason });
      continue;
    }

    const result = PatternSchema.safeParse(parsed);
    if (!result.success) {
      const reason = result.error.issues
        .map(i => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      console.warn(`[pattern-library] skipping ${file}: ${reason}`);
      report.skipped.push({ file, reason });
      continue;
    }

    const data = result.data;

    // Run TS-portable Layer A checks on demo.filled_kmn if present.
    const demo = data.demo;
    const filledKmn =
      demo !== null &&
      demo !== undefined &&
      typeof demo === "object" &&
      "filled_kmn" in demo
        ? (demo as Record<string, unknown>)["filled_kmn"]
        : undefined;

    if (typeof filledKmn === "string") {
      const findings = runAllChecks(filledKmn);
      const errors = findings.filter(
        f => f.severity === "error" || f.severity === "fatal",
      );
      if (errors.length > 0) {
        const patternId = String(data.id);
        console.warn(
          `[pattern-library] pattern ${patternId} has demo errors: ${errors.map(e => e.code).join(", ")}`,
        );
        report.flagged.push({ patternId, findings: errors });
      }
    }

    patterns.push(toPattern(data));
    report.loaded++;
  }

  _cache = patterns;
  return { patterns, report };
}

/**
 * Return patterns from the in-memory cache, optionally filtered.
 *
 * All filter fields are AND-combined; omitting a field means "match all".
 * The `group_visibility` filter matches patterns whose `group_visibility`
 * is `"all"` OR equals the requested value.
 *
 * @param filter - Optional filter criteria.
 * @returns Matching patterns in cache order.
 */
export function getPatterns(filter?: PatternFilter): Pattern[] {
  let results = _cache;

  if (filter?.group_visibility !== undefined) {
    const wanted = filter.group_visibility;
    results = results.filter(
      p => p.group_visibility === "all" || p.group_visibility === wanted,
    );
  }

  if (filter?.category !== undefined) {
    const wanted = filter.category;
    results = results.filter(p => p.category === wanted);
  }

  if (filter?.priority !== undefined) {
    const wanted = filter.priority;
    results = results.filter(p => p.priority === wanted);
  }

  return results;
}

/**
 * Look up a single pattern by its stable snake_case id.
 *
 * @param id - The pattern's `id` field.
 * @returns The matching pattern, or `undefined` if not found.
 */
export function getById(id: string): Pattern | undefined {
  return _cache.find(p => p.id === id);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all `.yaml` files under `dir`.
 * Uses the `recursive` option introduced in Node 18.17 / Node 20.
 * Accepts the fs/path helpers as parameters so they can be dynamically
 * imported at the call site (keeping node built-ins out of the static graph).
 */
async function collectYamlFiles(
  dir: string,
  readdir: (
    path: string,
    opts: { withFileTypes: true; recursive: true },
  ) => Promise<import("node:fs").Dirent[]>,
  extname: (p: string) => string,
  join: (...parts: string[]) => string,
): Promise<string[]> {
  // `recursive: true` was added in Node 18.17 but the TS lib type for
  // `readdir` with `{ withFileTypes: true, recursive: true }` only appeared
  // in @types/node 20+. Cast via `unknown` to keep the type-checker happy on
  // older @types/node versions while still using the runtime feature.
  const entries = await (
    readdir as unknown as (
      path: string,
      opts: { withFileTypes: true; recursive: true },
    ) => Promise<import("node:fs").Dirent[]>
  )(dir, { withFileTypes: true, recursive: true });

  return entries
    .filter(e => e.isFile() && extname(e.name) === ".yaml")
    .map(e => {
      // Node >=20 uses `parentPath`; Node 18.x uses `path`.
      const parent =
        "parentPath" in e
          ? (e as unknown as { parentPath: string }).parentPath
          : (e as unknown as { path: string }).path;
      return join(parent, e.name);
    });
}

// Convenience alias for the provenance item type used in PatternInit.
type ProvenanceItem = { keyboard: string; rule?: string; notes?: string };

/**
 * Map a validated {@link RawPattern} to the contracts {@link Pattern} shape
 * by delegating to {@link makePattern}, which handles all optional-field
 * spreading internally (satisfying `exactOptionalPropertyTypes`).
 *
 * Each optional field is hoisted into a typed local before being passed so
 * that `exactOptionalPropertyTypes` sees a narrowed non-undefined value
 * rather than `T | undefined`.
 */
function toPattern(data: RawPattern): Pattern {
  // Required fields — always present after schema validation.
  const base = {
    id: String(data.id),
    title: String(data.title),
    description: String(data.description),
    category: data.category as PatternCategory,
    appliesTo: data.appliesTo,
    questions: data.questions as Parameters<typeof makePattern>[0]["questions"],
    kmnFragment: data.kmnFragment,
    tests: data.tests as Parameters<typeof makePattern>[0]["tests"],
    validatedForFamilies: data.validatedForFamilies,
    sourceKeyboards: data.sourceKeyboards,
    reviewedBy: String(data.reviewedBy),
    reviewDate: String(data.reviewDate),
  };

  // Optional fields — each narrowed to its non-undefined type so the spread
  // satisfies exactOptionalPropertyTypes on PatternInit.
  const strategyId = data.strategyId as StrategyId | undefined;
  const combinesWith = data.combinesWith as StrategyId[] | undefined;
  const provenance = data.provenance as ProvenanceItem[] | undefined;
  const demo = data.demo as string | DemoObject | null | undefined;

  return makePattern({
    ...base,
    ...(strategyId !== undefined ? { strategyId } : {}),
    ...(combinesWith !== undefined ? { combinesWith } : {}),
    // null (authored "no fragment") and undefined both coerce to omitted —
    // Pattern types these as `?: string`, so only a real string is forwarded.
    ...(typeof data.touchLayoutFragment === "string"
      ? { touchLayoutFragment: data.touchLayoutFragment }
      : {}),
    ...(typeof data.reorderRules === "string" ? { reorderRules: data.reorderRules } : {}),
    ...(data.frequencyInCorpus !== undefined
      ? { frequencyInCorpus: data.frequencyInCorpus }
      : {}),
    ...(provenance !== undefined ? { provenance } : {}),
    ...(demo !== undefined ? { demo } : {}),
    ...(data.group_visibility !== undefined
      ? { group_visibility: data.group_visibility }
      : {}),
    ...(data.priority !== undefined ? { priority: data.priority } : {}),
  });
}
