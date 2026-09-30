// Rule-pack install/uninstall — spec 082 Track B (rule builder), FR-015.
//
// FR-015 (resolved 2026-09-28, Matthew's directive: "through the spine"):
// installing a pack MUST add Behaviour records to the KeyboardIR and flow
// through the normal IR→KMN compile. Concretely:
//
//   - install = parse each behaviour's compiled rule texts into typed IR
//     rules via the codec (text→IR, the normal import direction), stamp them
//     `ownedByBehaviour: "<packId>/<behaviourId>"`, and place them in the
//     target IR. The compiled .kmn is then produced by the ordinary
//     IR→KMN emit — recompilable, removable, traceable.
//   - the legacy text-level `kmnFragment` injection path
//     (`pattern-apply/applyAssignments.ts`: slot-substitution splicing raw
//     text into the compiled .kmn, bypassing the IR) MUST NOT be used for
//     behaviour installs. This module does not import from `pattern-apply`
//     at all; that machinery stays as-is for the assign-loop mechanisms.
//
// Until 076's per-kind behaviour compilers land, install parses the
// behaviour's compiled rule texts (the pack's audited output) rather than
// compiling `parameters` — the structured parameters are the intent record;
// the rule texts are the executable content. The one structured synthesis
// install DOES perform is the guard store: when a behaviour names
// `parameters.guardStore` with a `guardedContextChars` list and the target
// IR has no identical store by that name, install synthesizes the store from
// the structured chars — under a fresh name, with the rules repointed, when
// the name is already taken by different content (also
// `ownedByBehaviour`-stamped, so uninstall removes exactly what install
// added — never a pre-existing same-named store).
//
// All functions are pure: they return a new KeyboardIR and never mutate
// the input.

import {
  validateRulePack,
  type BehaviourRecord,
  type KeyboardIR,
  type RulePack,
} from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";

/** Thrown by {@link installPack} / {@link uninstallPack} on invalid input. */
export class RulePackInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RulePackInstallError";
  }
}

/** Ownership marker value for everything one behaviour install owns. */
function ownershipOf(packId: string, behaviourId: string): string {
  return `${packId}/${behaviourId}`;
}

/** Prefix matching every node one pack install owns. */
function packPrefix(packId: string): string {
  return `${packId}/`;
}

export interface InstallPackResult {
  /** The target IR plus the installed behaviour rules (and any synthesized stores). */
  ir: KeyboardIR;
  /** Pack id that was installed. */
  packId: string;
  /** nodeIds of the installed rules, in install order. */
  installedRuleNodeIds: string[];
  /** nodeIds of stores synthesized by this install (empty when the target already had them). */
  installedStoreNodeIds: string[];
}

export interface UninstallPackResult {
  /** The IR with every node owned by the pack removed. */
  ir: KeyboardIR;
  /** Pack id that was uninstalled. */
  packId: string;
  /** nodeIds of the removed rules, in IR order. */
  removedRuleNodeIds: string[];
  /** nodeIds of the removed synthesized stores. */
  removedStoreNodeIds: string[];
}

/** Collect every nodeId in the IR so minted ids cannot collide. */
function collectNodeIds(ir: KeyboardIR): Set<string> {
  const ids = new Set<string>();
  for (const s of ir.stores) ids.add(s.nodeId);
  for (const g of ir.groups) {
    ids.add(g.nodeId);
    for (const r of g.rules) ids.add(r.nodeId);
  }
  for (const c of ir.comments) ids.add(c.nodeId);
  for (const f of ir.raw) ids.add(f.nodeId);
  return ids;
}

/**
 * Parse one behaviour's compiled rule texts into IR rules via the codec.
 *
 * The rule texts are wrapped in a minimal .kmn scaffold and parsed — the
 * same text→IR direction as any import. Scaffold `sourceLine`s are stripped:
 * they describe the throwaway scaffold, and keeping them would corrupt the
 * demo pane's fired-rule mapping (076's `// Line N` bridge) with colliding
 * line numbers.
 *
 * @throws {RulePackInstallError} when a rule text does not parse.
 */
function parseBehaviourRules(
  packId: string,
  behaviour: BehaviourRecord,
): KeyboardIR["groups"][number]["rules"] {
  // One scaffold per rule text: a single bad text then fails with its exact
  // index instead of aborting the whole behaviour opaquely. Rule counts are
  // small (tens), so the repeated parse is negligible.
  return behaviour.rules.map((text, index) => {
    const scaffold =
      `store(&VERSION) '10.0'\n` +
      `begin Unicode > use(main)\n` +
      `group(main) using keys\n` +
      text +
      `\n`;
    let parsed: KeyboardIR;
    try {
      parsed = parse(scaffold, packId).ir;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new RulePackInstallError(
        `cannot install pack "${packId}": behaviour "${behaviour.id}" rule #${index + 1} does not parse: ${detail}`,
      );
    }
    const rule = parsed.groups.find((g) => g.name === "main")?.rules[0];
    if (rule === undefined) {
      throw new RulePackInstallError(
        `cannot install pack "${packId}": behaviour "${behaviour.id}" rule #${index + 1} parsed to no rule`,
      );
    }
    // Drop the scaffold's sourceLine (destructured away: the project sets
    // exactOptionalPropertyTypes, so an explicit undefined is not assignable).
    const { sourceLine: _scaffoldLine, ...clean } = rule;
    return clean;
  });
}

/** A guard store to add, plus the name the behaviour's rules must reference. */
interface GuardStorePlan {
  /** Store to add to the IR, or null when an identical store already exists. */
  store: KeyboardIR["stores"][number] | null;
  /** Name the pack's rules use for the store (`parameters.guardStore`). */
  requestedName: string;
  /** Name the installed rules must reference — differs on a name collision. */
  resolvedName: string;
}

/** Concatenated char content of a store, or null when it holds non-char items. */
function storeCharText(store: KeyboardIR["stores"][number]): string | null {
  let text = "";
  for (const item of store.items) {
    if (item.kind !== "char") return null;
    text += item.value;
  }
  return text;
}

/**
 * Resolve a behaviour's guard store from its structured parameters. Stores
 * are matched by name against the target IR plus the stores this install has
 * already planned (two behaviours of one pack may share a guard store):
 *
 *   - no store of that name → synthesize it under the requested name;
 *   - a store of that name with the same characters in the same order →
 *     reuse it, synthesizing nothing;
 *   - a store of that name with different content → the name belongs to
 *     something else, so synthesize the pack's store under a fresh
 *     `<name>_<n>` and have the caller point the rules at it. Reusing the
 *     foreign store would silently wire the guards to the wrong characters;
 *     overwriting it would break whatever rules already read it.
 *
 * Returns null when the parameters do not describe a guard store.
 */
function planGuardStore(
  existing: readonly KeyboardIR["stores"][number][],
  packId: string,
  behaviour: BehaviourRecord,
  mintNodeId: (kind: "store") => string,
): GuardStorePlan | null {
  const name = behaviour.parameters["guardStore"];
  const chars = behaviour.parameters["guardedContextChars"];
  if (typeof name !== "string" || name === "" || !Array.isArray(chars)) return null;
  const items = chars
    .filter((c): c is string => typeof c === "string" && c !== "")
    .map((c) => ({ kind: "char" as const, value: c }));
  if (items.length === 0) return null;
  const wanted = items.map((i) => i.value).join("");

  const sameName = existing.find((s) => s.name === name);
  if (sameName !== undefined && storeCharText(sameName) === wanted) {
    return { store: null, requestedName: name, resolvedName: name };
  }
  let resolvedName = name;
  if (sameName !== undefined) {
    const taken = new Set(existing.map((s) => s.name));
    let n = 2;
    while (taken.has(`${name}_${n}`)) n += 1;
    resolvedName = `${name}_${n}`;
  }
  return {
    store: {
      nodeId: mintNodeId("store"),
      name: resolvedName,
      items,
      isSystem: false,
      ownedByBehaviour: ownershipOf(packId, behaviour.id),
      rulesStepAdded: true,
    },
    requestedName: name,
    resolvedName,
  };
}

/** Repoint every store reference in a rule from one store name to another. */
function renameStoreRefs(
  rule: KeyboardIR["groups"][number]["rules"][number],
  from: string,
  to: string,
): KeyboardIR["groups"][number]["rules"][number] {
  const swap = <E extends { kind: string }>(el: E): E =>
    "storeRef" in el && el.storeRef === from ? { ...el, storeRef: to } : el;
  return { ...rule, context: rule.context.map(swap), output: rule.output.map(swap) };
}

/**
 * Install a rule pack into a KeyboardIR (FR-015: through the spine).
 *
 * Each behaviour becomes typed IR rules stamped
 * `ownedByBehaviour: "<packId>/<behaviourId>"`, appended after the target's
 * existing bindings at the end of its `main` group (076: guards and blocks
 * sit after real bindings; a missing `main` group is created). Missing guard
 * stores described by the behaviour's structured parameters are synthesized
 * the same way. The returned IR compiles through the normal IR→KMN emit —
 * no `kmnFragment` text injection is involved at any point.
 *
 * Pure: the input IR is never mutated.
 *
 * @throws {RulePackInstallError} when the pack fails schema validation, when
 *   a behaviour's rule text does not parse, or when the pack is already
 *   installed (uninstall first, then reinstall).
 */
export function installPack(ir: KeyboardIR, pack: RulePack): InstallPackResult {
  const validated = validateRulePack(pack);
  if (!validated.ok) {
    throw new RulePackInstallError(
      `cannot install invalid rule pack: ${validated.issues.map((i) => `${i.path || "<root>"}: ${i.message}`).join("; ")}`,
    );
  }
  const validPack = validated.pack;
  if (isPackInstalled(ir, validPack.id)) {
    throw new RulePackInstallError(
      `pack "${validPack.id}" is already installed; uninstall it before reinstalling`,
    );
  }

  const taken = collectNodeIds(ir);
  let counter = 0;
  const mintNodeId = (kind: "rule" | "store" | "group"): string => {
    counter += 1;
    let candidate = `inst-${validPack.id}-${kind}${counter}`;
    while (taken.has(candidate)) {
      counter += 1;
      candidate = `inst-${validPack.id}-${kind}${counter}`;
    }
    taken.add(candidate);
    return candidate;
  };

  const installedRuleNodeIds: string[] = [];
  const installedStoreNodeIds: string[] = [];
  const newRules: KeyboardIR["groups"][number]["rules"] = [];
  const newStores: KeyboardIR["stores"] = [];

  for (const behaviour of validPack.behaviours) {
    const ownership = ownershipOf(validPack.id, behaviour.id);
    const plan = planGuardStore([...ir.stores, ...newStores], validPack.id, behaviour, (k) =>
      mintNodeId(k),
    );
    if (plan?.store) {
      newStores.push(plan.store);
      installedStoreNodeIds.push(plan.store.nodeId);
    }
    for (const parsed of parseBehaviourRules(validPack.id, behaviour)) {
      const rule =
        plan !== null && plan.resolvedName !== plan.requestedName
          ? renameStoreRefs(parsed, plan.requestedName, plan.resolvedName)
          : parsed;
      const nodeId = mintNodeId("rule");
      newRules.push({ ...rule, nodeId, ownedByBehaviour: ownership, rulesStepAdded: true });
      installedRuleNodeIds.push(nodeId);
    }
  }

  // Target the entry group — the first writable using-keys group, the same
  // convention as pattern-apply's entryGroupOf (inlined: this module stays
  // independent of pattern-apply, see the header). A readonly group is never
  // written into, and a fresh `main` is minted only when the IR has no
  // using-keys group and no group of that name at all: minting beside a
  // readonly `main` would emit two `group(main)` blocks, which kmcmplib
  // rejects as a duplicate group.
  const groups = ir.groups.map((g) => ({ ...g, rules: [...g.rules] }));
  let target = groups.find((g) => g.usingKeys && !g.readonly);
  if (target === undefined) {
    if (groups.some((g) => g.usingKeys)) {
      throw new RulePackInstallError(
        `cannot install pack "${validPack.id}": the keyboard's key-handling group is read-only`,
      );
    }
    if (groups.some((g) => g.name === "main")) {
      throw new RulePackInstallError(
        `cannot install pack "${validPack.id}": a group named "main" already exists and is not the key-handling group`,
      );
    }
    target = {
      nodeId: mintNodeId("group"),
      name: "main",
      usingKeys: true,
      rules: [],
      readonly: false,
    };
    groups.push(target);
  }
  // Insert as one contiguous block before the group's match/nomatch rules:
  // kmcmplib requires those to be last in a group.
  const terminal = target.rules.findIndex(
    (r) => r.matchKind === "match" || r.matchKind === "nomatch",
  );
  target.rules.splice(terminal === -1 ? target.rules.length : terminal, 0, ...newRules);

  return {
    ir: { ...ir, stores: [...ir.stores, ...newStores], groups },
    packId: validPack.id,
    installedRuleNodeIds,
    installedStoreNodeIds,
  };
}

/** True when any rule or store in the IR is owned by the pack. */
export function isPackInstalled(ir: KeyboardIR, packId: string): boolean {
  const prefix = packPrefix(packId);
  return (
    ir.groups.some((g) => g.rules.some((r) => r.ownedByBehaviour?.startsWith(prefix) === true)) ||
    ir.stores.some((s) => s.ownedByBehaviour?.startsWith(prefix) === true)
  );
}

/**
 * Uninstall a rule pack from a KeyboardIR.
 *
 * Removes exactly the rules and synthesized stores stamped
 * `ownedByBehaviour: "<packId>/..."` by {@link installPack} — a
 * pre-existing same-named store (one install did not synthesize) carries no
 * stamp and is never touched. Pure: the input IR is never mutated.
 */
export function uninstallPack(ir: KeyboardIR, packId: string): UninstallPackResult {
  const prefix = packPrefix(packId);
  const removedRuleNodeIds: string[] = [];
  const groups = ir.groups.map((g) => {
    const kept = g.rules.filter((r) => {
      const owned = r.ownedByBehaviour?.startsWith(prefix) === true;
      if (owned) removedRuleNodeIds.push(r.nodeId);
      return !owned;
    });
    return kept.length === g.rules.length ? g : { ...g, rules: kept };
  });
  const removedStoreNodeIds: string[] = [];
  const stores = ir.stores.filter((s) => {
    const owned = s.ownedByBehaviour?.startsWith(prefix) === true;
    if (owned) removedStoreNodeIds.push(s.nodeId);
    return !owned;
  });
  return { ir: { ...ir, groups, stores }, packId, removedRuleNodeIds, removedStoreNodeIds };
}
