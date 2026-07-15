#!/usr/bin/env node
// facet-index-lint — validates docs/keyboard-facet-index.json against the
// content/keyboard-facets/ definitions (spec 036).
//
// TODO(T032): implement the real checks over docs/keyboard-facet-index.json
// and content/keyboard-facets/*.yaml:
//   X1  value+distribution keys within a facet's declared limits
//   X2  distribution/residue sums to ~1
//   X3  every keyboard has a record for every active facet
//   X4  analysisOutcome <-> provenanceTier consistency
//   X5  facetCoverage tier counts sum to manifest.keyboardCount
//   X6  manifest.facetIds matches the definitions actually loaded
//   X7  self-check — the validator must reject a known-bad record and
//       accept a known-good one (prove it isn't a no-op)
//   C1  definition id/path agreement
//   C2  unique definition ids
//   C3  limits agree with valueType
//   C4  ... (see contracts/facet-definition.schema.md)
//   C5  definition self-check (mirrors X7 for definitions)
//
// This is a Phase 1 skeleton only: the checks registry is currently empty.
// Not yet wired into `pnpm lint` (that lands in T033).
//
// Run: `node utilities/facet-index-lint/index.js`

// ---------------------------------------------------------------------------
// Checks registry — each entry is a () => string[] of failure messages.
// Currently empty; real X1-X7/C1-C5 checks land in T032.
// ---------------------------------------------------------------------------

const checks = [];

function main() {
  const failures = [];

  for (const check of checks) {
    for (const problem of check()) failures.push(problem);
  }

  if (failures.length === 0) {
    console.log("[OK] facet-index-lint");
  } else {
    console.error(`facet-index-lint: ${failures.length} failure(s):`);
    for (const f of failures) console.error(`  [ERROR] ${f}`);
  }

  process.exit(failures.length === 0 ? 0 : 1);
}

main();
