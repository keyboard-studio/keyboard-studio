import type { IRComment, IRGroup, IRRule, KeyboardIR, NormalizationStep } from "@keyboard-studio/contracts";
import { emitRule } from "../../codec/emit.js";
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

/** `nodeId` of a step group built over an implicit (absent) `entryPoints.main`. */
const IMPLICIT_ENTRY_GROUP_ID = `${NORMALIZATION_STORE_PREFIX}group_implicit_entry`;

/** The `use(X)` target of the group's closing rule when there is no `nomatch` rule. */
function lastUseTarget(group: IRGroup): string | undefined {
  for (let i = group.rules.length - 1; i >= 0; i--) {
    const t = groupNamedByUse(group.rules[i]!.output);
    if (t !== undefined) return t;
  }
  return undefined;
}

/** Names of the generated stores a rule list references (by emitted text). */
function generatedStoresReferenced(group: IRGroup): Set<string> {
  const names = new Set<string>();
  const re = new RegExp(`${NORMALIZATION_STORE_PREFIX}\\w+`, "g");
  for (const r of group.rules) for (const m of emitRule(r, group.usingKeys).match(re) ?? []) names.add(m);
  return names;
}

/**
 * Remove a previously applied step: restores `entryPoints.main` and deletes the
 * group, its comments and the stores its rules reference. Structural inverse of
 * `applyNormalizationStep`: an implicit entry stays implicit, and `entryPoints`
 * is dropped again if the step created it.
 *
 * The entry comes from the group's `nomatch > use(X)` target, else its last
 * `use(X)`, else `originalEntry` (the recorded one), else the implicit entry.
 * `main` is never left pointing at the deleted group.
 *
 * Returns `ir` itself when no step is present.
 */
export function removeNormalizationStep(ir: KeyboardIR, originalEntry?: string): KeyboardIR {
  const group = ir.groups.find((g) => g.name === NORMALIZATION_GROUP);
  if (group === undefined) return ir;
  const nomatch = group.rules.find((r) => r.matchKind === "nomatch");
  const groups = ir.groups.filter((g) => g !== group);
  const implicit = groups.find((g) => !g.readonly)?.name ?? "main";
  const target = (nomatch === undefined ? undefined : groupNamedByUse(nomatch.output)) ?? lastUseTarget(group) ?? originalEntry;

  const entryPoints = { ...ir.header.entryPoints };
  // `apply` tags the group when it replaced an implicit entry, so only then is
  // the entry dropped again; an explicit `main` stays explicit.
  const wasImplicit = group.nodeId === IMPLICIT_ENTRY_GROUP_ID;
  if (target === undefined || target === NORMALIZATION_GROUP || (wasImplicit && target === implicit)) {
    delete entryPoints.main;
  } else {
    entryPoints.main = target;
  }
  const { entryPoints: _drop, ...headerRest } = ir.header;
  const header = Object.keys(entryPoints).length > 0 ? { ...headerRest, entryPoints } : headerRest;

  const generated = generatedStoresReferenced(group);
  const ruleIds = new Set(group.rules.map((r) => r.nodeId));
  const storeIds = new Set(ir.stores.filter((s) => generated.has(s.name)).map((s) => s.nodeId));
  return {
    ...ir,
    header,
    groups,
    stores: ir.stores.filter((s) => !generated.has(s.name)),
    comments: ir.comments.filter(
      (c) =>
        !c.nodeId.startsWith(NORMALIZATION_STORE_PREFIX) &&
        !(c.anchorRef?.kind === "rule" && ruleIds.has(c.anchorRef.nodeId)) &&
        !(c.anchorRef?.kind === "store" && storeIds.has(c.anchorRef.nodeId)),
    ),
  };
}

/** Short per-shape comment for one generated rule. */
function ruleShapeComment(r: IRRule): string {
  const first = r.context[0];
  if (r.context.every((e) => e.kind === "char")) return "literal alternate -> form the keyboard produces";
  if (first?.kind === "any") return "store-indexed rewrite: any(heads) [+ tail] -> matching produced form";
  return "literal head + any(tails) -> store-indexed produced form";
}

const HEADER_COMMENTS = [
  `GENERATED group ${NORMALIZATION_GROUP}: do not edit.`,
  "Regenerate it with Keyboard Studio (context normalization step); manual edits are overwritten.",
  "It rewrites pasted NFC/NFD alternates in the context, then hands on to the original entry group.",
];

/**
 * Append the step as a non-keys group and redirect `entryPoints.main` to it.
 * Always removes an existing step first, so applying twice yields one group.
 * The group is preceded by a generated/do-not-edit header comment, and each
 * rule by a short shape comment. Returns a new IR; the input is never mutated.
 */
export function applyNormalizationStep(ir: KeyboardIR, step: NormalizationStep): KeyboardIR {
  const base = removeNormalizationStep(ir, step.originalEntry);
  const group: IRGroup = {
    nodeId: ir.header.entryPoints?.main === undefined ? IMPLICIT_ENTRY_GROUP_ID : `${NORMALIZATION_STORE_PREFIX}group`,
    name: NORMALIZATION_GROUP,
    usingKeys: false,
    rules: step.rules,
    readonly: false,
  };
  // The emitter writes only leading comments anchored on a rule or store, so
  // the header rides on the first generated store (declared first in the group).
  const comments: IRComment[] = [];
  const lead = step.stores[0]?.nodeId ?? step.rules[0]?.nodeId;
  const leadKind = step.stores[0] !== undefined ? "store" : "rule";
  if (lead !== undefined) {
    HEADER_COMMENTS.forEach((text, i) =>
      comments.push({
        nodeId: `${NORMALIZATION_STORE_PREFIX}comment_header_${i}`,
        text,
        anchor: "leading",
        anchorRef: { kind: leadKind, nodeId: lead },
      }),
    );
  }
  // The closing match/nomatch rules take no comment: the parser does not anchor
  // a comment ahead of them to the rule, so it would not survive a round trip.
  step.rules.forEach((r, i) => {
    if (r.matchKind !== undefined) return;
    comments.push({
      nodeId: `${NORMALIZATION_STORE_PREFIX}comment_rule_${i}`,
      text: ruleShapeComment(r),
      anchor: "leading",
      anchorRef: { kind: "rule", nodeId: r.nodeId },
    });
  });
  return {
    ...base,
    header: { ...base.header, entryPoints: { ...base.header.entryPoints, main: NORMALIZATION_GROUP } },
    groups: [...base.groups, group],
    stores: [...base.stores, ...step.stores],
    comments: [...base.comments, ...comments],
  };
}
