// Ground truth: two keyboards a human fixed by hand for exactly this bug.
//
// `haroi` (keymanapp/keyboards ed1c31f51, 2020) and `sil_kcho` (b58b9e62a,
// 2025) both gained decomposed-context rules so the keyboard would accept NFD
// input — haroi's commit message names FLEx as the NFD source. Their pre-fix
// and post-fix `.kmn` are vendored under `__fixtures__/` (see the README for
// provenance) so this check is hermetic: it needs no corpus checkout and no
// network, and it cannot drift when the corpus moves.
//
// The assertion is not "the transform emits the same rules". It never will -
// the human wrote 2 rules plus 8 stores where the transform writes dozens of
// flat literal ones. The assertion is that for every input pair the HUMAN
// made canonically tolerant, the machine transform produces the same bytes
// the human's keyboard produces. Same behaviour, different source shape.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildStoreCharIndex } from "../../packages/engine/src/validator/context-tolerance.js";

import {
  compileForSimulation,
  prepare,
  press,
  runTransform,
  simulable,
  DEFAULT_MAX_PROBES,
} from "./analyze.js";
import { enumerateProbes } from "./probes.js";
import type { ProbeCase } from "./types.js";

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/** A hand fix in the corpus, vendored at both sides of its commit. */
export interface GroundTruthFixture {
  id: string;
  /** The keymanapp/keyboards commit that hand-fixed this keyboard. */
  commit: string;
  /** Corpus path the fixture bytes came from. */
  sourcePath: string;
}

export const GROUND_TRUTH: readonly GroundTruthFixture[] = [
  { id: "haroi", commit: "ed1c31f51", sourcePath: "release/h/haroi/source/haroi.kmn" },
  { id: "sil_kcho", commit: "b58b9e62a", sourcePath: "release/sil/sil_kcho/source/sil_kcho.kmn" },
];

/** Read one side of a fixture. `side` is `"pre-fix"` or `"post-fix"`. */
export function readFixture(id: string, side: "pre-fix" | "post-fix"): string {
  return readFileSync(join(FIXTURE_DIR, `${id}.${side}.kmn`), "utf8");
}

/** One pair the human fixed where the machine transform did not match. */
export interface GroundTruthMismatch extends ProbeCase {
  /** The pre-fix keyboard's output for the precomposed seed. */
  baselinePrecomposed: string;
  /** The pre-fix keyboard's output for the decomposed seed — the broken one. */
  baselineDecomposed: string;
  /** What the human's fixed keyboard produces for the decomposed seed. */
  handFixedDecomposed: string;
  /** What the machine transform produces for it. */
  transformedDecomposed: string;
}

export interface GroundTruthResult {
  id: string;
  /**
   * Pairs where the pre-fix keyboard disagreed across canonical forms and the
   * hand fix made it agree — i.e. what the human actually repaired.
   */
  humanFixedPairs: number;
  /** Of those, how many the transform reproduces byte-for-byte. */
  reproducedPairs: number;
  mismatches: GroundTruthMismatch[];
  /**
   * Pairs where the hand fix changed the PRECOMPOSED output too. Reported,
   * not asserted: the hand fixes also carry unrelated edits (a version bump,
   * scratch rules on other keys), and this harness measures input tolerance,
   * not those.
   */
  handFixChangedComposed: number;
  /**
   * Gate id -> refused rule count from the transform's own diagnostic, so a
   * shortfall says WHY rather than just how much.
   */
  refusals: Record<string, number>;
}

/**
 * Compile the pre-fix keyboard, the human's fixed keyboard, and the machine
 * transform of the pre-fix keyboard, then compare all three on every probe
 * the pre-fix keyboard yields.
 */
export async function evaluateGroundTruth(
  fixture: GroundTruthFixture,
  maxProbes: number = DEFAULT_MAX_PROBES,
): Promise<GroundTruthResult> {
  const preFix = prepare(readFixture(fixture.id, "pre-fix"), fixture.id);
  const postFix = prepare(readFixture(fixture.id, "post-fix"), fixture.id);

  const baseline = await compileForSimulation(preFix.ir);
  const handFixed = await compileForSimulation(postFix.ir);
  const transform = await runTransform(preFix.ir);
  const transformed = await compileForSimulation(transform.ir);

  for (const [label, compiled] of [
    ["pre-fix", baseline],
    ["post-fix", handFixed],
    ["transformed", transformed],
  ] as const) {
    if (!simulable(compiled)) {
      throw new Error(`${fixture.id}: ${label} keyboard produced nothing to simulate`);
    }
  }

  const { probes } = enumerateProbes(preFix.ir, buildStoreCharIndex(preFix.ir), maxProbes);

  let humanFixedPairs = 0;
  let reproducedPairs = 0;
  let handFixChangedComposed = 0;
  const mismatches: GroundTruthMismatch[] = [];

  for (const probe of probes) {
    const decomposed = probe.contextChar.normalize("NFD");
    const baselinePrecomposed = press(baseline, probe, probe.contextChar);
    const baselineDecomposed = press(baseline, probe, decomposed);
    // Nothing to learn from a pair the pre-fix keyboard already handled.
    if (baselinePrecomposed === baselineDecomposed) continue;

    const handFixedPrecomposed = press(handFixed, probe, probe.contextChar);
    const handFixedDecomposed = press(handFixed, probe, decomposed);
    // Nothing to learn from a pair the human did not repair either.
    if (handFixedPrecomposed !== handFixedDecomposed) continue;

    humanFixedPairs += 1;
    if (handFixedPrecomposed !== baselinePrecomposed) handFixChangedComposed += 1;

    const transformedDecomposed = press(transformed, probe, decomposed);
    if (transformedDecomposed === handFixedDecomposed) {
      reproducedPairs += 1;
      continue;
    }
    mismatches.push({
      ...probe,
      baselinePrecomposed,
      baselineDecomposed,
      handFixedDecomposed,
      transformedDecomposed,
    });
  }

  return {
    id: fixture.id,
    humanFixedPairs,
    reproducedPairs,
    mismatches,
    handFixChangedComposed,
    refusals: transform.refusals,
  };
}
