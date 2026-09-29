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
// IR has no store by that name, install synthesizes the store from the
// structured chars (also `ownedByBehaviour`-stamped, so uninstall removes
// exactly what install added — never a pre-existing same-named store).
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

/**
 * Synthesize a guard store from a behaviour's structured parameters when the
 * target IR lacks it. Returns null when the store already exists (install
 * must never shadow or duplicate a pre-existing store) or when the
 * parameters do not describe one.
 */
function synthesizeGuardStore(
  ir: KeyboardIR,
  packId: string,
  behaviour: BehaviourRecord,
  mintNodeId: (kind: "store") => string,
): KeyboardIR["stores"][number] | null {
  const name = behaviour.parameters["guardStore"];
  const chars = behaviour.parameters["guardedContextChars"];
  if (typeof name !== "string" || name === "" || !Array.isArray(chars)) return null;
  if (ir.stores.some((s) => s.name === name)) return null;
  const items = chars
    .filter((c): c is string => typeof c === "string" && c !== "")
    .map((c) => ({ kind: "char" as const, value: c }));
  if (items.length === 0) return null;
  return {
    nodeId: mintNodeId("store"),
    name,
    items,
    isSystem: false,
    ownedByBehaviour: ownershipOf(packId, behaviour.id),
    rulesStepAdded: true,
  };
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
    const store = synthesizeGuardStore(ir, validPack.id, behaviour, (k) =>
      mintNodeId(k),
    );
    if (store !== null) {
      newStores.push(store);
      installedStoreNodeIds.push(store.nodeId);
    }
    for (const rule of parseBehaviourRules(validPack.id, behaviour)) {
      const nodeId = mintNodeId("rule");
      newRules.push({ ...rule, nodeId, ownedByBehaviour: ownership, rulesStepAdded: true });
      installedRuleNodeIds.push(nodeId);
    }
  }

  const groups = ir.groups.map((g) => ({ ...g, rules: [...g.rules] }));
  let main = groups.find((g) => g.name === "main" && !g.readonly);
  if (main === undefined) {
    main = {
      nodeId: mintNodeId("group"),
      name: "main",
      usingKeys: true,
      rules: [],
      readonly: false,
    };
    groups.push(main);
  }
  main.rules.push(...newRules);

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
