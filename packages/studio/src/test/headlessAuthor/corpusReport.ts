// Per-case classification and console output for the corpus suites (spec 107
// FR-030, US3). Pure: it imports only the author's own types, so the boundary
// scan has nothing to flag. A gap spec 106 KNOWN_GAPS owns is EXPECTED; any
// other failed gate, failed run or skip is UNEXPECTED and fails the suite.

import type { AuthorRun } from "./caseTypes.ts";

export const DECISION_POINT = "tolerance";

export interface CaseVerdict {
  /** Failures nothing owns: these fail the test. */
  unexpected: string[];
  /** Failures a spec 106 gap owns, reported but not failing. */
  expected: string[];
}

/**
 * `ownerOfFailedRun` answers for a run that threw before it produced gates
 * (the tolerance-analysis throw): the KNOWN_GAPS owner of (base, point, gate)
 * or undefined. Only a failure at the output step can be owned this way.
 */
export function classifyRun(
  run: AuthorRun,
  ownerOfFailedRun: (caseId: string) => string | undefined = () => undefined,
  options: { skipIsFailure: boolean } = { skipIsFailure: false },
): CaseVerdict {
  const unexpected: string[] = [];
  const expected: string[] = [];

  if (run.outcome === "skipped") {
    const line = `[SKIP] ${run.caseId} ${run.skipReason ?? "unspecified"}`;
    (options.skipIsFailure ? unexpected : expected).push(line);
    return { unexpected, expected };
  }
  if (run.outcome === "failed") {
    const f = run.failure;
    const owner = f?.step === "output" ? ownerOfFailedRun(run.caseId) : undefined;
    const line = `${run.caseId} run failed (${f?.kind ?? "unknown"}) at ${f?.decisionId ?? f?.step ?? "unknown"}: ${f?.detail ?? "no detail"}`;
    if (owner !== undefined) expected.push(`[EXPECTED] ${line} -- owner ${owner}`);
    else unexpected.push(`[FAIL] ${line}`);
    return { unexpected, expected };
  }
  for (const g of run.gates) {
    if (!g.applicable || g.pass) continue;
    const owner = run.report.knownGaps.find((k) => k.gate === g.gate)?.owner;
    const line = `${run.caseId} gate ${g.gate} @ ${DECISION_POINT}: ${g.detail.join("; ") || "no detail"}`;
    if (owner !== undefined) expected.push(`[EXPECTED] ${line} -- owner ${owner}`);
    else unexpected.push(`[FAIL] ${line}`);
  }
  return { unexpected, expected };
}

/** One-line command that reruns a single case. */
export function reproduceCommand(caseId: string, casesFile?: string): string {
  const file = casesFile === undefined ? "" : `KS_AUTHOR_CASES_FILE=${casesFile} `;
  return (
    `${file}KS_AUTHOR_CASE=${caseId} pnpm --filter @keyboard-studio/studio exec vitest run ` +
    "--config vitest.corpus.config.ts src/test/headlessAuthor/authorCase"
  );
}

/** The per-case block: gate summary, placeholders, displacements, then any failure with its reproduce line. */
export function formatCaseBlock(run: AuthorRun, verdict: CaseVerdict, casesFile?: string): string {
  const lines: string[] = [];
  const applicable = run.gates.filter((g) => g.applicable);
  const passed = applicable.filter((g) => g.pass).length;
  lines.push(
    `${verdict.unexpected.length > 0 ? "[FAIL]" : "[OK]"} ${run.caseId} outcome=${run.outcome} ` +
      `gates=${passed}/${applicable.length} placeholders=${run.report.placeholders.length} ` +
      `displacements=${run.report.displacements.length}`,
  );
  for (const e of verdict.expected) lines.push(`  ${e}`);
  for (const u of verdict.unexpected) lines.push(`  ${u}`);
  if (verdict.unexpected.length > 0) lines.push(`  reproduce: ${reproduceCommand(run.caseId, casesFile)}`);
  return lines.join("\n");
}
