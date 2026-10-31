// Headless author, wide sweep (spec 107 US4). Reads the sibling ../keyboards
// corpus, so it runs under vitest.corpus.config.ts. Never a PR gate: the PR set
// is prSet.corpus/parity; this is the scheduled and on-demand breadth run.
//
//   KS_AUTHOR_SWEEP=latin|eligible|cases   which slice (unset: the file skips with a [WARN])
//   KS_AUTHOR_SHARD=k/n                    run only shard k of n (default 1/1)
//   KS_AUTHOR_ONLY=<caseId>                re-run one swept case alone
//   KS_AUTHOR_REPORT_DIR=<dir>             where headless-report-<tier>-<shard>.json is written
//   KS_AUTHOR_CASE_TIMEOUT_MS=<ms>         per-case test timeout (default 180000)
//   KS_AUTHOR_TRACE=1                      per-step [TRACE] lines on stderr (runAuthorCase.ts)
//
// The report is rewritten before each case (that case as `in-progress`, with the step it
// reached) and after it, so a shard killed by a hang still leaves a report naming the case.
// A leftover `in-progress` entry is a `hung` failure to the merge (file-sweep-issues.mjs).
//
// `latin` and `eligible` cross the eligible keyboards with two profile variants
// (profile 1, both backspace answers). `cases` is the nightly tier: the 32
// canonical harness cases plus the PR set crossed with all 8 profile variants.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { announceSc004Skip, sc004GatesEnabled } from "../sc004Harness.ts";
import type { AuthorRun, Case, SkipReason } from "./caseTypes.ts";
import { eligibility } from "./eligibility.ts";
import { loadCases, loadPrSet } from "./loadCases.ts";
import { formatCaseLine, serializeRunReport, summarise, type SweepEntry } from "./runReport.ts";
import { runAuthorCase } from "./runAuthorCase.ts";

const here = dirname(fileURLToPath(import.meta.url));
const IMPORT_CORPUS_PATH = resolve(here, "../../../../../docs/import-corpus.json");

type Tier = "latin" | "eligible" | "cases";

const TIER_RAW = process.env.KS_AUTHOR_SWEEP;
const SHARD_RAW = process.env.KS_AUTHOR_SHARD ?? "1/1";
const ONLY = process.env.KS_AUTHOR_ONLY;
/** Per-case test timeout; an asynchronous hang or a very slow keyboard ends the case here. */
const CASE_TIMEOUT_MS = Number(process.env.KS_AUTHOR_CASE_TIMEOUT_MS ?? "180000");

function parseShard(raw: string): { k: number; n: number } {
  const m = /^(\d+)\/(\d+)$/.exec(raw);
  const k = m ? Number(m[1]) : 0;
  const n = m ? Number(m[2]) : 0;
  if (!m || n < 1 || k < 1 || k > n) throw new Error(`KS_AUTHOR_SHARD must be k/n with 1 <= k <= n, got "${raw}"`);
  return { k, n };
}

function variantsOf(canonical: readonly Case[]): Case[] {
  const seen = new Set<string>();
  const out: Case[] = [];
  for (const c of canonical) {
    const key = [c.profile, c.inputOrder, c.outputForm, c.backspace, c.backspaceOnDiagonal].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function withVariant(template: Case, v: Case, id: string): Case {
  return {
    ...template,
    id,
    profile: v.profile,
    inputOrder: v.inputOrder,
    outputForm: v.outputForm,
    backspace: v.backspace,
    backspaceOnDiagonal: v.backspaceOnDiagonal,
  };
}

function skipEntry(c: { id: string; base: string; profile: number; backspace: string }, reason: SkipReason): SweepEntry {
  return { caseId: c.id, base: c.base, profile: c.profile, backspace: c.backspace, status: "skipped", skipReason: reason };
}

/** Build the (sync) plan: runnable cases and the cases skipped before running. */
function plan(tier: Tier, shard: { k: number; n: number }): { runnable: Case[]; skipped: SweepEntry[] } {
  const canonical = loadCases();
  const variants = variantsOf(canonical);
  const runnable: Case[] = [];
  const skipped: SweepEntry[] = [];

  if (tier === "cases") {
    const all = new Map<string, Case>();
    for (const c of canonical) all.set(c.id, c);
    for (const { case: pr } of loadPrSet()) {
      for (const v of variants) {
        const id = `${pr.id}@p${v.profile}-${v.backspace}`;
        all.set(id, withVariant(pr, v, id));
      }
    }
    [...all.values()].forEach((c, i) => {
      if (i % shard.n === shard.k - 1) runnable.push(c);
    });
    return { runnable, skipped };
  }

  const doc = JSON.parse(readFileSync(IMPORT_CORPUS_PATH, "utf8")) as { keyboards: { keyboardId: string }[] };
  const bases = doc.keyboards.map((k) => k.keyboardId).sort();
  const template = canonical[0];
  if (template === undefined) throw new Error("canonical case file is empty");
  // Two profile variants per keyboard: profile 1, both backspace answers.
  const sweepVariants = variants.filter((v) => v.profile === 1);
  const profiles = sweepVariants.length > 0 ? sweepVariants : variants.slice(0, 2);

  bases.forEach((base, i) => {
    if (i % shard.n !== shard.k - 1) return;
    const e = eligibility(base, tier === "latin" ? "latin" : "all-eligible", {}, { sizeCap: true });
    for (const v of profiles) {
      const id = `sweep-${base}-p${v.profile}-${v.backspace}`;
      if (!e.eligible) {
        skipped.push(skipEntry({ id, base, profile: v.profile, backspace: v.backspace }, e.reason));
        continue;
      }
      const { overrides: _o, ...rest } = withVariant(template, v, id);
      runnable.push({ ...rest, base, group: e.group, overrides: [] });
    }
  });
  return { runnable, skipped };
}

function classify(c: Case, run: AuthorRun): SweepEntry {
  const head = { caseId: c.id, base: c.base, profile: c.profile, backspace: c.backspace };
  const serialised: unknown = JSON.parse(serializeRunReport(run));
  if (run.outcome === "skipped") {
    return { ...head, status: "skipped", skipReason: run.skipReason ?? "missing", run: serialised };
  }
  if (run.outcome === "failed") {
    const f = run.failure;
    return {
      ...head,
      status: "failed",
      gate: f?.kind ?? "unknown",
      decisionPoint: f?.decisionId ?? f?.step ?? "unknown",
      detail: f?.detail ?? "no detail",
      run: serialised,
    };
  }
  const owned = new Map(run.report.knownGaps.map((g) => [g.gate, g.owner]));
  const failing = run.gates.filter((g) => g.applicable && !g.pass);
  const fresh = failing.find((g) => !owned.has(g.gate));
  if (fresh !== undefined) {
    return {
      ...head,
      status: "failed",
      gate: fresh.gate,
      decisionPoint: "output",
      detail: fresh.detail.join("; "),
      run: serialised,
    };
  }
  const gap = failing[0];
  if (gap !== undefined) {
    return {
      ...head,
      status: "known-gap",
      gate: gap.gate,
      decisionPoint: "output",
      owner: owned.get(gap.gate) ?? "unknown",
      run: serialised,
    };
  }
  return { ...head, status: "ok", run: serialised };
}

if (TIER_RAW === undefined || TIER_RAW === "") {
  console.warn(
    "[WARN] headless sweep: SKIPPED -- KS_AUTHOR_SWEEP is not set (latin | eligible | cases). " +
      "No keyboards were swept.",
  );
  it.skip("headless sweep NOT RUN: KS_AUTHOR_SWEEP is unset", () => {});
} else {
  if (TIER_RAW !== "latin" && TIER_RAW !== "eligible" && TIER_RAW !== "cases") {
    throw new Error(`KS_AUTHOR_SWEEP must be latin, eligible or cases, got "${TIER_RAW}"`);
  }
  const tier: Tier = TIER_RAW;
  const shard = parseShard(SHARD_RAW);
  announceSc004Skip("headless sweep", (name) => it.skip(name, () => {}));

  describe.skipIf(!sc004GatesEnabled)(`headless sweep: ${tier} ${shard.k}/${shard.n}`, () => {
    const planned = plan(tier, shard);
    const runnable = ONLY === undefined ? planned.runnable : planned.runnable.filter((c) => c.id === ONLY);
    const entries: SweepEntry[] = ONLY === undefined ? [...planned.skipped] : [];

    const shardName = `${shard.k}of${shard.n}`;
    const dir = process.env.KS_AUTHOR_REPORT_DIR ?? process.cwd();
    const file = join(dir, `headless-report-${tier}-${shardName}.json`);
    // Entries are serialised once when they finish, so the per-step rewrite stays cheap.
    const finished: { caseId: string; json: string }[] = entries.map((e) => ({ caseId: e.caseId, json: JSON.stringify(e) }));
    let current: SweepEntry | undefined;

    const finish = (entry: SweepEntry): void => {
      entries.push(entry);
      finished.push({ caseId: entry.caseId, json: JSON.stringify(entry) });
    };
    /** A test that timed out never reached finish(): that is a hang, reported as one. */
    const abandoned = new Set<string>();
    const timedOut = (e: SweepEntry): SweepEntry => {
      abandoned.add(e.caseId);
      return {
        ...e,
        status: "failed",
        detail: `the test timed out while running step ${e.decisionPoint ?? "unknown"} (see KS_AUTHOR_TRACE)`,
      };
    };

    /** Rewrite the whole shard report: finished cases plus the one in progress, if any. */
    const writeReport = (): void => {
      const all = current === undefined ? entries : [...entries, current];
      const summary = summarise(tier, `${shard.k}/${shard.n}`, all);
      const rows = [...finished];
      if (current !== undefined) rows.push({ caseId: current.caseId, json: JSON.stringify(current) });
      rows.sort((a, b) => a.caseId.localeCompare(b.caseId));
      mkdirSync(dir, { recursive: true });
      const head = JSON.stringify({ tier, shard: shardName, summary });
      writeFileSync(file, head.slice(0, -1) + ',"cases":[' + rows.map((r) => r.json).join(",") + "]}", "utf8");
    };

    /** The case about to run: on disk before it starts, so a killed shard still names it. */
    const begin = (c: Case): void => {
      if (current !== undefined) finish(timedOut(current));
      current = {
        caseId: c.id,
        base: c.base,
        profile: c.profile,
        backspace: c.backspace,
        status: "in-progress",
        gate: "hung",
        decisionPoint: "unknown",
        detail: "the shard ended while this case was running (a hang or a kill); re-run with KS_AUTHOR_TRACE=1",
      };
      writeReport();
    };
    const step = (id: string): void => {
      if (current === undefined) return;
      current = { ...current, decisionPoint: id };
      writeReport();
    };

    afterAll(() => {
      if (current !== undefined) finish(timedOut(current));
      current = undefined;
      const summary = summarise(tier, `${shard.k}/${shard.n}`, entries);
      writeReport();

      const line = (title: string, group: Record<string, string[] | undefined>): void => {
        for (const [key, ids] of Object.entries(group)) console.log(`  ${title} ${key}: ${ids?.length ?? 0}`);
      };
      console.log(
        `[INFO] sweep ${tier} ${shard.k}/${shard.n}: completed=${summary.cases.completed} ` +
          `failed=${summary.cases.failed} skipped=${summary.cases.skipped} -> ${file}`,
      );
      line("by gate", summary.byGate);
      line("by first failing step", summary.byFirstFailingStep);
      line("skipped", summary.skips);
    });

    it("selected a slice", () => {
      expect(planned.runnable.length + planned.skipped.length).toBeGreaterThan(0);
    });

    for (const c of runnable) {
      it(c.id, async () => {
        let entry: SweepEntry;
        begin(c);
        try {
          const run = await runAuthorCase(c, { onStep: step });
          console.log(formatCaseLine(run));
          entry = classify(c, run);
        } catch (e) {
          // An unexpected throw is still a failure to report, never a lost case.
          const detail = e instanceof Error ? e.message : String(e);
          console.log(`[FAIL] ${c.id} author-threw @ unknown: ${detail}`);
          entry = {
            caseId: c.id,
            base: c.base,
            profile: c.profile,
            backspace: c.backspace,
            status: "failed",
            gate: "author-threw",
            decisionPoint: "unknown",
            detail,
          };
        }
        // The test already timed out and was reported as hung; the walk finished (or died) later.
        if (abandoned.has(c.id)) return;
        current = undefined;
        finish(entry);
        writeReport();
        expect(entry.status === "failed" ? `${entry.gate} @ ${entry.decisionPoint}: ${entry.detail}` : "ok").toBe("ok");
      }, CASE_TIMEOUT_MS);
    }
  });
}
