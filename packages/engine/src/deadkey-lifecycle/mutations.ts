/**
 * deadkey-lifecycle — IR-to-IR lifecycle mutations for spec 083 (issue #1849),
 * Phase 2: `defineDeadkey`, `renameDeadkey`, `deleteDeadkey`, `retargetDeadkey`.
 *
 * COPY-VS-MUTATE CONVENTION (documents the codebase choice):
 * every mutation deep-clones the input IR with `structuredClone` and applies
 * all rewrites to the clone — the facet-transform migration convention
 * (`packages/engine/src/facet-transform/migrations/`). The caller's IR is
 * never mutated. Conflict checks run BEFORE the clone is made, so an
 * `ok: false` result performs no allocation at all and leaves the input
 * untouched. Success is atomic by construction: either every rewrite lands
 * in the returned clone or the input is returned unchanged with conflicts.
 *
 * EXPLICIT-OVER-SILENT: expected collisions (occupied id, occupied trigger,
 * external referrers, pre-FR-004 named ids) are returned as
 * {@link DeadkeyConflict} lists — never thrown, never silently resolved.
 * Truly unexpected states (renaming/deleting/retargeting an id that does not
 * exist) throw: those are programmer errors, not author choices.
 *
 * NUMERIC IDS ONLY: nothing here writes `dk(name)` into rules. A non-numeric
 * rename target is refused as `"named-id-unavailable"` until 076 FR-004
 * closes the codec. Author-chosen names travel as the `@deadkey:<hexid>
 * name=<name>` trailing-comment token (Phase 1 carrier); id and trigger stay
 * decoupled — define/rename/retarget never derive one from the other.
 *
 * VALIDATOR SANITY: the §10 `validateDeadkeyLifecycle` guards are exercised
 * in `deadkey-lifecycle.test.ts` after every mutation (the prod path does
 * not re-run the validator — the conflict pre-checks already guarantee the
 * invariants, and double-scanning every mutation would just be ceremony).
 *
 * @see specs/083-deadkey-lifecycle/spec.md
 * @see specs/083-deadkey-lifecycle/plan.md (Phase 2)
 */

import {
  allocateDeadkeyId,
  getDeadkeyName,
  isPlusSeparator,
  listDeadkeys,
  scanDeadkeyRefs,
  setDeadkeyName,
} from "@keyboard-studio/contracts";
import type {
  DeadkeyInfo,
  IRGroup,
  IRRule,
  IRStore,
  KeyboardIR,
} from "@keyboard-studio/contracts";
import { entryGroupOf, insertBlockBeforeTerminalRules } from "../pattern-apply/ir-insert.js";
import {
  describeRule,
  findContextRules,
  findEntityContextRules,
  findFanoutRules,
  findOutputRules,
  findTriggerRules,
  storeRefsOfRule,
} from "./cluster.js";
import type { DeadkeyConflict, DeadkeyMutationResult } from "./types.js";
import type {
  DefineDeadkeyOptions,
  DeleteDeadkeyOptions,
  RenameDeadkeyOptions,
  RetargetDeadkeyOptions,
} from "./types.js";

function hex4(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/** Numeric ids minted anywhere in the IR (contexts, outputs, store items). */
function usedIds(ir: KeyboardIR): Set<number> {
  return new Set(scanDeadkeyRefs(ir).map((r) => r.id));
}

/**
 * The deadkey (if any) whose trigger key is `triggerKey`, excluding `id`.
 * Named/opaque deadkeys (id null) occupy triggers too — they surface with
 * `ids` absent and `names` set.
 */
function triggerOccupant(
  ir: KeyboardIR,
  triggerKey: string,
  exceptId: number,
): DeadkeyInfo | undefined {
  return listDeadkeys(ir).find(
    (d) => d.triggerKey === triggerKey && d.id !== exceptId,
  );
}

function triggerInUseConflict(
  triggerKey: string,
  occupant: DeadkeyInfo,
  action: string,
): DeadkeyConflict {
  const occupantRef =
    occupant.id !== null
      ? `dk(${hex4(occupant.id)})`
      : `dk(${occupant.name ?? "?"})`;
  return {
    kind: "trigger-in-use",
    message:
      `Cannot ${action}: trigger key ${triggerKey} already triggers ` +
      `${occupantRef}. The author must choose: merge into it, move it, or pick another key.`,
    keys: [triggerKey],
    ...(occupant.id !== null ? { ids: [occupant.id] } : {}),
    ...(occupant.name !== undefined ? { names: [occupant.name] } : {}),
  };
}

/** First writable using-keys group, creating `group(main)` when none exists. */
function ensureEntryGroup(ir: KeyboardIR): IRGroup {
  const existing = entryGroupOf(ir.groups);
  if (existing !== undefined) return existing;
  const group: IRGroup = {
    nodeId: "group:main",
    name: "main",
    usingKeys: true,
    rules: [],
    readonly: false,
  };
  ir.groups.push(group);
  return group;
}

// ---------------------------------------------------------------------------
// defineDeadkey
// ---------------------------------------------------------------------------

/**
 * Define a new deadkey on any trigger key.
 *
 * Emits the canonical cluster the `deadkey-single-tap` pattern emits —
 * trigger rule `+ [triggerKey] > dk(id)`, fan-out rule
 * `dk(id) + any(dk_<hex>_bases) > index(dk_<hex>_output, 2)`, escape rule
 * `dk(id) + [triggerKey] > 'accentChar'` (in that order, matching the
 * pattern's fragment), plus the two empty lookup stores
 * `dk_<hex>_bases` / `dk_<hex>_output` (pairs are added later via the
 * existing slot-assignment path). The trigger rule always carries the
 * `@deadkey:<hexid>` authorship marker (plus `name=<authorName>` when
 * supplied), so the new deadkey lists with origin `"studio"`.
 *
 * Conflicts (checked before any work): requested `id` already minted →
 * `"id-in-use"`; `triggerKey` already triggers a different deadkey →
 * `"trigger-in-use"`; the new deadkey's conventional store names already
 * exist (orphaned `dk_<hex>_*` stores from a hand-edited or imported IR) →
 * `"store-in-use"` (emitting duplicate `store()` definitions would break
 * compilation, so the author must clear them first). The id is never derived
 * from the trigger key (id/trigger decoupling — the old codepoint-coupled
 * scheme is grandfathered, never re-minted: `allocateDeadkeyId` starts
 * studio ids above 0x2FFF).
 */
export function defineDeadkey(
  ir: KeyboardIR,
  options: DefineDeadkeyOptions,
): DeadkeyMutationResult {
  const { triggerKey, authorName, accentChar } = options;
  if (accentChar.length === 0) {
    throw new Error("defineDeadkey: accentChar must be a non-empty string");
  }
  const id = options.id ?? allocateDeadkeyId(ir);

  const conflicts: DeadkeyConflict[] = [];
  if (usedIds(ir).has(id)) {
    conflicts.push({
      kind: "id-in-use",
      message:
        `Cannot define: dk(${hex4(id)}) is already minted by another deadkey. ` +
        `The author must choose: rename mine, merge, replace, or cancel.`,
      ids: [id],
    });
  }
  const occupant = triggerOccupant(ir, triggerKey, id);
  if (occupant !== undefined) {
    conflicts.push(triggerInUseConflict(triggerKey, occupant, "define"));
  }
  // Guard the class renameDeadkey already guards: a pre-existing orphaned
  // store with the same conventional name is invisible to allocateDeadkeyId
  // and passes the id-in-use check, but pushing a second store() definition
  // with that name breaks compilation. Explicit conflict, never a silent
  // duplicate write.
  const hex = hex4(id);
  const baseStoreName = `dk_${hex}_bases`;
  const outputStoreName = `dk_${hex}_output`;
  const liveStoreNames = new Set(ir.stores.map((s) => s.name));
  const clobbered = [baseStoreName, outputStoreName].filter((n) =>
    liveStoreNames.has(n),
  );
  if (clobbered.length > 0) {
    const plural = clobbered.length > 1;
    conflicts.push({
      kind: "store-in-use",
      message:
        `Cannot define dk(${hex}): store${plural ? "s" : ""} ` +
        `${clobbered.map((n) => `"${n}"`).join(" and ")} already exist${plural ? "" : "s"}. ` +
        `Remove or rename the unrelated store${plural ? "s" : ""} first.`,
      ids: [id],
    });
  }
  if (conflicts.length > 0) {
    return { ok: false, conflicts };
  }

  const next = structuredClone(ir);

  const baseStore: IRStore = {
    nodeId: `store:${baseStoreName}`,
    name: baseStoreName,
    items: [],
    isSystem: false,
  };
  const outputStore: IRStore = {
    nodeId: `store:${outputStoreName}`,
    name: outputStoreName,
    items: [],
    isSystem: false,
  };
  next.stores.push(baseStore, outputStore);

  const triggerRule: IRRule = {
    nodeId: `dk-${hex}-trigger`,
    context: [{ kind: "vkey", name: triggerKey, modifiers: [] }],
    output: [{ kind: "deadkey", id }],
  };
  // Authorship marker — always written, even unnamed (origin "studio").
  // Throws on a malformed authorName: loud here, not corrupt in the .kmn.
  setDeadkeyName(triggerRule, authorName);

  // Cluster order matches the deadkey-single-tap fragment: fan-out, escape,
  // trigger. The emitter renders the inline `+` separators; the leading `+`
  // on the trigger rule is derived by the emitter (no separator element).
  const fanoutRule: IRRule = {
    nodeId: `dk-${hex}-fanout`,
    context: [
      { kind: "deadkey", id },
      { kind: "raw", text: "+" },
      { kind: "any", storeRef: baseStoreName },
    ],
    output: [{ kind: "index", storeRef: outputStoreName, offset: 2 }],
  };
  const escapeRule: IRRule = {
    nodeId: `dk-${hex}-escape`,
    context: [
      { kind: "deadkey", id },
      { kind: "raw", text: "+" },
      { kind: "vkey", name: triggerKey, modifiers: [] },
    ],
    output: [{ kind: "char", value: accentChar }],
  };

  const group = ensureEntryGroup(next);
  group.rules = insertBlockBeforeTerminalRules(group.rules, [
    fanoutRule,
    escapeRule,
    triggerRule,
  ]);

  const deadkey = listDeadkeys(next).find((d) => d.id === id);
  if (deadkey === undefined) {
    // Cannot happen: the cluster was just built above. Guard against
    // future cluster-shape drift failing silently.
    throw new Error(
      `defineDeadkey: internal error — emitted cluster for dk(${hex}) not recognized by listDeadkeys`,
    );
  }
  return { ok: true, ir: next, deadkey };
}

// ---------------------------------------------------------------------------
// renameDeadkey
// ---------------------------------------------------------------------------

/**
 * Rename a deadkey's id, atomically.
 *
 * Rewrites, in one mutation: every trigger rule's output `dk(from)`→`dk(to)`;
 * EVERY rule context containing `dk(from)`→`dk(to)` (fan-out, escape, and
 * any non-canonical referrers — rename repoints rather than removes, so no
 * referrer can dangle); `{kind:"deadkey"}` store items (same reason — the
 * validator flags them dangling otherwise); the fan-out stores' names when
 * the names embed the old id hex (`dk_<hexFrom>_*` → `dk_<hexTo>_*`, with the
 * fan-out rules' storeRefs updated to match); and the name-token hex on the
 * trigger rule (the `name=` attribute is preserved — only the hex changes).
 *
 * Stores whose names do NOT embed the old hex (imported keyboards' `acuteK`
 * / `acuteO`, …) are found via the fan-out rules' `any`/`index` storeRefs —
 * never by name pattern — and are left named as they are: their names carry
 * no id to update.
 *
 * Conflicts: non-numeric `to` → `"named-id-unavailable"` (076 FR-004 hasn't
 * landed; `dk(name)` cannot round-trip); `to` already minted →
 * `"id-in-use"`; renaming onto a target whose conventional store names would
 * clobber an unrelated existing store → `"store-in-use"` (pathological;
 * reachable only with pre-existing orphaned `dk_<hex>_*` stores).
 * Renaming an id onto itself is an idempotent no-op.
 */
export function renameDeadkey(
  ir: KeyboardIR,
  options: RenameDeadkeyOptions,
): DeadkeyMutationResult {
  const { from, to } = options;
  const hexFrom = hex4(from);

  const existing = listDeadkeys(ir).find((d) => d.id === from);
  if (existing === undefined) {
    throw new Error(
      `renameDeadkey: no deadkey with id ${hexFrom} in this IR — list it with listDeadkeys first`,
    );
  }
  if (!Number.isInteger(to)) {
    return {
      ok: false,
      conflicts: [
        {
          kind: "named-id-unavailable",
          message:
            `Cannot rename dk(${hexFrom}) to a non-numeric id: the codec cannot ` +
            `round-trip dk(name) until 076 FR-004 (named-deadkey codec closure) lands. ` +
            `Record the name as metadata instead — it migrates mechanically later.`,
          ids: [from],
        },
      ],
    };
  }
  if (to === from) {
    return { ok: true, ir: structuredClone(ir), deadkey: existing };
  }
  if (usedIds(ir).has(to)) {
    return {
      ok: false,
      conflicts: [
        {
          kind: "id-in-use",
          message:
            `Cannot rename dk(${hexFrom}) to dk(${hex4(to)}): that id is already ` +
            `minted. The author must choose: rename mine, merge, replace, or cancel.`,
          ids: [from, to],
        },
      ],
    };
  }

  // Plan the store renames before cloning: only stores whose names embed the
  // old id hex are renamed (dk_<hexFrom>_* → dk_<hexTo>_*, case-insensitive —
  // DEADKEY_STORE_RE is case-insensitive too). Imported/custom names carry no
  // id and stay untouched.
  const hexTo = hex4(to);
  const storeRenames = new Map<string, string>();
  for (const fanout of findFanoutRules(ir, from)) {
    for (const name of [fanout.baseStore, fanout.outputStore]) {
      if (storeRenames.has(name)) continue;
      if (name.toLowerCase().includes(hexFrom.toLowerCase())) {
        storeRenames.set(
          name,
          name.replace(new RegExp(hexFrom, "gi"), hexTo),
        );
      }
    }
  }
  const liveStoreNames = new Set(ir.stores.map((s) => s.name));
  for (const [oldName, newName] of storeRenames) {
    if (
      newName !== oldName &&
      liveStoreNames.has(newName) &&
      !storeRenames.has(newName)
    ) {
      return {
        ok: false,
        conflicts: [
          {
            kind: "store-in-use",
            message:
              `Cannot rename dk(${hexFrom}) to dk(${hexTo}): fan-out store ` +
              `"${oldName}" would become "${newName}", which already exists. ` +
              `Remove or rename the unrelated store first.`,
            ids: [from, to],
          },
        ],
      };
    }
  }

  const next = structuredClone(ir);

  // 1. Trigger rules: rewrite outputs, then fix the name-token hex. The name
  // is read BEFORE the output rewrite — getDeadkeyName validates the token
  // hex against the rule's current id, so reading after would lose it.
  for (const { rule } of findTriggerRules(next, from)) {
    const hadToken =
      rule.trailingComment !== undefined &&
      /@deadkey:[0-9A-Fa-f]+/.test(rule.trailingComment);
    const name = getDeadkeyName(rule);
    for (const el of rule.output) {
      if (el.kind === "deadkey" && el.id === from) el.id = to;
    }
    // Only touch the token when one exists: renaming an imported (unmarked)
    // deadkey must not newly author it as studio-made.
    if (hadToken) setDeadkeyName(rule, name);
  }

  // 2. Every rule context and every store item referencing the old id.
  for (const group of next.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "deadkey" && el.id === from) el.id = to;
      }
    }
  }
  for (const store of next.stores) {
    for (const item of store.items) {
      if (item.kind === "deadkey" && item.id === from) item.id = to;
    }
  }

  // 3. Store renames + fan-out storeRef updates.
  for (const store of next.stores) {
    const newName = storeRenames.get(store.name);
    if (newName !== undefined && newName !== store.name) {
      store.name = newName;
    }
  }
  for (const fanout of findFanoutRules(next, to)) {
    for (const el of fanout.rule.context) {
      if (el.kind === "any" || el.kind === "notany" || el.kind === "index") {
        const newName = storeRenames.get(el.storeRef);
        if (newName !== undefined) el.storeRef = newName;
      }
    }
    for (const el of fanout.rule.output) {
      if (el.kind === "index" || el.kind === "outs") {
        const newName = storeRenames.get(el.storeRef);
        if (newName !== undefined) el.storeRef = newName;
      }
    }
  }

  const deadkey = listDeadkeys(next).find((d) => d.id === to);
  if (deadkey === undefined) {
    throw new Error(
      `renameDeadkey: internal error — renamed cluster for dk(${hexTo}) not recognized by listDeadkeys`,
    );
  }
  return { ok: true, ir: next, deadkey };
}

// ---------------------------------------------------------------------------
// deleteDeadkey
// ---------------------------------------------------------------------------

/**
 * Delete a deadkey as a whole entity.
 *
 * The entity is the canonical cluster: trigger rules (output exactly
 * `[dk(id)]`), fan-out rules (`dk(id) + any > index`), escape rules
 * (`dk(id) + [key] > char`), the stores those rules reference via
 * `any`/`index`/`outs` storeRefs, plus any `dk_<hex>_bases` /
 * `dk_<hex>_output` stores (which the validator would otherwise flag as
 * orphaned). A store shared with a surviving rule is never removed — but a
 * surviving rule referencing the entity's stores (or the id) is itself a
 * referrer and blocks the delete first.
 *
 * Precondition — refused with `"referenced"` when anything OUTSIDE the
 * canonical entity still touches the id: a rule with `dk(id)` in context or
 * output that is not trigger/fan-out/escape-shaped, a `{kind:"deadkey"}`
 * store item, or a surviving rule referencing one of the entity's stores by
 * name. The conflict lists every referrer; the studio offers repoint or
 * cancel. Never a half-deleted deadkey.
 */
export function deleteDeadkey(
  ir: KeyboardIR,
  options: DeleteDeadkeyOptions,
): DeadkeyMutationResult {
  const { id } = options;
  const hex = hex4(id);

  const info = listDeadkeys(ir).find((d) => d.id === id);
  if (info === undefined) {
    throw new Error(
      `deleteDeadkey: no deadkey with id ${hex} in this IR — list it with listDeadkeys first`,
    );
  }

  const triggerRules = findTriggerRules(ir, id);
  const entityContextRules = findEntityContextRules(ir, id);
  const entityRules = [...triggerRules, ...entityContextRules];
  // Object identity is valid on the input IR only — the clone gets fresh
  // objects, so the removal step below matches by nodeId instead.
  const entityRuleSet = new Set(entityRules.map((l) => l.rule));
  const entityRuleIds = new Set(entityRules.map((l) => l.rule.nodeId));

  // Entity stores: referenced by entity rules' storeRefs, plus the
  // conventional dk_<hex>_{bases,output} names (orphan-flagged otherwise).
  const entityStoreNames = new Set<string>([
    `dk_${hex}_bases`,
    `dk_${hex}_output`,
  ]);
  for (const { rule } of entityRules) {
    for (const name of storeRefsOfRule(rule)) entityStoreNames.add(name);
  }

  const referrers: string[] = [];
  for (const { group, rule } of findOutputRules(ir, id)) {
    if (!entityRuleSet.has(rule)) {
      referrers.push(describeRule(group, rule, id));
    }
  }
  for (const { group, rule } of findContextRules(ir, id)) {
    if (!entityRuleSet.has(rule)) {
      referrers.push(describeRule(group, rule, id));
    }
  }
  for (const store of ir.stores) {
    if (store.items.some((it) => it.kind === "deadkey" && it.id === id)) {
      referrers.push(`store "${store.name}" — dk(${hex}) in store item`);
    }
  }
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (entityRuleSet.has(rule)) continue;
      for (const name of storeRefsOfRule(rule)) {
        if (entityStoreNames.has(name)) {
          referrers.push(
            `group "${group.name}" rule "${rule.nodeId}" — references entity store "${name}"`,
          );
        }
      }
    }
  }
  if (referrers.length > 0) {
    return {
      ok: false,
      conflicts: [
        {
          kind: "referenced",
          message:
            `Cannot delete dk(${hex}): ${referrers.length} ` +
            `reference(s) outside the deadkey's own rules still touch it. ` +
            `Repoint or remove them first — never a half-deleted deadkey.`,
          ids: [id],
          referrers,
        },
      ],
    };
  }

  const next = structuredClone(ir);
  for (const group of next.groups) {
    group.rules = group.rules.filter((rule) => !entityRuleIds.has(rule.nodeId));
  }
  // Every entity store is unreferenced now (referrers were refused above), so
  // removing by name cannot strand a surviving rule.
  const doomed = new Set(
    next.stores.filter((s) => entityStoreNames.has(s.name)).map((s) => s.name),
  );
  next.stores = next.stores.filter((s) => !doomed.has(s.name));

  return { ok: true, ir: next, deadkey: info };
}

// ---------------------------------------------------------------------------
// retargetDeadkey
// ---------------------------------------------------------------------------

/**
 * Move a deadkey to a different trigger key.
 *
 * Rewrites ONLY the trigger rule's context element → the new vkey (plain,
 * no modifiers — retarget always writes a vkey context, even when the old
 * trigger was a char literal). Id, stores, pairs, and the name token are
 * untouched (id/trigger decoupling — the move never re-identifies the
 * deadkey).
 *
 * Deliberately NOT rewritten: the escape rule (`dk(id) + [oldTrigger] >
 * 'accent'`). It is a separately authorable rule, not part of the trigger;
 * the studio may offer to move it, but the engine does not presume.
 *
 * Conflict: `newTriggerKey` already triggers a different deadkey →
 * `"trigger-in-use"` (merge / reassign / cancel is the studio's choice).
 */
export function retargetDeadkey(
  ir: KeyboardIR,
  options: RetargetDeadkeyOptions,
): DeadkeyMutationResult {
  const { id, newTriggerKey } = options;
  const hex = hex4(id);

  const triggers = findTriggerRules(ir, id);
  if (triggers.length === 0) {
    throw new Error(
      `retargetDeadkey: no trigger rule for dk(${hex}) in this IR — list it with listDeadkeys first`,
    );
  }
  const occupant = triggerOccupant(ir, newTriggerKey, id);
  if (occupant !== undefined) {
    return {
      ok: false,
      conflicts: [triggerInUseConflict(newTriggerKey, occupant, "retarget")],
    };
  }

  const next = structuredClone(ir);
  for (const { rule } of findTriggerRules(next, id)) {
    const idx = rule.context.findIndex((el) => !isPlusSeparator(el));
    if (idx === -1) {
      // Cannot happen: matchTriggerRule required exactly one such element.
      throw new Error(
        `retargetDeadkey: internal error — trigger rule lost its context element`,
      );
    }
    rule.context[idx] = { kind: "vkey", name: newTriggerKey, modifiers: [] };
  }

  const deadkey = listDeadkeys(next).find((d) => d.id === id);
  if (deadkey === undefined) {
    throw new Error(
      `retargetDeadkey: internal error — retargeted cluster for dk(${hex}) not recognized by listDeadkeys`,
    );
  }
  return { ok: true, ir: next, deadkey };
}
