/**
 * Human-readable companion renderer (spec 036 T034; FR-007). Emits an audit-trail
 * markdown view of the machine-readable index — build inputs, per-facet coverage,
 * and a deterministic sample of records — so a human can eyeball what the build
 * produced without parsing the JSON.
 *
 * Deterministic by construction (no timestamps; keyboards sampled in sorted id
 * order) so a no-op rebuild produces no git diff, matching the JSON artifact.
 */

import type { FacetIndex } from "./types.js";

/** How many sample rows per facet to show in the companion. */
const SAMPLE_ROWS = 12;

export function renderCompanionMd(index: FacetIndex): string {
  const { manifest, keyboards } = index;
  const ids = Object.keys(keyboards).sort();
  const lines: string[] = [];

  lines.push("# Keyboard facet index — audit companion");
  lines.push("");
  lines.push(
    "Generated — do not edit. The machine-readable artifact is " +
      "[`keyboard-facet-index.json`](keyboard-facet-index.json); rebuild both with " +
      "`npx tsx utilities/facet-index/cli.ts`.",
  );
  lines.push("");

  // Build inputs.
  lines.push("## Build inputs");
  lines.push("");
  lines.push(`- **keyboards**: ${manifest.keyboardCount}`);
  lines.push(`- **facets**: ${manifest.facetIds.join(", ") || "(none)"}`);
  lines.push(`- **scannerVersion**: \`${manifest.scannerVersion}\``);
  lines.push(`- **unicodeVersion**: ${manifest.unicodeVersion}`);
  lines.push(`- **corpusScope**: \`${manifest.corpusScope}\``);
  lines.push(`- **corpusCommit**: \`${manifest.corpusCommit}\``);
  lines.push(`- **referencePins**: ${manifest.referencePins.length}`);
  lines.push("");

  // Per-facet coverage.
  lines.push("## Coverage by facet (provenance tier)");
  lines.push("");
  lines.push("| facet | content-derived | declared-metadata | fallback | undetermined |");
  lines.push("| --- | ---: | ---: | ---: | ---: |");
  for (const facetId of manifest.facetIds) {
    const c = manifest.facetCoverage[facetId];
    if (!c) continue;
    lines.push(`| \`${facetId}\` | ${c.content} | ${c.declared} | ${c.fallback} | ${c.undetermined} |`);
  }
  lines.push("");

  // Sample records per facet.
  for (const facetId of manifest.facetIds) {
    lines.push(`## Sample records — \`${facetId}\` (first ${SAMPLE_ROWS} by id)`);
    lines.push("");
    lines.push("| keyboard | value | tier | outcome | evidence |");
    lines.push("| --- | --- | --- | --- | ---: |");
    for (const id of ids.slice(0, SAMPLE_ROWS)) {
      const cat = keyboards[id]?.facets[facetId];
      if (!cat) continue;
      const value =
        cat.value === undefined
          ? "—"
          : Array.isArray(cat.value)
            ? cat.value.join("+")
            : String(cat.value);
      lines.push(`| \`${id}\` | ${value} | ${cat.provenanceTier} | ${cat.analysisOutcome} | ${cat.evidenceSize} |`);
    }
    lines.push("");
  }

  return lines.join("\n") + "\n";
}
