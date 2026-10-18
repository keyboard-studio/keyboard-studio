/**
 * Divergence report assembly — clustering + JSON/Markdown rendering
 * (spec 007 §7.5.1, issue #297).
 *
 * The report is the run's deliverable: a machine-readable JSON document
 * (schema `corpus-eval/v1`) carrying every divergence record with its
 * per-keyboard provenance, the clusters those records group into, and the
 * run summary (counts denominated honestly — parse failures and
 * unevaluable keyboards are counted, never silently dropped); plus a
 * human-readable Markdown rendering of the same content.
 */

import type {
  StrategyDivergence,
  StrategyDivergenceCluster,
} from "@keyboard-studio/contracts";

import type { EvaluationOutcome, EvaluationSummary } from "./evaluate.js";

export interface CorpusEvalReport {
  schema: "corpus-eval/v1";
  /** Corpus root the run read (as passed; never baked into records). */
  corpusRoot: string;
  /** The scope actually run, e.g. `release/**` or `release/sil/**`. */
  corpusScope: string;
  /** ISO timestamp of the run (provenance, not content). */
  generatedAt: string;
  /** Wall-clock duration of the evaluation pass, milliseconds. */
  durationMs: number;
  summary: {
    discovered: number;
    parseFailures: number;
    evaluated: number;
    agreements: number;
    divergences: number;
    unevaluable: number;
  };
  /** Light summaries for every evaluated keyboard (agreement + divergence). */
  evaluations: EvaluationSummary[];
  /** Full records — one per divergence, sorted by keyboard id. */
  divergences: StrategyDivergence[];
  /** Clusters over {@link divergences}, largest first. */
  clusters: StrategyDivergenceCluster[];
  /** Keyboards the recognizer could not lift any pattern from. */
  unevaluable: Array<{ keyboardId: string; sourcePath: string; reason: string }>;
  /** Keyboards that failed to parse (excluded by the Layer A′ gate). */
  parseFailures: Array<{ keyboardId: string; sourcePath: string; errors: string[] }>;
}

/**
 * Group divergence records by mis-routing signature: same tree primary,
 * same firing rule, same recognized-dominant strategy. Clusters sort by
 * size descending, then by signature (deterministic output).
 */
export function clusterDivergences(
  divergences: StrategyDivergence[],
): StrategyDivergenceCluster[] {
  const groups = new Map<string, StrategyDivergenceCluster>();
  for (const d of divergences) {
    const key = `${d.treePrimary}|${String(d.triggeredRule)}|${d.recognizedPrimary}`;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.count++;
      existing.keyboardIds.push(d.keyboardId);
    } else {
      groups.set(key, {
        treePrimary: d.treePrimary,
        triggeredRule: d.triggeredRule,
        recognizedPrimary: d.recognizedPrimary,
        count: 1,
        keyboardIds: [d.keyboardId],
      });
    }
  }
  const clusters = [...groups.values()];
  for (const c of clusters) c.keyboardIds.sort();
  clusters.sort(
    (a, b) =>
      b.count - a.count ||
      `${a.treePrimary}|${String(a.triggeredRule)}|${a.recognizedPrimary}`.localeCompare(
        `${b.treePrimary}|${String(b.triggeredRule)}|${b.recognizedPrimary}`,
      ),
  );
  return clusters;
}

/** Assemble the full report from per-keyboard outcomes. */
export function buildReport(params: {
  corpusRoot: string;
  corpusScope: string;
  generatedAt: string;
  durationMs: number;
  discovered: number;
  outcomes: EvaluationOutcome[];
}): CorpusEvalReport {
  const divergences: StrategyDivergence[] = [];
  const evaluations: EvaluationSummary[] = [];
  const unevaluable: CorpusEvalReport["unevaluable"] = [];
  const parseFailures: CorpusEvalReport["parseFailures"] = [];
  let agreements = 0;

  for (const outcome of params.outcomes) {
    switch (outcome.kind) {
      case "parse-failure":
        parseFailures.push({
          keyboardId: outcome.keyboardId,
          sourcePath: outcome.sourcePath,
          errors: outcome.errors,
        });
        break;
      case "unevaluable":
        unevaluable.push({
          keyboardId: outcome.keyboardId,
          sourcePath: outcome.sourcePath,
          reason: outcome.reason,
        });
        break;
      case "agreement":
        agreements++;
        evaluations.push(outcome.summary);
        break;
      case "divergence":
        evaluations.push(outcome.summary);
        if (outcome.divergence !== undefined) divergences.push(outcome.divergence);
        break;
    }
  }
  divergences.sort((a, b) => a.keyboardId.localeCompare(b.keyboardId));
  evaluations.sort((a, b) => a.keyboardId.localeCompare(b.keyboardId));

  return {
    schema: "corpus-eval/v1",
    corpusRoot: params.corpusRoot,
    corpusScope: params.corpusScope,
    generatedAt: params.generatedAt,
    durationMs: params.durationMs,
    summary: {
      discovered: params.discovered,
      parseFailures: parseFailures.length,
      evaluated: evaluations.length,
      agreements,
      divergences: divergences.length,
      unevaluable: unevaluable.length,
    },
    evaluations,
    divergences,
    clusters: clusterDivergences(divergences),
    unevaluable,
    parseFailures,
  };
}

/** Render the report as a human-readable Markdown document. */
export function renderMarkdown(report: CorpusEvalReport): string {
  const s = report.summary;
  const lines: string[] = [
    "# Corpus evaluation — §7.5.1 StrategyDivergence report",
    "",
    `- Corpus: \`${report.corpusRoot}\` (scope \`${report.corpusScope}\`)`,
    `- Generated: ${report.generatedAt} · duration ${report.durationMs} ms`,
    `- Discovered: ${s.discovered} · parse failures: ${s.parseFailures} · evaluated: ${s.evaluated} · agreements: ${s.agreements} · divergences: ${s.divergences} · unevaluable: ${s.unevaluable}`,
    "",
    "## Divergence clusters",
    "",
    "Same mis-routing across N keyboards — the tree-rule discovery unit (§7.5.1).",
    "",
  ];
  if (report.clusters.length === 0) {
    lines.push("_No divergences._", "");
  } else {
    lines.push(
      "| # | Keyboards | Tree pick | Rule | Recognized dominant | Members |",
      "|---|-----------|-----------|------|---------------------|---------|",
    );
    report.clusters.forEach((c, i) => {
      lines.push(
        `| ${i + 1} | ${c.count} | ${c.treePrimary} | ${String(c.triggeredRule)} | ${c.recognizedPrimary} | ${c.keyboardIds.join(", ")} |`,
      );
    });
    lines.push("");
  }
  lines.push("## Divergences (per keyboard)", "");
  if (report.divergences.length === 0) {
    lines.push("_None._", "");
  } else {
    lines.push(
      "| Keyboard | Tree pick (rule) | Tree secondaries | Recognized dominant | Tally | Recognized ratio |",
      "|----------|------------------|------------------|---------------------|-------|------------------|",
    );
    for (const d of report.divergences) {
      const tally = Object.entries(d.recognizedTally)
        .map(([k, v]) => `${k}×${v}`)
        .join(", ");
      lines.push(
        `| ${d.keyboardId} | ${d.treePrimary} (${String(d.triggeredRule)}) | ${d.treeSecondaries.join(", ") || "—"} | ${d.recognizedPrimary} | ${tally} | ${d.recognizedRatio.toFixed(2)} |`,
      );
    }
    lines.push("");
  }
  if (report.unevaluable.length > 0) {
    lines.push(
      "## Unevaluable (recognizer lifted no patterns)",
      "",
      report.unevaluable.map((u) => u.keyboardId).join(", "),
      "",
    );
  }
  if (report.parseFailures.length > 0) {
    lines.push(
      "## Parse failures (excluded by the Layer A′ gate)",
      "",
      report.parseFailures.map((p) => p.keyboardId).join(", "),
      "",
    );
  }
  return lines.join("\n");
}
