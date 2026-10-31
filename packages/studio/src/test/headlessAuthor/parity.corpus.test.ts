// Parity of the headless author against recorded UI walks (spec 107 US2,
// T043-T046). Reads the sibling ../keyboards corpus, so it runs under
// vitest.corpus.config.ts.
//
// Each committed record under lib/__fixtures__/decision-points/records/ is
// compared with the author run of the case it came from. KS_PARITY_RECORDS=<dir>
// adds every *.json in that directory (on-demand records, never committed); a
// file is matched to its case by stem: a case id, or a record file name from
// DECISION_POINT_BASES (e.g. kbdus).

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type { DecisionRecord } from "@keyboard-studio/contracts";
import { parseDecisionRecord } from "@keyboard-studio/engine";
import { announceSc004Skip, sc004GatesEnabled } from "../sc004Harness.ts";
import { DECISION_POINT_BASES } from "../decisionPointBases.ts";
import { recordToDecisionSet } from "../recordToDecisionSet.ts";
import type { AuthorRun, ParityAllowEntry } from "./caseTypes.ts";
import { loadCases } from "./loadCases.ts";
import { runAuthorCase } from "./runAuthorCase.ts";
import { compareAgency, compareParity, type AgencyDiff, type ParityDiff } from "./parity.ts";
import { PARITY_ALLOW_LIST } from "./parityAllowList.ts";

announceSc004Skip("headless author parity", (name) => it.skip(name, () => {}));

const here = dirname(fileURLToPath(import.meta.url));
const RECORDS_DIR = resolve(here, "../../lib/__fixtures__/decision-points/records");

interface ParityTarget {
  label: string;
  caseId: string;
  record: DecisionRecord;
}

function loadRecord(path: string): DecisionRecord {
  return parseDecisionRecord(readFileSync(path, "utf8")).record;
}

function committedTargets(): ParityTarget[] {
  return DECISION_POINT_BASES.map((b) => ({
    label: b.recordFile,
    caseId: b.profile,
    record: loadRecord(join(RECORDS_DIR, b.recordFile)),
  }));
}

/** Records named by KS_PARITY_RECORDS; a file with no matching case fails loudly. */
function onDemandTargets(): ParityTarget[] {
  const dir = process.env.KS_PARITY_RECORDS;
  if (dir === undefined || dir === "") return [];
  const caseIds = new Set(loadCases().map((c) => c.id));
  const out: ParityTarget[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const stem = file.slice(0, -".json".length);
    const base = DECISION_POINT_BASES.find((b) => b.recordFile === file);
    const caseId = caseIds.has(stem) ? stem : base?.profile;
    if (caseId === undefined) {
      throw new Error(`KS_PARITY_RECORDS: ${file} matches no case id or known record file name`);
    }
    out.push({ label: `${dir}/${file}`, caseId, record: loadRecord(join(dir, file)) });
  }
  return out;
}

const show = (v: unknown): string => {
  const s = JSON.stringify(v) ?? "undefined";
  return s.length > 400 ? `${s.slice(0, 400)}...(${s.length} chars)` : s;
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Where two object values differ: per top-level field, members only one side has. */
function fieldDiffs(author: unknown, recorded: unknown): string[] {
  if (!isPlainObject(author) || !isPlainObject(recorded)) return [];
  const out: string[] = [];
  for (const k of [...new Set([...Object.keys(author), ...Object.keys(recorded)])].sort()) {
    const a = author[k];
    const r = recorded[k];
    if (JSON.stringify(a) === JSON.stringify(r)) continue;
    if (Array.isArray(a) && Array.isArray(r)) {
      const as = new Set(a.map((x) => JSON.stringify(x)));
      const rs = new Set(r.map((x) => JSON.stringify(x)));
      const onlyA = [...as].filter((x) => !rs.has(x));
      const onlyR = [...rs].filter((x) => !as.has(x));
      const order = onlyA.length === 0 && onlyR.length === 0 ? " (same members, different order)" : "";
      out.push(
        `      .${k}${order}: author-only ${show(onlyA.slice(0, 12))}${onlyA.length > 12 ? ` +${onlyA.length - 12}` : ""}; ` +
          `recorded-only ${show(onlyR.slice(0, 12))}${onlyR.length > 12 ? ` +${onlyR.length - 12}` : ""}`,
      );
    } else {
      out.push(`      .${k}: author ${show(a)}; recorded ${show(r)}`);
    }
  }
  return out;
}

function formatDiffs(label: string, diffs: ParityDiff[]): string {
  return [
    `${label}: ${diffs.length} unexplained difference(s)`,
    ...diffs.map((d) => {
      const head = `  - ${d.decisionId}${d.normalisedBy === undefined ? "" : ` (normalised by ${d.normalisedBy})`}`;
      const fields = fieldDiffs(d.author, d.recorded);
      return fields.length > 0
        ? [head, ...fields].join("\n")
        : `${head}\n      author:   ${show(d.author)}\n      recorded: ${show(d.recorded)}`;
    }),
  ].join("\n");
}

function formatAgency(label: string, diffs: AgencyDiff[]): string {
  return [
    `${label}: ${diffs.length} agency difference(s)`,
    ...diffs.map((d) => `  - ${d.key}: author ${d.author ?? "(none)"}, recorded ${d.recorded}`),
  ].join("\n");
}

const formatStale = (stale: ParityAllowEntry[]): string =>
  stale.map((e) => `  - ${e.caseId} / ${e.decisionId} (${e.explainedBy}): ${e.reason}`).join("\n");

describe.skipIf(!sc004GatesEnabled)("headless author parity with recorded walks (T043-T046)", () => {
  const targets = [...committedTargets(), ...onDemandTargets()];
  const runs = new Map<string, AuthorRun>();

  beforeAll(async () => {
    const cases = loadCases();
    // Sequential: the author run resets and uses the shared studio stores.
    for (const caseId of new Set(targets.map((t) => t.caseId))) {
      const c = cases.find((x) => x.id === caseId);
      if (c === undefined) throw new Error(`no case ${caseId}`);
      runs.set(caseId, await runAuthorCase(c));
    }
  }, 600_000);

  describe.each(targets)("$label ($caseId)", ({ label, caseId, record }) => {
    it("the author run completes", () => {
      const run = runs.get(caseId);
      expect(run?.failure, JSON.stringify(run?.failure)).toBeUndefined();
      expect(run?.outcome).toBe("completed");
    });

    it("every decision matches the record, or has an allow-list entry (T043)", () => {
      const run = runs.get(caseId);
      if (run === undefined) throw new Error(`no run for ${caseId}`);
      const { unexplained } = compareParity(run, record, PARITY_ALLOW_LIST);
      expect(unexplained, formatDiffs(label, unexplained)).toEqual([]);
    });

    it("the 053 agency matches the record per decision (T044)", () => {
      const run = runs.get(caseId);
      if (run === undefined) throw new Error(`no run for ${caseId}`);
      // An allow-list entry explains the decision, its agency included: the
      // decision's own key and every survey answer its recorded value carries.
      const allowed = new Set<string>();
      const recorded = recordToDecisionSet(record, "tolerance") as Record<string, { value: unknown } | undefined>;
      for (const e of PARITY_ALLOW_LIST.filter((x) => x.caseId === caseId)) {
        allowed.add(e.decisionId);
        const answers = (recorded[e.decisionId]?.value as { answers?: Record<string, unknown> } | undefined)?.answers;
        for (const questionId of Object.keys(answers ?? {})) allowed.add(questionId);
      }
      const diffs = compareAgency(run, record).filter((d) => !allowed.has(d.key));
      expect(diffs, formatAgency(label, diffs)).toEqual([]);
    });

    it("no allow-list entry for this case is stale (T045)", () => {
      const run = runs.get(caseId);
      if (run === undefined) throw new Error(`no run for ${caseId}`);
      const { stale } = compareParity(run, record, PARITY_ALLOW_LIST);
      expect(stale, `stale allow-list entries (remove them):\n${formatStale(stale)}`).toEqual([]);
    });
  });

  it("every allow-list entry names a compared case", () => {
    const compared = new Set(targets.map((t) => t.caseId));
    const orphans = PARITY_ALLOW_LIST.filter((e) => !compared.has(e.caseId));
    expect(orphans, `allow-list entries for cases no record covers:\n${formatStale(orphans)}`).toEqual([]);
  });
});
