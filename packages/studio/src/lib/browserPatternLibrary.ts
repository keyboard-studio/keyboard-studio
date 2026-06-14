// Browser-side pattern library: loads YAML via Vite import.meta.glob (no
// node:fs). Used in the SPA only — the engine's loadPatterns() uses node:fs
// and is not called from the browser.
//
// Glob path: from the Vite root (packages/studio), the content tree is at
// ../../content/patterns/**/*.yaml  →  resolves to keyboard-studio/content/patterns.
//
// Ranking: delegates to selectStrategy() for the axis-based partition, then
// mirrors the engine's filterFor() partition order (primary → secondary →
// appliesTo-match). This avoids duplicating the partition logic: the engine's
// filterFor() body is replicated here with a clear comment because extracting
// a pure rankPatterns() helper from the engine package would require an
// engine build-step change that is deferred to the #5b joint session. If that
// refactor lands, replace the partition block below with a call to
// rankPatterns(all, base, axes).
//
// PatternSchema is imported from "@keyboard-studio/engine/pattern-schema"
// via the dedicated "./pattern-schema" export added to the engine's package.json.
// This closes the drift window: the schema is now a single source of truth.

import { parse } from "yaml";
import { makePattern } from "@keyboard-studio/contracts";
import { selectStrategy } from "@keyboard-studio/engine";
import { toPatternMatch } from "@keyboard-studio/contracts";
import { PatternSchema } from "@keyboard-studio/engine/pattern-schema";
import type {
  Pattern,
  PatternCategory,
  StrategyId,
  DemoObject,
  BaseKeyboard,
  DiscoveryAxisVector,
  PatternMatch,
  PatternLibraryService,
} from "@keyboard-studio/contracts";
import type { RawPattern } from "@keyboard-studio/engine/pattern-schema";

// ---------------------------------------------------------------------------
// Vite glob — eager, raw text. import.meta.glob resolves relative to THIS
// module file (packages/studio/src/lib/), so reaching the repo-root content/
// tree is four levels up: lib -> src -> studio -> packages -> <repo root>.
//   packages/studio/src/lib/../../../../content/patterns = <repo root>/content/patterns
// ---------------------------------------------------------------------------

const YAML_MODULES = import.meta.glob(
  "../../../../content/patterns/**/*.yaml",
  { eager: true, query: "?raw", import: "default" },
) as Record<string, string>;

// ---------------------------------------------------------------------------
// YAML → Pattern conversion (mirrors engine loader.ts toPattern)
// ---------------------------------------------------------------------------

type ProvenanceItem = { keyboard: string; rule?: string; notes?: string };

function toPattern(data: RawPattern): Pattern {
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

  const strategyId = data.strategyId as StrategyId | undefined;
  const combinesWith = data.combinesWith as StrategyId[] | undefined;
  const provenance = data.provenance as ProvenanceItem[] | undefined;
  const demo = data.demo as string | DemoObject | null | undefined;

  return makePattern({
    ...base,
    ...(strategyId !== undefined ? { strategyId } : {}),
    ...(combinesWith !== undefined ? { combinesWith } : {}),
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

// ---------------------------------------------------------------------------
// Load + validate all YAML modules at import time (eager glob runs once)
// ---------------------------------------------------------------------------

function loadAll(): Pattern[] {
  const patterns: Pattern[] = [];
  for (const [path, raw] of Object.entries(YAML_MODULES)) {
    if (typeof raw !== "string") {
      console.warn(`[browserPatternLibrary] skipping ${path}: not a string`);
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parse(raw);
    } catch (e) {
      console.warn(`[browserPatternLibrary] YAML parse error in ${path}: ${String(e)}`);
      continue;
    }
    const result = PatternSchema.safeParse(parsed);
    if (!result.success) {
      const reason = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      console.warn(`[browserPatternLibrary] schema error in ${path}: ${reason}`);
      continue;
    }
    patterns.push(toPattern(result.data));
  }
  // Sort by id for deterministic listAll() ordering.
  patterns.sort((a, b) => a.id.localeCompare(b.id));
  return patterns;
}

const _allPatterns: Pattern[] = loadAll();

// ---------------------------------------------------------------------------
// rankPatterns — replicated from engine filterFor.ts.
// NOTE: If engine exposes a pure rankPatterns(all, base, axes) export, replace
// this block with that call. Replicated because extracting it from the engine
// would require an engine build step that is deferred to the #5b joint session.
// ---------------------------------------------------------------------------

function rankPatterns(
  all: Pattern[],
  base: BaseKeyboard,
  axes?: DiscoveryAxisVector,
): PatternMatch[] {
  // §9: exclude reorder patterns for Latin-script keyboards.
  const eligible =
    base.script === "Latn" ? all.filter((p) => p.category !== "reorder") : all;

  if (axes === undefined) {
    const matches = eligible.filter(
      (p) => p.appliesTo.length === 0 || p.appliesTo.includes(base.script),
    );
    return matches.map((p, idx) => toPatternMatch(p, idx + 1, "appliesTo-match"));
  }

  const rec = selectStrategy(axes);

  const primaryPatterns: Pattern[] = [];
  const secondaryPatterns: Pattern[] = [];
  const appliesToOnlyPatterns: Pattern[] = [];

  for (const p of eligible) {
    if (p.strategyId === rec.primary) {
      primaryPatterns.push(p);
    } else if (
      p.strategyId !== undefined &&
      rec.secondaries.includes(p.strategyId)
    ) {
      secondaryPatterns.push(p);
    } else if (
      p.strategyId === undefined &&
      (p.appliesTo.length === 0 || p.appliesTo.includes(base.script))
    ) {
      appliesToOnlyPatterns.push(p);
    }
    // Off-strategy patterns (strategyId set but matches neither primary nor
    // secondaries) are intentionally excluded.
  }

  const ordered = [
    ...primaryPatterns,
    ...secondaryPatterns,
    ...appliesToOnlyPatterns,
  ];

  return ordered.map((p, idx) => {
    const rank = idx + 1;
    const reason: PatternMatch["reason"] =
      p.strategyId === rec.primary
        ? "primary-strategy"
        : p.strategyId !== undefined && rec.secondaries.includes(p.strategyId)
          ? "secondary-strategy"
          : "appliesTo-match";
    return toPatternMatch(p, rank, reason);
  });
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

class BrowserPatternLibraryService implements PatternLibraryService {
  listAll(): Promise<Pattern[]> {
    return Promise.resolve([..._allPatterns]);
  }

  getById(id: string): Promise<Pattern | undefined> {
    return Promise.resolve(_allPatterns.find((p) => p.id === id));
  }

  filterFor(base: BaseKeyboard, axes?: DiscoveryAxisVector): Promise<PatternMatch[]> {
    return Promise.resolve(rankPatterns(_allPatterns, base, axes));
  }
}

let _instance: BrowserPatternLibraryService | null = null;

/**
 * Return the singleton browser pattern library service.
 * Patterns are loaded once via import.meta.glob at module-init time.
 */
export function getPatternLibraryService(): PatternLibraryService {
  if (_instance === null) {
    _instance = new BrowserPatternLibraryService();
  }
  return _instance;
}
