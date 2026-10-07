// rebuildPerf.measure — SC-004 measurement harness for spec 093 (task T002).
//
// Measures the two PerfMeasurement scenarios from specs/093-derived-keyboard/
// data-model.md on `sil_euro_latin`:
//
//   edit   — a single-decision edit and the re-derivation of the keyboard
//            source that follows it;
//   resume — restoring a saved project and re-deriving the source.
//
// BASELINE (T002): no replay engine exists yet, so both scenarios run against
// the CURRENT (pre-093) working-copy path, exactly as the app does it today:
//
//   edit   = one decision answer applied through the real reducer mutate seam
//            (steps/reducer.ts `applyStepCompletion`, spec-014 seam with
//            VITE_KM_MUTATE_SEAM=1, alternating the pb_standard_letters answer
//            so every run does real work), followed by the full output
//            projection (`projectWorkingCopyForOutput` — the same projection
//            the OSK preview and the ZIP/PR output paths share) and a read of
//            the projected .kmn so the result is materialised.
//   resume = the draft-load restore in lib/draftPersistence.ts reduced to its
//            working-copy core: `prepareWorkingCopySnapshot(snapshot)` +
//            `useWorkingCopyStore.setState(...)` from a snapshot taken with
//            `snapshotWorkingCopyData()` (what a draft saves today), followed
//            by the same projection + .kmn read. This is the cost spec 093
//            replaces with a full replay on load, so it is the honest
//            comparator for T021.
//
// Setup (NOT timed): the real sil_euro_latin package is loaded from the
// sibling ../keyboards corpus (the loader mirrors src/test/sc004Harness.ts),
// parsed, instantiated Track 1, and the SC-004 adapt decision flow is applied
// so the working copy carries a realistic decision set before measuring.
//
// This file is deliberately NOT a *.test.ts: the package vitest config only
// includes *.test.{ts,tsx}, so the harness never runs in the suite. Run it via
// the dedicated config:
//
//   pnpm vitest run --config vitest.measure.config.ts
//
// It prints one JSON block between REBUILD_PERF_JSON_BEGIN / _END markers;
// the numbers are transcribed into specs/093-derived-keyboard/perf-baseline.md
// (T002) and re-measured against the replay path by T021. The proposed
// thresholds (<300 ms edit / <2 s resume) are recorded there as PROPOSED,
// pending Matthew's ruling — this harness asserts nothing about them.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult, VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { questionRegistry } from "../survey/questions/registry.ts";
import pbCharacterInventory from "../survey/questions/b/pb_character_inventory.ts";
import { runDecisionFlow } from "./decisionFlow.ts";
import { buildExtractContext } from "./extractContext.ts";
import { orderDecisions } from "./orderDecisions.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  applyStepCompletion,
  type MutateRequest,
  type ReducerDeps,
} from "../steps/reducer.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { identityLanguagePatch } from "../lib/identityLanguagePatch.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import {
  prepareWorkingCopySnapshot,
  snapshotWorkingCopyData,
  type WorkingCopySnapshot,
} from "../lib/persistWorkingCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(here, "../../../../../keyboards/release");
const KB = { id: "sil_euro_latin", group: "sil", script: "Latn" } as const;

/** Fixed run count (plan.md T002: "a fixed run count"). Chosen: 15 measured
 *  runs per scenario after 3 untimed warmups; the reported figure is the
 *  median, per data-model.md PerfMeasurement (medianMs, runs). */
const RUNS = 15;
const WARMUPS = 3;

/** The package's files as the base browser would hand them over — mirrors
 *  src/test/sc004Harness.ts loadVfs (whole package, shared/ staging, header
 *  store siblings), minus that file's SC-004-specific keyboard table. */
function loadVfs(): VirtualFS {
  const rootDir = join(CORPUS, KB.group, KB.id);
  const files: { path: string; content: string | Uint8Array; isBinary: boolean }[] = [];
  const isBinary = (p: string) => /\.(ico|png|jpg|jpeg|gif|kmx|kvk|ttf|woff2?)$/i.test(p);
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(rootDir, abs).replaceAll("\\", "/");
      if (statSync(abs).isDirectory()) {
        if (rel === "build" || rel === ".git") continue;
        walk(abs);
      } else {
        files.push(
          isBinary(rel)
            ? { path: rel, content: new Uint8Array(readFileSync(abs)), isBinary: true }
            : { path: rel, content: readFileSync(abs, "utf-8"), isBinary: false },
        );
      }
    }
  };
  walk(rootDir);
  const refText = files
    .filter((f) => !f.isBinary && /\.(kmn|kps)$/i.test(f.path))
    .map((f) => f.content as string)
    .join("\n");
  const have = new Set(files.map((f) => f.path));
  const sharedRef = /(?:\.\.[\\/]){3}(shared[\\/][^'"<>\r\n]+)/g;
  for (const m of refText.matchAll(sharedRef)) {
    const rel = m[1]!.replaceAll("\\", "/").trim();
    const abs = join(CORPUS, rel);
    if (have.has(rel) || !existsSync(abs)) continue;
    have.add(rel);
    files.push(
      isBinary(rel)
        ? { path: rel, content: new Uint8Array(readFileSync(abs)), isBinary: true }
        : { path: rel, content: readFileSync(abs, "utf-8"), isBinary: false },
    );
  }
  const storeRef = /store\(&\w+\)\s*'([^']*\.\.[^']*)'/g;
  for (const m of refText.matchAll(storeRef)) {
    const raw = m[1]!.trim();
    const key = `source/${raw}`;
    const abs = join(rootDir, "source", raw);
    if (have.has(key) || !existsSync(abs)) continue;
    have.add(key);
    files.push(
      isBinary(raw)
        ? { path: key, content: new Uint8Array(readFileSync(abs)), isBinary: true }
        : { path: key, content: readFileSync(abs, "utf-8"), isBinary: false },
    );
  }
  return createVirtualFS(files);
}

const mod = (id: string) => {
  const m = questionRegistry[id];
  if (!m) throw new Error(`question "${id}" not in registry`);
  return m;
};

// The SC-004 adapt module set (src/test/sc004Harness.ts), unchanged.
const ADAPT_MODULES = [
  "il_language_english",
  "il_language_code",
  "il_target_script",
  "il_author_name",
  "il_copyright_holder",
  "track_choice",
  "pb_standard_letters",
].map(mod).concat([pbCharacterInventory]);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function summarise(xs: number[]) {
  const total = xs.reduce((a, b) => a + b, 0);
  return {
    medianMs: Number(median(xs).toFixed(2)),
    meanMs: Number((total / xs.length).toFixed(2)),
    minMs: Number(Math.min(...xs).toFixed(2)),
    maxMs: Number(Math.max(...xs).toFixed(2)),
    runs: xs.length,
    seriesMs: xs.map((x) => Number(x.toFixed(2))),
  };
}

/** Project the working copy and materialise the .kmn; returns its length. */
async function projectAndReadKmn(): Promise<number> {
  const out = await projectWorkingCopyForOutput();
  if (out === null) throw new Error("projection returned null (not instantiated)");
  const kmn = readVfsText(out.vfs, `source/${KB.id}.kmn`);
  if (kmn === undefined) throw new Error("projected .kmn missing");
  return kmn.length;
}

describe("rebuildPerf.measure — spec 093 SC-004 baseline (T002)", () => {
  it(
    "measures edit + resume on sil_euro_latin against the current working-copy path",
    async () => {
      if (!existsSync(join(CORPUS, KB.group, KB.id))) {
        throw new Error(
          `keyboards corpus not found at ${CORPUS} — baseline cannot be measured without it`,
        );
      }
      // The mutate seam is the current path's decision-write path only with
      // the flag on (089 will make it unconditional); the SC-004 gates use
      // the same stub. Recorded in perf-baseline.md as a run condition.
      vi.stubEnv("VITE_KM_MUTATE_SEAM", "1");
      try {
        // ---------------- setup (untimed) ----------------
        const vfs = loadVfs();
        const kmnText = readVfsText(vfs, `source/${KB.id}.kmn`);
        if (kmnText === undefined) throw new Error("fixture .kmn present in VFS");
        const { ir } = parseKmn(kmnText, KB.id);
        const base = makeBaseKeyboard({
          id: KB.id,
          script: KB.script,
          path: `release/${KB.group}/${KB.id}`,
          targets: ["windows"],
          displayName: KB.id,
          version: "1.0",
          languages: ["aae"],
        });
        const store = useWorkingCopyStore;
        store.getState().instantiateFromBase(base, { vfs, ir });
        expect(store.getState().baseKeyboard?.id).toBe(KB.id);

        const decisions = runDecisionFlow({
          modules: ADAPT_MODULES,
          context: buildExtractContext(ir, base),
          answers: {
            il_language_english: "Test Language",
            il_author_name: "Test Author",
            track_choice: "adapt",
            pb_standard_letters: "basic-az",
          },
        });

        const deps = {
          getWorkingIR: () => store.getState().baseIr,
          setWorkingIR: (next: typeof ir) => store.getState().setWorkingIR(next),
        } as ReducerDeps;
        const applyMutate = (moduleId: string, value: string): void => {
          const m = mod(moduleId);
          const req: MutateRequest = {
            kind: "mutate",
            mutate: m.mutate!,
            value,
            writes: m.writes!,
          };
          applyStepCompletion(m.definition.id, req, deps);
        };
        for (const m of orderDecisions(ADAPT_MODULES)) {
          if (m.mutate === undefined || m.writes === undefined) continue;
          const pid = m.provides?.[0];
          const d = pid === undefined ? undefined : decisions[pid];
          if (d === undefined || d.value === undefined) continue;
          applyMutate(m.definition.id, d.value as string);
        }
        store.getState().setAttribution({
          authorName: String(decisions["author-name"]?.value ?? ""),
          copyrightHolder: String(decisions["copyright-holder"]?.value ?? ""),
        });
        store.getState().setIdentity({
          displayName: base.displayName,
          ...identityLanguagePatch({
            bcp47: String(decisions["language-code"]?.value ?? ""),
            english: String(decisions["language-name"]?.value ?? ""),
          }),
        });
        const inventory = (decisions["character-inventory"]?.value ?? []) as string[];
        const phaseB: SurveyPhaseResult = {
          phase: "B",
          answers: [{ questionId: "b_inventory", answerType: "char-list", value: inventory }],
        };
        store.getState().recordPhase(phaseB);

        const setupKmnLength = await projectAndReadKmn();
        expect(setupKmnLength).toBeGreaterThan(0);

        // The snapshot a draft saves today (resume input), and per-run
        // clones prepared OUTSIDE the timed region so clone cost is not
        // attributed to the restore path.
        const snapshot: WorkingCopySnapshot = snapshotWorkingCopyData();
        const resumeInputs = Array.from({ length: WARMUPS + RUNS }, () =>
          structuredClone(snapshot),
        );

        // ---------------- edit scenario ----------------
        const editValues = ["extended-latin", "basic-az"];
        let flip = 0;
        const runEdit = async (): Promise<void> => {
          applyMutate("pb_standard_letters", editValues[flip % 2]!);
          flip += 1;
          await projectAndReadKmn();
        };
        for (let i = 0; i < WARMUPS; i++) await runEdit();
        const editSeries: number[] = [];
        for (let i = 0; i < RUNS; i++) {
          const t0 = performance.now();
          await runEdit();
          editSeries.push(performance.now() - t0);
        }

        // ---------------- resume scenario ----------------
        const runResume = async (input: WorkingCopySnapshot): Promise<void> => {
          store.getState().reset();
          const prepared = prepareWorkingCopySnapshot(input);
          useWorkingCopyStore.setState(prepared);
          await projectAndReadKmn();
        };
        for (let i = 0; i < WARMUPS; i++) await runResume(resumeInputs[i]!);
        const resumeSeries: number[] = [];
        for (let i = 0; i < RUNS; i++) {
          const input = resumeInputs[WARMUPS + i]!;
          const t0 = performance.now();
          await runResume(input);
          resumeSeries.push(performance.now() - t0);
        }

        const cpu = cpus()[0];
        const report = {
          harness: "packages/studio/src/decisions/rebuildPerf.measure.ts",
          task: "093 T002 baseline (pre-093 working-copy path)",
          keyboard: KB.id,
          corpusPath: `../keyboards/release/${KB.group}/${KB.id}`,
          sourceKmnBytes: kmnText.length,
          irStores: ir.stores.length,
          irGroups: ir.groups.length,
          projectedKmnChars: setupKmnLength,
          warmups: WARMUPS,
          conditions: {
            node: process.version,
            platform: `${platform()} ${release()}`,
            cpu: cpu ? `${cpu.model} x${cpus().length}` : "unknown",
            env: "vitest (jsdom environment), Node — not a browser",
            mutateSeamFlag: "VITE_KM_MUTATE_SEAM=1 (stubbed, as in the SC-004 gates)",
          },
          edit: summarise(editSeries),
          resume: summarise(resumeSeries),
        };
        // eslint-disable-next-line no-console -- a measurement harness's
        // console output IS its product: the JSON report transcribed into
        // specs/093-derived-keyboard/perf-baseline.md.
        console.log(
          `\nREBUILD_PERF_JSON_BEGIN\n${JSON.stringify(report, null, 2)}\nREBUILD_PERF_JSON_END\n`,
        );
      } finally {
        vi.unstubAllEnvs();
      }
    },
    900_000,
  );
});
