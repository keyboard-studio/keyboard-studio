// file-sweep-issues -- merge the headless sweep's per-shard reports and file
// the failures as GitHub issues (spec 107 US4, contracts/scheduled-sweep.md).
//
// Usage:
//   node scripts/file-sweep-issues.mjs --merge-out <file> [--summary <file>]
//        [--file-issues] [--run-url <url>] <shard-report.json>...
//
// The shard reports are written by the sweep test
// (packages/studio/src/test/headlessAuthor/sweep.corpus.test.ts). Each failure
// is keyed `[headless-sweep] <keyboard> <profile> <gate> @ <decision point>`.
// With --file-issues, an open `headless-sweep` issue whose title carries the key
// gets a comment; otherwise a `bug(<area>): ...` issue is filed. Failures that
// the sweep already marked as owned by a known gap are summarised, never filed.
// Only `gh issue list|comment|create` is used; `gh` is injected so tests stub it.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LABEL = "headless-sweep";

/** The dedupe key for one failed case. */
export function failureKey(c) {
  return `[headless-sweep] ${c.base} ${profileName(c)} ${c.gate} @ ${c.decisionPoint}`;
}

function profileName(c) {
  return `p${c.profile}-${c.backspace}`;
}

/**
 * An `in-progress` entry left in a shard report means the shard was killed while
 * running that case (a synchronous hang the runner cannot interrupt). It is a
 * failure with gate `hung`, at the step the sweep last recorded.
 */
export function normaliseCase(c) {
  if (c.status !== "in-progress") return c;
  return {
    ...c,
    status: "failed",
    gate: "hung",
    decisionPoint: c.decisionPoint ?? "unknown",
    detail: c.detail ?? "the shard ended while this case was running (a hang or a kill)",
  };
}

/** Merge shard reports of one tier into a single report. */
export function mergeReports(reports) {
  if (reports.length === 0) throw new Error("no shard reports to merge");
  const tier = reports[0].tier;
  const cases = [];
  for (const r of reports) {
    if (r.tier !== tier) throw new Error(`mixed tiers in one merge: ${tier} and ${r.tier}`);
    cases.push(...r.cases.map(normaliseCase));
  }
  cases.sort((a, b) => (a.caseId < b.caseId ? -1 : a.caseId > b.caseId ? 1 : 0));
  const summary = { tier, cases: { completed: 0, skipped: 0, failed: 0 }, byGate: {}, byFirstFailingStep: {}, skips: {} };
  for (const c of cases) {
    if (c.status === "skipped") {
      summary.cases.skipped++;
      (summary.skips[c.skipReason ?? "missing"] ??= []).push(c.caseId);
    } else if (c.status === "failed") {
      summary.cases.failed++;
      (summary.byGate[c.gate] ??= []).push(c.caseId);
      (summary.byFirstFailingStep[c.decisionPoint] ??= []).push(c.caseId);
    } else {
      summary.cases.completed++;
    }
  }
  return { tier, shards: reports.map((r) => r.shard).sort(), summary, cases };
}

/** Markdown for the job summary: by gate, by first failing step, skips by reason. */
export function summaryMarkdown(merged) {
  const s = merged.summary;
  const lines = [
    `## Headless sweep: ${merged.tier}`,
    "",
    `completed ${s.cases.completed}, failed ${s.cases.failed}, skipped ${s.cases.skipped}`,
    "",
  ];
  const table = (title, group) => {
    lines.push(`### ${title}`, "", "| Key | Count | Cases |", "|---|---|---|");
    const keys = Object.keys(group).sort();
    if (keys.length === 0) lines.push("| (none) | 0 | |");
    for (const k of keys) {
      const ids = group[k];
      const shown = ids.slice(0, 5).join(", ") + (ids.length > 5 ? `, +${ids.length - 5} more` : "");
      lines.push(`| ${k} | ${ids.length} | ${shown} |`);
    }
    lines.push("");
  };
  table("Failures by gate", s.byGate);
  table("Failures by first failing step", s.byFirstFailingStep);
  table("Skips by reason", s.skips);
  const gaps = merged.cases.filter((c) => c.status === "known-gap");
  lines.push(`Known-gap failures (summarised, not filed): ${gaps.length}`, "");
  return lines.join("\n");
}

/** Group the failed cases by key (one issue per key, however many profiles repeat it). */
export function failuresByKey(merged) {
  const out = new Map();
  for (const c of merged.cases) {
    if (c.status !== "failed") continue; // known-gap and skipped are never filed
    const key = failureKey(c);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(c);
  }
  return out;
}

export function reproduceCommand(tier, caseId) {
  return (
    `KS_AUTHOR_SWEEP=${tier} KS_AUTHOR_ONLY=${caseId} ` +
    "pnpm --filter @keyboard-studio/studio exec vitest run --config vitest.corpus.config.ts " +
    "src/test/headlessAuthor/sweep"
  );
}

/** `bug(<area>): ...` -- the area is the smallest that locates the defect. */
export function issueTitle(c) {
  const area = c.decisionPoint === "output" || /^compile|scaffold/.test(c.gate) ? "engine" : "studio";
  return `bug(${area}): headless sweep ${c.gate} on ${c.base} (${profileName(c)}) @ ${c.decisionPoint} [${failureKey(c)}]`;
}

function issueBody(tier, key, cases, runUrl, date) {
  const first = cases[0];
  return [
    `The scheduled headless sweep (tier \`${tier}\`) failed on \`${first.base}\`.`,
    "",
    `Key: \`${key}\``,
    `Run: ${runUrl || "(local run)"} on ${date}`,
    `Cases: ${cases.map((c) => `\`${c.caseId}\``).join(", ")}`,
    "",
    "Detail:",
    "",
    "```",
    first.detail ?? "no detail",
    "```",
    ...(first.gate === "hung"
      ? ["", "`hung`: the case never finished (a synchronous loop, or a kill). Re-run it with `KS_AUTHOR_TRACE=1` under a `timeout`; the last `[TRACE] ... start` with no `end` is the step."]
      : []),
    "",
    "Reproduce:",
    "",
    "```sh",
    reproduceCommand(tier, first.caseId),
    "```",
  ].join("\n");
}

/**
 * File or update issues for every new failure.
 * `gh(args)` runs the GitHub CLI and returns stdout; injected so tests never hit the network.
 */
export function fileIssues(merged, { gh, runUrl = "", date = new Date().toISOString().slice(0, 10) }) {
  const results = [];
  for (const [key, cases] of failuresByKey(merged)) {
    const found = JSON.parse(
      gh(["issue", "list", "--label", LABEL, "--state", "open", "--search", `"${key}" in:title`, "--json", "number,title", "--limit", "20"]) || "[]",
    );
    const match = found.find((i) => typeof i.title === "string" && i.title.includes(key));
    if (match !== undefined) {
      gh(["issue", "comment", String(match.number), "--body", `Still failing: ${runUrl || "(local run)"} on ${date}\nCases: ${cases.map((c) => c.caseId).join(", ")}`]);
      results.push({ key, action: "comment", issue: match.number });
    } else {
      gh(["issue", "create", "--label", LABEL, "--title", issueTitle(cases[0]), "--body", issueBody(merged.tier, key, cases, runUrl, date)]);
      results.push({ key, action: "create" });
    }
  }
  return results;
}

function ghRunner(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

function main(argv) {
  const files = [];
  let mergeOut, summaryFile, runUrl = "", doFile = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--merge-out") mergeOut = argv[++i];
    else if (a === "--summary") summaryFile = argv[++i];
    else if (a === "--run-url") runUrl = argv[++i];
    else if (a === "--file-issues") doFile = true;
    else files.push(a);
  }
  const merged = mergeReports(files.map((f) => JSON.parse(readFileSync(f, "utf8"))));
  if (mergeOut) writeFileSync(mergeOut, JSON.stringify(merged, null, 2), "utf8");
  const md = summaryMarkdown(merged);
  if (summaryFile) appendFileSync(summaryFile, md + "\n", "utf8");
  else console.log(md);
  console.log(`[INFO] ${merged.summary.cases.failed} failed, ${merged.summary.cases.skipped} skipped`);
  if (doFile) {
    for (const r of fileIssues(merged, { gh: ghRunner, runUrl })) console.log(`[OK] ${r.action} ${r.key}`);
  }
  // Red on any new failure; nothing gates on it.
  return merged.summary.cases.failed > 0 ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
