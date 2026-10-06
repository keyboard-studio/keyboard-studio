import {
  buildOutputRepertoire,
  type KeyboardIR,
  type NormalizationMap,
  type NormalizationRefusalReason,
  type NormalizationStep,
  type NormalizationStepResult,
} from "@keyboard-studio/contracts";
import { emit } from "../../codec/emit.js";
import { computeSha256Hex } from "../../codec/hash.js";
import { NORMALIZATION_GROUP, NORMALIZATION_STEP_GENERATOR_VERSION } from "./constants.js";
import { applyNormalizationStep, entryNameOf, removeNormalizationStep } from "./insert.js";
import { buildNormalizationMaps } from "./maps.js";
import { packNormalization } from "./pack.js";

export * from "./constants.js";
export { applyNormalizationStep, removeNormalizationStep };
export type {
  NormalizationMap,
  NormalizationRefusalReason,
  NormalizationStep,
  NormalizationStepResult,
} from "@keyboard-studio/contracts";

const DEFAULT_BUDGET_MS = 5000;
const MAX_EXAMPLES = 5;

/** Cache key: hash of the emitted source with any generated step removed, plus the generator version. */
export async function normalizationStepCacheKey(ir: KeyboardIR): Promise<string> {
  const hash = await computeSha256Hex(emit(removeNormalizationStep(ir)));
  return `${hash}|${NORMALIZATION_STEP_GENERATOR_VERSION}`;
}

function refused(reason: NormalizationRefusalReason, detail?: string): NormalizationStepResult {
  return detail === undefined ? { kind: "refused", reason } : { kind: "refused", reason, detail };
}

/** Shortest alternates first, then the maps' own (code-point) order, so the choice is stable. */
function pickExamples(maps: readonly NormalizationMap[]): NormalizationStep["examples"] {
  return maps
    .map((m, i) => ({ m, i, len: [...m.from].length }))
    .sort((a, b) => a.len - b.len || a.i - b.i)
    .slice(0, MAX_EXAMPLES)
    .map(({ m }) => ({ pasted: m.from, result: m.to }));
}

/**
 * Derive the normalization step for a keyboard from its source alone: no
 * compile, no simulation. Refuses (never a partial step) when it cannot.
 */
export async function proposeNormalizationStep(
  ir: KeyboardIR,
  opts: { budgetMs?: number } = {},
): Promise<NormalizationStepResult> {
  const deadline = performance.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const expired = (): boolean => performance.now() >= deadline;

  if (ir.header.encoding !== undefined && ir.header.encoding !== "Unicode") {
    return refused("no-unicode-entry", `begin ${ir.header.encoding}`);
  }
  const base = removeNormalizationStep(ir);
  const entry = entryNameOf(base);
  const entryGroup = base.groups.find((g) => g.name === entry);
  if (entryGroup === undefined || entryGroup.readonly) {
    return refused("opaque-entry", entry);
  }
  if (expired()) return refused("time-bound");

  const repertoire = buildOutputRepertoire(base, { shouldStop: expired });
  if (expired()) return refused("time-bound");
  if (repertoire.unresolved.length > 0) {
    return refused("opaque-output-store", repertoire.unresolved.map((u) => u.storeName).join(", "));
  }
  const maps = buildNormalizationMaps(repertoire);
  if (maps.length === 0) return refused("no-alternates");
  if (expired()) return refused("time-bound");

  const packed = packNormalization(maps, repertoire, expired);
  if (packed === null || expired()) return refused("time-bound");

  const delegateTo = (matchKind: "match" | "nomatch", n: number) => ({
    nodeId: `generated_cn_rule_${n}`,
    matchKind,
    context: [],
    output: [{ kind: "useGroup" as const, groupName: entry }],
  });
  const step: NormalizationStep = {
    groupName: NORMALIZATION_GROUP,
    originalEntry: entry,
    stores: packed.stores,
    rules: [...packed.rules, delegateTo("match", packed.rules.length), delegateTo("nomatch", packed.rules.length + 1)],
    ruleCount: packed.rules.length,
    examples: pickExamples(maps),
  };
  return { kind: "step", step, cacheKey: await normalizationStepCacheKey(base), maps };
}
