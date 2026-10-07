// rebuildPerf.measure — SC-004 measurement harness for spec 093.
//
// Measures the two PerfMeasurement scenarios from specs/093-derived-keyboard/
// data-model.md on `sil_euro_latin`:
//
//   edit   — a single-decision edit and the re-derivation of the keyboard
//            source that follows it;
//   resume — restoring a saved project and re-deriving the source.
//
// T002 (baseline) ran both scenarios against the pre-093 working-copy
// path (reducer mutate seam + snapshot restore). T021 re-runs the
// IDENTICAL setup (same corpus package, same SC-004 adapt decision
// flow, same run count, same output projection + .kmn read) against
// the replay path that replaced it:
//
//   edit   = flip the `standard-letters` decision in the live decision
//            store, then `rebuildWorkingCopyFromStores` (spec 093 T009:
//            closure recalculation + replay from the checkpoint before
//            the changed decision — the session trail stays live across
//            runs, so this is the WARM edit protocol), then project.
//   resume = re-seed the decision store from a prepared snapshot clone
//            with the checkpoint trail dropped, then
//            `rebuildWorkingCopyFromStores` over every recorded id (a
//            full replay from the starting point — the COLD resume
//            protocol: a load never has a trail), then project.
//
// Setup (NOT timed): the real sil_euro_latin package is loaded from the
// sibling ../keyboards corpus (the loader mirrors src/test/sc004Harness.ts),
// parsed, instantiated Track 1, and the SC-004 adapt decision flow is
// resolved so the decision store carries a realistic decision set; one
// full rebuild derives the working copy before measuring.
//
// This file is deliberately NOT a *.test.ts: the package vitest config only
// includes *.test.{ts,tsx}, so the harness never runs in the suite. Run it via
// the dedicated config:
//
//   pnpm vitest run --config vitest.measure.config.ts
//
// It prints one JSON block between REBUILD_PERF_JSON_BEGIN / _END markers;
// the numbers are transcribed into specs/093-derived-keyboard/perf-baseline.md
// (T002 baseline; T021 replay figures). The proposed thresholds (<300 ms
// edit / <2 s resume) are recorded there as PROPOSED, pending Matthew's
// ruling — this harness asserts nothing about them.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type { SurveyPhaseResult, VirtualFS } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import { questionRegistry } from "../survey/questions/registry.ts";
import { extractCharacterInventory } from "../survey/questions/gallery/characterInventory.ts";
import { runDecisionFlow } from "./decisionFlow.ts";
import { buildExtractContext } from "./extractContext.ts";
import type { Decision, DecisionId, DecisionSet } from "./decisionTypes.ts";
import {
  applyDecisionSnapshot,
  getDecisionSnapshot,
  useDecisionStore,
} from "../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  rebuildWorkingCopyFromStores,
  resetRebuildTrail,
} from "./rebuildWorkingCopy.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(here, "../../../../../keyboards/release");
const KB = { id: "sil_euro_latin", group: "sil", script: "Latn" } as const;

/** Fixed run count (plan.md T002: "a fixed run count"). Chosen: 15 measured
 *  runs per scenario after 3 untimed warmups; the reported figure is the
 *  median, per data-model.md PerfMeasurement (medianMs, runs). Identical
 *  for T021 so the before/after comparison is like-for-like. */
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
// The character inventory is NOT in the flow set: spec 090 retired the
// spike module into the gallery module, whose `requires`
// (project-keyboard-id et al.) the adapt set does not provide — the
// flow would throw on the unresolved requirement. Its `extract` is the
// spike's own extract lifted (the module's header says so), so the
// harness calls it directly below and records the value as the
// extracted decision, exactly the record the T002 flow produced.
const ADAPT_MODULES = [
  "il_language_english",
  "il_language_code",
  "il_target_script",
  "il_author_name",
  "il_copyright_holder",
  "track_choice",
  "pb_standard_letters",
].map(mod);

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

describe("rebuildPerf.measure — spec 093 SC-004 replay path (T021)", () => {
  it(
    "measures edit (warm) + resume (cold) on sil_euro_latin against the replay path",
    async () => {
      if (!existsSync(join(CORPUS, KB.group, KB.id))) {
        throw new Error(
          `keyboards corpus not found at ${CORPUS} — measurement cannot run without it`,
        );
      }
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

      const extractCtx = buildExtractContext(ir, base);
      const flowDecisions = runDecisionFlow({
        modules: ADAPT_MODULES,
        context: extractCtx,
        answers: {
          il_language_english: "Test Language",
          il_author_name: "Test Author",
          track_choice: "adapt",
          pb_standard_letters: "basic-az",
        },
      });
      // The character-inventory decision, extracted directly (see the
      // ADAPT_MODULES note): the record the T002 flow produced from the
      // spike module, whose extract this function is.
      const extractedInventory = extractCharacterInventory(extractCtx);
      if (!extractedInventory) {
        throw new Error("character inventory extraction empty");
      }
      const decisions: DecisionSet = {
        ...flowDecisions,
        "character-inventory": {
          id: "character-inventory" as DecisionId,
          value: extractedInventory,
          provenance: "extracted",
          source: KB.id,
        },
      };
      const recordedIds = Object.keys(decisions) as DecisionId[];
      expect(recordedIds.length).toBeGreaterThan(0);

      // Seed the live decision store and derive the working copy with one
      // full replay — the state both scenarios measure FROM.
      useDecisionStore.getState().recordAll(Object.values(decisions));
      resetRebuildTrail();
      const setupOutcome = rebuildWorkingCopyFromStores(recordedIds);
      expect(setupOutcome).not.toBeNull();

      // The character inventory feeds the session the projection reads
      // (its module's apply is a seed-only no-op; the Phase B record is
      // the session feed, exactly as in the T002 setup).
      const inventory = (decisions["character-inventory"]?.value ?? []) as string[];
      const phaseB: SurveyPhaseResult = {
        phase: "B",
        answers: [{ questionId: "b_inventory", answerType: "char-list", value: inventory }],
      };
      store.getState().recordPhase(phaseB);

      const setupKmnLength = await projectAndReadKmn();
      expect(setupKmnLength).toBeGreaterThan(0);

      // Resume inputs: clones of the saved decision snapshot, prepared
      // OUTSIDE the timed region so clone cost is not attributed to the
      // resume path (mirrors the T002 harness's snapshot clones).
      const savedDecisions = getDecisionSnapshot();
      const resumeInputs: DecisionSet[] = Array.from(
        { length: WARMUPS + RUNS },
        () => structuredClone(savedDecisions),
      );

      // ---------------- edit scenario (warm) ----------------
      const EDIT_ID = "standard-letters" as DecisionId;
      const editValues = ["extended-latin", "basic-az"];
      let flip = 0;
      const runEdit = async (): Promise<void> => {
        const current = useDecisionStore.getState().decisions[EDIT_ID];
        if (current === undefined) throw new Error("standard-letters decision missing");
        const next: Decision = { ...current, value: editValues[flip % 2]! };
        flip += 1;
        useDecisionStore.getState().record(next);
        // The trail stays live across runs: an incremental rebuild from
        // the checkpoint before the changed decision (the warm path).
        rebuildWorkingCopyFromStores([EDIT_ID]);
        await projectAndReadKmn();
      };
      for (let i = 0; i < WARMUPS; i++) await runEdit();
      const editSeries: number[] = [];
      for (let i = 0; i < RUNS; i++) {
        const t0 = performance.now();
        await runEdit();
        editSeries.push(performance.now() - t0);
      }

      // ---------------- resume scenario (cold) ----------------
      const runResume = async (input: DecisionSet): Promise<void> => {
        applyDecisionSnapshot(input);
        // No trail on a load: the rebuild is a full replay from the
        // starting point (the cold path).
        resetRebuildTrail();
        rebuildWorkingCopyFromStores(recordedIds);
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
        task: "093 T021 replay path (edit warm / resume cold)",
        keyboard: KB.id,
        corpusPath: `../keyboards/release/${KB.group}/${KB.id}`,
        sourceKmnBytes: kmnText.length,
        irStores: ir.stores.length,
        irGroups: ir.groups.length,
        projectedKmnChars: setupKmnLength,
        decisionCount: recordedIds.length,
        warmups: WARMUPS,
        conditions: {
          node: process.version,
          platform: `${platform()} ${release()}`,
          cpu: cpu ? `${cpu.model} x${cpus().length}` : "unknown",
          env: "vitest (jsdom environment), Node — not a browser",
          editProtocol: "warm — session checkpoint trail live; incremental rebuild from the checkpoint before the changed decision",
          resumeProtocol: "cold — checkpoint trail dropped per run; full replay from the starting point over the restored decision snapshot",
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
    },
    900_000,
  );
});
