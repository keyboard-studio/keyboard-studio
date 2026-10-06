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

/** Store names a rule references, lowercased (KMN store names are case-insensitive). */
function storeRefsOf(rules: readonly IRRule[]): Set<string> {
  const refs = new Set<string>();
  for (const r of rules) {
    for (const el of [...r.context, ...r.output]) {
      if ("storeRef" in el) refs.add(el.storeRef.toLowerCase());
    }
  }
  return refs;
}

/**
 * The generated step group, if `ir` holds one: the reserved name, a non-keys
 * group, and a `nomatch > use(X)` that delegates to another existing group.
 * A user group that merely shares the name does not qualify.
 */
export function generatedStepGroupOf(ir: KeyboardIR): IRGroup | undefined {
  const group = ir.groups.find((g) => g.name === NORMALIZATION_GROUP);
  if (group === undefined || group.usingKeys) return undefined;
  const nomatch = group.rules.find((r) => r.matchKind === "nomatch");
  const target = nomatch === undefined ? undefined : groupNamedByUse(nomatch.output);
  if (target === undefined || target === NORMALIZATION_GROUP) return undefined;
  return ir.groups.some((g) => g.name === target) ? group : undefined;
}

/**
 * The stores the step owns: prefixed stores its rules reference that no other
 * group references. A user store that merely shares the prefix is kept.
 */
function ownedStoreNames(ir: KeyboardIR, group: IRGroup): Set<string> {
  const elsewhere = storeRefsOf(ir.groups.filter((g) => g !== group).flatMap((g) => g.rules));
  const owned = new Set<string>();
  for (const name of storeRefsOf(group.rules)) {
    if (name.startsWith(NORMALIZATION_STORE_PREFIX) && !elsewhere.has(name)) owned.add(name);
  }
  return owned;
}

/**
 * Remove a previously applied step: restores `entryPoints.main` from the
 * group's `nomatch > use(X)` target and deletes the group and the stores it
 * owns. Returns `ir` itself when no generated step is present.
 */
export function removeNormalizationStep(ir: KeyboardIR): KeyboardIR {
  const group = generatedStepGroupOf(ir);
  if (group === undefined) return ir;
  const nomatch = group.rules.find((r) => r.matchKind === "nomatch");
  const entryPoints = { ...ir.header.entryPoints };
  const target = nomatch === undefined ? undefined : groupNamedByUse(nomatch.output);
  if (target !== undefined) entryPoints.main = target;
  const owned = ownedStoreNames(ir, group);
  return {
    ...ir,
    header: { ...ir.header, entryPoints },
    groups: ir.groups.filter((g) => g !== group),
    stores: ir.stores.filter((s) => !owned.has(s.name.toLowerCase())),
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
