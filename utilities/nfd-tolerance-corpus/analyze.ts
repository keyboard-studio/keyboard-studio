// Per-keyboard pipeline: strip -> parse -> compile -> diagnose -> transform
// -> recompile -> probe -> bucket.
//
// Every step runs the REAL engine code path (`computeContextTolerance`,
// `proposeContextVariants`, the WASM kmc-kmn compiler, the vendored KeymanWeb
// processor). Nothing here re-implements the transform or guesses at what it
// would do; the harness only decides what to press and what to compare.

import type { CompileResult, KeyboardIR } from "@keyboard-studio/contracts";

import { createVirtualFS } from "@keyboard-studio/contracts";
import { emit } from "../../packages/engine/src/codec/emit.js";
import { parse } from "../../packages/engine/src/codec/parse.js";
import { compile } from "../../packages/engine/src/compiler/index.js";
import { stripDanglingAssetStores } from "../../packages/engine/src/compiler/stripDanglingAssetStores.js";
import { proposeContextVariants } from "../../packages/engine/src/pattern-apply/context-variants.js";
import { simulate } from "../../packages/engine/src/simulator/index.js";
import {
  buildStoreCharIndex,
  computeContextTolerance,
  stripAssetStoresForCompile,
} from "../../packages/engine/src/validator/context-tolerance.js";

import {
  bucketFor,
  classifyProbe,
  codepoints,
  emptyProbeCounts,
  enumerateProbes,
  gateIdFor,
} from "./probes.js";
import type { KeyboardResult, ProbeCase, ProbeResult } from "./types.js";

/** Default per-keyboard probe cap. Generous for real keyboards, bounded for pathological ones. */
export const DEFAULT_MAX_PROBES = 400;

/** A `.kmn` read off disk, ready to analyse. */
export interface KmnInput {
  id: string;
  /** Corpus-relative path, for the report. */
  path: string;
  text: string;
}

/**
 * Strip the packaging-asset stores that would otherwise make kmc-kmn emit
 * zero artifacts, then parse and re-base the IR's source lines onto the
 * original file.
 *
 * THE &LAYOUTFILE WORKAROUND. `stripAssetStoresForCompile`, which the engine
 * applies internally before its own compiles, drops only `&BITMAP` and
 * `&VISUALKEYBOARD`. It does not drop `&LAYOUTFILE`, and kmcmplib emits
 * nothing at all when a header store names a packaging asset it cannot open
 * — so on the ~92% of corpus keyboards that declare a touch layout, every
 * behavioural comparison silently reports "failed to compile". That is an
 * engine defect with its own tracking issue; this harness does not fix it.
 * It compensates locally by running the repo's existing
 * `stripDanglingAssetStores` over the source TEXT first, against an empty
 * VFS so every asset counts as absent. The engine's own narrower strip then
 * has nothing left to miss, and the harness's numbers mean something.
 *
 * Stripping DELETES header lines, so the parsed IR's `sourceLine` values are
 * short by however many went — a report citing them would send a reader to
 * the wrong line of the real `.kmn` (sil_yoruba8's dot-below rule is at 237,
 * and reads as 235 unshifted). Every removed line is a header store, so it
 * precedes `begin` and therefore every node: one uniform shift restores the
 * original numbering exactly, and preserves relative order, which is what the
 * codec's position-faithful emit path reads `sourceLine` for.
 */
export function prepare(text: string, id: string): { ir: KeyboardIR; strippedAssetStores: string[] } {
  const { kmn, stripped } = stripDanglingAssetStores(text, createVirtualFS([]));
  const { ir } = parse(kmn, id);
  const removedLines = countLines(text) - countLines(kmn);
  return { ir: rebaseSourceLines(ir, removedLines), strippedAssetStores: stripped };
}

function countLines(text: string): number {
  return text.split("\n").length;
}

/** Shift every `sourceLine` in an IR by `offset` lines. A no-op at 0. */
function rebaseSourceLines(ir: KeyboardIR, offset: number): KeyboardIR {
  if (offset === 0) return ir;
  const shift = <T extends { sourceLine?: number }>(node: T): T =>
    node.sourceLine === undefined ? node : { ...node, sourceLine: node.sourceLine + offset };
  return {
    ...ir,
    stores: ir.stores.map(shift),
    comments: ir.comments.map(shift),
    raw: ir.raw.map(shift),
    groups: ir.groups.map((group) => ({ ...shift(group), rules: group.rules.map(shift) })),
  };
}

/** Compile an IR for simulation only — never for anything a caller keeps. */
export async function compileForSimulation(ir: KeyboardIR): Promise<CompileResult> {
  const vfs = createVirtualFS([
    {
      path: `source/${ir.header.keyboardId}.kmn`,
      content: emit(stripAssetStoresForCompile(ir)),
      isBinary: false,
    },
  ]);
  return compile(vfs, ir.header.keyboardId);
}

/** What the real transform did to one keyboard, plus the diagnostic it ran on. */
export interface TransformOutcome {
  ir: KeyboardIR;
  generatedVariants: number;
  diagnosedGapRules: number;
  /** Gate id -> refused rule count, from the diagnostic's `notAnalysedReason`s. */
  refusals: Record<string, number>;
}

/** Run `computeContextTolerance` + `proposeContextVariants` exactly as the engine would. */
export async function runTransform(ir: KeyboardIR): Promise<TransformOutcome> {
  const report = await computeContextTolerance(ir);
  const { ir: transformed, variants } = await proposeContextVariants(ir, report);

  const refusals: Record<string, number> = {};
  let diagnosedGapRules = 0;
  for (const finding of report.findings) {
    if (finding.failingKeystrokes !== undefined) diagnosedGapRules += 1;
    if (finding.notAnalysedReason === undefined) continue;
    const gate = gateIdFor(finding.notAnalysedReason);
    refusals[gate] = (refusals[gate] ?? 0) + 1;
  }

  return { ir: transformed, generatedVariants: variants.length, diagnosedGapRules, refusals };
}

/**
 * Seed the buffer with one character, press one key, render the result as
 * codepoints. Exported because the ground-truth fixtures compare THREE builds
 * (baseline, hand fix, machine transform), not the two `runProbes` takes.
 */
export function press(compiled: CompileResult, probe: ProbeCase, seed: string): string {
  try {
    return codepoints(simulate(compiled, [probe.key], { text: seed }).finalOutput);
  } catch (err) {
    const what = err instanceof Error ? err.message : String(err);
    throw new Error(`probe ${codepoints(seed)} + ${probe.key.vkey} (rule ${probe.ruleId}): ${what}`);
  }
}

/**
 * Compare one compiled build against another across every probe. `before`
 * and `after` are just two compiled keyboards — the corpus run passes
 * baseline and transformed; the ground-truth fixtures pass baseline and the
 * human's hand fix.
 */
export function runProbes(
  probes: readonly ProbeCase[],
  before: CompileResult,
  after: CompileResult,
): ProbeResult[] {
  return probes.map((probe) => {
    const decomposed = probe.contextChar.normalize("NFD");
    const baselinePrecomposed = press(before, probe, probe.contextChar);
    const transformedPrecomposed = press(after, probe, probe.contextChar);
    // A context character with no decomposition seeds the same buffer twice.
    // simulate() reloads the whole compiled keyboard into a fresh vm on every
    // call, so skipping the repeat halves the cost of these probes — and they
    // are the majority. They still earn their place: this is where collateral
    // damage to an already-correct path shows up.
    const seedsDiffer = decomposed !== probe.contextChar;
    const outputs = {
      baselinePrecomposed,
      baselineDecomposed: seedsDiffer ? press(before, probe, decomposed) : baselinePrecomposed,
      transformedPrecomposed,
      transformedDecomposed: seedsDiffer
        ? press(after, probe, decomposed)
        : transformedPrecomposed,
    };
    return { ...probe, ...outputs, outcome: classifyProbe(outputs) };
  });
}

/**
 * Whether a compile produced what `simulate()` needs. `success` alone is not
 * enough: `simulate()` runs the `.js` (KeymanWeb) artifact, and a compile can
 * succeed having emitted only a `.kmx`.
 */
export function simulable(result: CompileResult): boolean {
  return result.success && result.artifacts.some((a) => a.filename.endsWith(".js"));
}

/** Why a compile is unusable — kmc-kmn's own words where it has any. */
function compileDetail(result: CompileResult): string {
  const messages = result.diagnostics
    .filter((d) => d.severity === "error" || d.severity === "fatal")
    .map((d) => d.message)
    .filter((m) => m.length > 0);
  if (messages.length > 0) return messages.join("; ");
  return result.success ? "no .js (KeymanWeb) artifact emitted" : "compile failed with no diagnostic";
}

function baseResult(input: KmnInput, strippedAssetStores: string[]): KeyboardResult {
  return {
    id: input.id,
    path: input.path,
    bucket: "no-gap",
    strippedAssetStores,
    refusals: {},
    diagnosedGapRules: 0,
    generatedVariants: 0,
    probeCounts: emptyProbeCounts(),
    notableProbes: [],
    probeCapReached: false,
  };
}

/** Analyse one keyboard end to end. Never throws: a failure becomes a bucket. */
export async function analyzeKeyboard(
  input: KmnInput,
  maxProbes: number = DEFAULT_MAX_PROBES,
): Promise<KeyboardResult> {
  let result = baseResult(input, []);
  try {
    const { ir, strippedAssetStores } = prepare(input.text, input.id);
    result = baseResult(input, strippedAssetStores);

    const baseline = await compileForSimulation(ir);
    if (!simulable(baseline)) {
      return { ...result, bucket: "compile-failed", detail: `baseline: ${compileDetail(baseline)}` };
    }

    const transform = await runTransform(ir);
    result = {
      ...result,
      refusals: transform.refusals,
      diagnosedGapRules: transform.diagnosedGapRules,
      generatedVariants: transform.generatedVariants,
    };

    const transformed = await compileForSimulation(transform.ir);
    if (!simulable(transformed)) {
      return {
        ...result,
        bucket: "compile-failed",
        detail: `after transform: ${compileDetail(transformed)}`,
      };
    }

    const { probes, capReached } = enumerateProbes(ir, buildStoreCharIndex(ir), maxProbes);
    const probeResults = runProbes(probes, baseline, transformed);

    const probeCounts = emptyProbeCounts();
    for (const probe of probeResults) probeCounts[probe.outcome] += 1;

    const refusedRules = Object.values(transform.refusals).reduce((n, c) => n + c, 0);
    return {
      ...result,
      bucket: bucketFor(probeCounts, probes.length, refusedRules),
      probeCounts,
      notableProbes: probeResults.filter((p) => p.outcome !== "no-gap"),
      probeCapReached: capReached,
    };
  } catch (err) {
    return {
      ...result,
      bucket: "harness-error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
