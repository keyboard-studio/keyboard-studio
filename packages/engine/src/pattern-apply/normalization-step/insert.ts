import type { IRGroup, IRRule, KeyboardIR, NormalizationStep } from "@keyboard-studio/contracts";
import { NORMALIZATION_GROUP, NORMALIZATION_STORE_PREFIX } from "./constants.js";

/**
 * The keyboard's entry group name: `entryPoints.main`, else the first
 * non-readonly group, else "main" -- mirroring the `begin` line `emit.ts`
 * writes. Deliberately NOT `entryGroupOf` (`ir-insert.ts`), which returns the
 * first writable `using keys` group and can disagree with the real entry.
 */
export function entryNameOf(ir: KeyboardIR): string {
  return ir.header.entryPoints?.main ?? ir.groups.find((g) => !g.readonly)?.name ?? "main";
}

/**
 * The group a rule's `use(X)` names. A step built here carries a `useGroup`
 * output; a step read back from emitted text carries the parser's raw
 * `use(X)` output, so both spellings are recognised.
 */
function groupNamedByUse(output: readonly IRRule["output"][number][]): string | undefined {
  for (const o of output) {
    if (o.kind === "useGroup") return o.groupName;
    if (o.kind === "raw") {
      const m = /^use\(\s*([^)\s]+)\s*\)$/.exec(o.text.trim());
      if (m?.[1] !== undefined) return m[1];
    }
  }
  return undefined;
}

/**
 * Remove a previously applied step: restores `entryPoints.main` from the
 * group's `nomatch > use(X)` target and deletes the group and its stores.
 * Returns `ir` itself when no step is present.
 */
export function removeNormalizationStep(ir: KeyboardIR): KeyboardIR {
  const group = ir.groups.find((g) => g.name === NORMALIZATION_GROUP);
  if (group === undefined) return ir;
  const nomatch = group.rules.find((r) => r.matchKind === "nomatch");
  const entryPoints = { ...ir.header.entryPoints };
  const target = nomatch === undefined ? undefined : groupNamedByUse(nomatch.output);
  if (target !== undefined) entryPoints.main = target;
  return {
    ...ir,
    header: { ...ir.header, entryPoints },
    groups: ir.groups.filter((g) => g !== group),
    stores: ir.stores.filter((s) => !s.name.startsWith(NORMALIZATION_STORE_PREFIX)),
  };
}

/**
 * Append the step as a non-keys group and redirect `entryPoints.main` to it.
 * Always removes an existing step first, so applying twice yields one group.
 * Returns a new IR; the input is never mutated.
 */
export function applyNormalizationStep(ir: KeyboardIR, step: NormalizationStep): KeyboardIR {
  const base = removeNormalizationStep(ir);
  const group: IRGroup = {
    nodeId: `${NORMALIZATION_STORE_PREFIX}group`,
    name: NORMALIZATION_GROUP,
    usingKeys: false,
    rules: step.rules,
    readonly: false,
  };
  return {
    ...base,
    header: { ...base.header, entryPoints: { ...base.header.entryPoints, main: NORMALIZATION_GROUP } },
    groups: [...base.groups, group],
    stores: [...base.stores, ...step.stores],
  };
}
