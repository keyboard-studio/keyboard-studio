// deadkeyWrite — studio-side write helpers for the spec-083 deadkey
// lifecycle editors.
//
// Two write shapes, one seam:
//
// 1. Engine mutations (defineDeadkey / renameDeadkey / retargetDeadkey /
//    deleteDeadkey): the engine returns a full replacement IR; we take its
//    groups[]/stores[] as the patch and route it through applyMutatePatch
//    with DEADKEY_WRITES (steps/editorMutate.ts), so the mutate() path is
//    the canonical IR producer (M6) and the M3 containment guard keeps the
//    write off header/comments/raw/touchLayout. The committed result goes
//    out through the store's setWorkingIR (overlay-preserving), never setIR.
//
// 2. Studio-side IR edits (pair add/remove, author-name metadata, pair
//    merge, duplicate-trigger repair): pure functions over a cloned IR,
//    committed through the same patch route. These exist because the
//    engine's lifecycle module owns the entity cluster, but pair contents
//    and the author name are studio-managed data ON that cluster.
//
// No raw KMN is ever constructed here (§5a: IR pipeline only).

import type {
  KeyboardIR,
  IRRule,
  StoreItem,
  RawKmnFragment,
} from "@keyboard-studio/contracts";
import {
  listDeadkeys,
  allocateDeadkeyId,
  setDeadkeyName,
  isPlusSeparator,
  deadkeyNameKey,
  isNamedDeadkeyElement,
} from "@keyboard-studio/contracts";
import type {
  DeadkeyMutationResult,
  DeadkeyConflict,
} from "@keyboard-studio/engine";
import { applyMutatePatch } from "../../steps/mutateApply.ts";
import { DEADKEY_WRITES } from "../../steps/editorMutate.ts";

export type DeadkeyCommit =
  | { ok: true; ir: KeyboardIR }
  | { ok: false; conflicts: readonly DeadkeyConflict[] };

/** Lowercase hex, zero-padded to at least 4 digits, e.g. 0x3000 → "3000".
 *  Ids above 0xffff are not truncated ("dead1" stays "dead1") — the
 *  pipeline imposes no 4-digit cap. */
export function hex4(id: number): string {
  return id.toString(16).padStart(4, "0");
}

/**
 * Route an engine deadkey-lifecycle mutation result through the mutate seam.
 *
 * - `{ok:false}` passes the conflicts through untouched — the caller shows
 *   the shared DeadkeyConflictDialog; nothing is written.
 * - `{ok:true}` commits the result IR's groups[]/stores[] via
 *   applyMutatePatch/DEADKEY_WRITES. The caller then calls setWorkingIR.
 */
export function commitDeadkeyResult(
  startIr: KeyboardIR,
  result: DeadkeyMutationResult,
): DeadkeyCommit {
  if (!result.ok) {
    return { ok: false, conflicts: result.conflicts };
  }
  return {
    ok: true,
    ir: applyMutatePatch(
      startIr,
      { groups: result.ir.groups, stores: result.ir.stores },
      DEADKEY_WRITES,
    ),
  };
}

/**
 * Commit a studio-side deadkey IR edit (pairs, author name, merge, repair)
 * through the same mutate seam. `next` must be a fresh IR derived from
 * `startIr`; only its groups[]/stores[] are taken as the patch.
 */
export function commitDeadkeyEdit(
  startIr: KeyboardIR,
  next: KeyboardIR,
): KeyboardIR {
  return applyMutatePatch(
    startIr,
    { groups: next.groups, stores: next.stores, raw: next.raw },
    DEADKEY_WRITES,
  );
}

// ---------------------------------------------------------------------------
// Small local rule matchers.
//
// The engine's cluster shapes (packages/engine/src/deadkey-lifecycle/
// cluster.ts) are not exported from the engine barrel, and this phase is
// scoped to packages/studio — so the two studio-side edits that need them
// (author-name write, duplicate-trigger repair) carry minimal local
// matchers pinned to the engine's documented shapes:
//
// - trigger rule: output exactly `[dk(id)]`, single vkey/char context
//   (mirrors matchTriggerRule).
// ---------------------------------------------------------------------------

/** All trigger rules minting `id`: output exactly `[dk(id)]` with a single
 * vkey/char context — mirrors the engine's matchTriggerRule (a rule that
 * merely outputs dk(id) with other context, e.g. a fan-out rule, is NOT a
 * trigger and must never be re-minted by the duplicate repair). */
export function findTriggerRules(ir: KeyboardIR, id: number): IRRule[] {
  const found: IRRule[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (
        rule.output.length === 1 &&
        rule.output[0]?.kind === "deadkey" &&
        rule.output[0].id === id &&
        isSingleVkeyOrCharContext(rule)
      ) {
        found.push(rule);
      }
    }
  }
  return found;
}

/** Single context element (after the codec's synthetic `+` separators) that is a vkey or char. */
function isSingleVkeyOrCharContext(rule: IRRule): boolean {
  const ctx = rule.context.filter((el) => !isPlusSeparator(el));
  return (
    ctx.length === 1 && (ctx[0]?.kind === "vkey" || ctx[0]?.kind === "char")
  );
}

/**
 * Write the author-chosen name onto every trigger rule minting `id`.
 *
 * Always available, pre- and post-FR-004: the name is metadata carried in
 * the trigger rule's `@deadkey:<hexid> name=<name>` trailing-comment token
 * (contracts setDeadkeyName). FR-004's codec closure will promote the
 * recorded name to the real `dk(name)` id mechanically — the author is
 * never asked twice.
 *
 * Throws (loudly, via setDeadkeyName) when the name cannot survive the
 * comment-token format — never a corrupt .kmn.
 */
export function withDeadkeyAuthorName(
  ir: KeyboardIR,
  id: number,
  name: string | undefined,
): KeyboardIR {
  const next = structuredClone(ir);
  const triggers = findTriggerRules(next, id);
  if (triggers.length === 0) {
    throw new Error(
      `withDeadkeyAuthorName: no trigger rule minting dk(${id.toString(16).padStart(4, "0")})`,
    );
  }
  for (const rule of triggers) {
    setDeadkeyName(rule, name);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Pair editing — add/remove base→accented pairs in the fan-out stores.
// ---------------------------------------------------------------------------

function storeByName(ir: KeyboardIR, name: string) {
  return ir.stores.find((s) => s.name === name);
}

/**
 * Append one base→accented pair to a deadkey's fan-out stores (lockstep:
 * base char to the bases store, accented char to the output store).
 * Both stores must exist; throws otherwise (the caller disables the UI with
 * the honest "rule shape not recognized" note when they don't).
 */
export function withAddedDeadkeyPair(
  ir: KeyboardIR,
  baseStoreName: string,
  outputStoreName: string,
  base: string,
  accented: string,
): KeyboardIR {
  const next = structuredClone(ir);
  const bases = storeByName(next, baseStoreName);
  const outputs = storeByName(next, outputStoreName);
  if (!bases || !outputs) {
    throw new Error(
      `withAddedDeadkeyPair: fan-out stores not found ("${baseStoreName}", "${outputStoreName}")`,
    );
  }
  const baseItem: StoreItem = { kind: "char", value: base };
  const outputItem: StoreItem = { kind: "char", value: accented };
  bases.items.push(baseItem);
  outputs.items.push(outputItem);
  return next;
}

/**
 * Remove the pair at `index` (zipped position across the two fan-out
 * stores). Throws when the index is out of range.
 */
export function withRemovedDeadkeyPair(
  ir: KeyboardIR,
  baseStoreName: string,
  outputStoreName: string,
  index: number,
): KeyboardIR {
  const next = structuredClone(ir);
  const bases = storeByName(next, baseStoreName);
  const outputs = storeByName(next, outputStoreName);
  if (!bases || !outputs) {
    throw new Error(
      `withRemovedDeadkeyPair: fan-out stores not found ("${baseStoreName}", "${outputStoreName}")`,
    );
  }
  if (index < 0 || index >= bases.items.length || index >= outputs.items.length) {
    throw new Error(
      `withRemovedDeadkeyPair: pair index ${index} out of range`,
    );
  }
  bases.items.splice(index, 1);
  outputs.items.splice(index, 1);
  return next;
}

/**
 * Read the zipped base→accented pairs of a deadkey's fan-out stores.
 * Zips to the shorter store (mirrors contracts' pairCount); non-char
 * items are skipped positionally — only char/char positions are pairs.
 */
export function readDeadkeyPairs(
  ir: KeyboardIR,
  baseStoreName: string,
  outputStoreName: string,
): Array<{ base: string; accented: string }> {
  const bases = storeByName(ir, baseStoreName);
  const outputs = storeByName(ir, outputStoreName);
  if (!bases || !outputs) return [];
  const pairs: Array<{ base: string; accented: string }> = [];
  const n = Math.min(bases.items.length, outputs.items.length);
  for (let i = 0; i < n; i++) {
    const b = bases.items[i];
    const o = outputs.items[i];
    if (b?.kind === "char" && o?.kind === "char") {
      pairs.push({ base: b.value, accented: o.value });
    }
  }
  return pairs;
}

/**
 * Append every pair of `fromId`'s fan-out stores onto `toId`'s fan-out
 * stores. Used by the conflict dialog's "Merge into dk(x)" resolution for
 * rename/retarget collisions. Both deadkeys must have recognizable stores;
 * throws otherwise (the caller disables merge with an honest note).
 */
export function withMergedDeadkeyPairs(
  ir: KeyboardIR,
  fromId: number,
  toId: number,
): KeyboardIR {
  const from = listDeadkeys(ir).find((d) => d.id === fromId);
  const to = listDeadkeys(ir).find((d) => d.id === toId);
  if (!from?.baseStore || !from.outputStore || !to?.baseStore || !to.outputStore) {
    throw new Error(
      "withMergedDeadkeyPairs: both deadkeys need recognizable fan-out stores to merge",
    );
  }
  const next = structuredClone(ir);
  const fromStarts = storeByName(next, from.baseStore);
  const fromOutputs = storeByName(next, from.outputStore);
  const toBases = storeByName(next, to.baseStore);
  const toOutputs = storeByName(next, to.outputStore);
  if (!fromStarts || !fromOutputs || !toBases || !toOutputs) {
    throw new Error("withMergedDeadkeyPairs: fan-out store lookup failed after clone");
  }
  const n = Math.min(fromStarts.items.length, fromOutputs.items.length);
  for (let i = 0; i < n; i++) {
    const b = fromStarts.items[i];
    const o = fromOutputs.items[i];
    if (b?.kind === "char" && o?.kind === "char") {
      toBases.items.push({ kind: "char", value: b.value });
      toOutputs.items.push({ kind: "char", value: o.value });
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Delete-repoint — rewrite a `referenced` conflict's referrers onto another
// deadkey so the delete can proceed.
// ---------------------------------------------------------------------------

const REFERRER_RULE_RE =
  /^group "[^"]*" rule "([^"]+)" — dk\([0-9a-f]+\) in (?:context|output|context and output)$/;
const REFERRER_STORE_RE =
  /^store "([^"]+)" — dk\([0-9a-f]+\) in store item$/;
const REFERRER_STORE_REF_RE =
  /^group "[^"]*" rule "([^"]+)" — references entity store "([^"]+)"$/;

export interface RepointResult {
  ir: KeyboardIR;
  /** Referrer descriptions that matched no known format — never silently skipped. */
  unparsed: string[];
}

/**
 * Rewrite every `dk(fromId)` reference named in a delete conflict's
 * `referrers` list onto `toId`:
 * - rule context/output deadkey elements,
 * - store-item deadkey elements,
 * - entity-store storeRefs (`dk_<fromHex>_bases` → `dk_<toHex>_bases`,
 *   same for `_output`) — the referring rule then consumes the target's
 *   pairs.
 *
 * The referrer strings are the engine's `describeRule` format
 * (deadkey-lifecycle/cluster.ts); anything not matching is reported in
 * `unparsed` so the caller can refuse loudly instead of half-repointing.
 */
export function withRepointedDeadkeyRefs(
  ir: KeyboardIR,
  fromId: number,
  toId: number,
  referrers: readonly string[],
): RepointResult {
  const next = structuredClone(ir);
  const unparsed: string[] = [];
  const fromHex = fromId.toString(16).padStart(4, "0");
  const toHex = toId.toString(16).padStart(4, "0");

  const ruleById = new Map<string, IRRule>();
  for (const group of next.groups) {
    for (const rule of group.rules) ruleById.set(rule.nodeId, rule);
  }

  const rewriteDeadkeyElements = (rule: IRRule) => {
    for (const el of rule.context) {
      if (el.kind === "deadkey" && el.id === fromId) el.id = toId;
    }
    for (const el of rule.output) {
      if (el.kind === "deadkey" && el.id === fromId) el.id = toId;
    }
  };

  for (const ref of referrers) {
    const ruleMatch = REFERRER_RULE_RE.exec(ref);
    if (ruleMatch) {
      const rule = ruleById.get(ruleMatch[1]!);
      if (rule) rewriteDeadkeyElements(rule);
      else unparsed.push(ref);
      continue;
    }
    const storeRefMatch = REFERRER_STORE_REF_RE.exec(ref);
    if (storeRefMatch) {
      const rule = ruleById.get(storeRefMatch[1]!);
      if (rule) {
        // Conventional entity-store names map onto the target's stores.
        // A non-conventional name maps to itself (no-op): the delete retry
        // will still refuse and name the remaining referrer — loud, never
        // a silent half-repoint.
        const swap = (name: string) =>
          name === `dk_${fromHex}_bases`
            ? `dk_${toHex}_bases`
            : name === `dk_${fromHex}_output`
              ? `dk_${toHex}_output`
              : name;
        for (const el of rule.context) {
          if ((el.kind === "any" || el.kind === "notany" || el.kind === "index") && "storeRef" in el) {
            el.storeRef = swap(el.storeRef);
          }
        }
        for (const el of rule.output) {
          if ((el.kind === "index" || el.kind === "outs") && "storeRef" in el) {
            el.storeRef = swap(el.storeRef);
          }
        }
      } else {
        unparsed.push(ref);
      }
      continue;
    }
    const storeMatch = REFERRER_STORE_RE.exec(ref);
    if (storeMatch) {
      const store = next.stores.find((s) => s.name === storeMatch[1]);
      if (store) {
        for (const item of store.items) {
          if (item.kind === "deadkey" && item.id === fromId) item.id = toId;
        }
      } else {
        unparsed.push(ref);
      }
      continue;
    }
    unparsed.push(ref);
  }

  return { ir: next, unparsed };
}

// ---------------------------------------------------------------------------
// Duplicate-id repair — re-mint the extra trigger rules.
// ---------------------------------------------------------------------------

/**
 * Repair a KM_WARN_DUPLICATE_DEADKEY_ID finding: more than one trigger
 * rule mints the same numeric id (the "dead0" corruption — every S-02
 * mint on an unknown key used to share one id).
 *
 * Keeps the first trigger rule on the original id; every additional
 * trigger rule minting that id gets a fresh id from allocateDeadkeyId.
 * Only the trigger rule's output id is rewritten — the duplicate's
 * fan-out/escape rules cannot be attributed to one trigger or the other
 * (they share the id), so they stay with the first deadkey. The repaired
 * deadkey starts with no pairs; the inventory notice says so honestly.
 *
 * Minimal but real: after repair the validator finding clears and both
 * deadkeys are separately listed and manageable.
 */
export function withRepairedDuplicateTriggerIds(ir: KeyboardIR): KeyboardIR {
  const next = structuredClone(ir);
  // Count trigger rules per minted id.
  const byId = new Map<number, IRRule[]>();
  for (const group of next.groups) {
    for (const rule of group.rules) {
      if (
        rule.output.length === 1 &&
        rule.output[0]?.kind === "deadkey" &&
        rule.output[0].id !== undefined
      ) {
        const id = rule.output[0].id;
        const list = byId.get(id) ?? [];
        list.push(rule);
        byId.set(id, list);
      }
    }
  }
  for (const triggers of byId.values()) {
    if (triggers.length <= 1) continue;
    // Keep the first; re-mint the rest.
    for (const rule of triggers.slice(1)) {
      // allocateDeadkeyId scans the live (already re-minted) IR, so each
      // extra trigger gets a distinct fresh id.
      const fresh = allocateDeadkeyId(next);
      const out = rule.output[0];
      if (out?.kind === "deadkey") {
        out.id = fresh;
      }
      // Keep the trigger rule's nodeId unique too (engine-minted nodeIds
      // embed the hex id; a stale nodeId would confuse later lookups).
      rule.nodeId = `dk-${fresh.toString(16).padStart(4, "0")}-trigger-repaired`;
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Named deadkeys (id null).
//
// Since #2238 (the FR-004 codec closure) the codec types `dk(name)` as
// {kind:"namedDeadkey"} elements in typed rules/stores; the numeric engine
// mutations still can't touch them (they key on numeric ids). The studio
// implements the two id:null actions — delete and retarget — over BOTH
// representations, because both exist in the wild:
//   - typed rules in freshly imported IRs, and
//   - `ir.raw[]` fragments (reason "named-deadkey") in persisted pre-#2238
//     working copies — including the overlay ops (survey deadkeyOps
//     delete-named / retarget-named) replayed against them at download.
// Name matching folds ASCII case via contracts' deadkeyNameKey — the
// compiler treats dk(semicolon) and dk(Semicolon) as one deadkey.
// Pairs and rename stay unavailable for named deadkeys: still gated
// adoption, not part of the #2238 compat re-pointing.
// ---------------------------------------------------------------------------

/** Escape a deadkey name for use in a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `dk(name)` mention matcher — exact name, optional whitespace. */
function dkNameRe(name: string): RegExp {
  return new RegExp(`dk\\(\\s*${escapeRegExp(name)}\\s*\\)`, "i");
}

/** Raw fragments belonging to the named deadkey `name`. */
export function namedDeadkeyFragments(
  ir: KeyboardIR,
  name: string,
): RawKmnFragment[] {
  const re = dkNameRe(name);
  return ir.raw.filter(
    (frag) => frag.reason === "named-deadkey" && re.test(frag.sourceText),
  );
}

/** True when a rule mentions the named deadkey (folded identity) in a
 *  typed context or output element. */
function ruleMentionsNamedDeadkey(rule: IRRule, key: string): boolean {
  return [...rule.context, ...rule.output].some(
    (el) => isNamedDeadkeyElement(el) && deadkeyNameKey(el.name) === key,
  );
}

/** Typed rules belonging to the named deadkey `name` (any rule mentioning
 *  it — trigger, fan-out, and chain rules alike, mirroring how the
 *  fragment entity collected every fragment mentioning the name). */
export function namedDeadkeyRules(
  ir: KeyboardIR,
  name: string,
): IRRule[] {
  const key = deadkeyNameKey(name);
  const rules: IRRule[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (ruleMentionsNamedDeadkey(rule, key)) rules.push(rule);
    }
  }
  return rules;
}

/**
 * Delete a named deadkey: remove its typed rules and its raw fragments.
 * Atomic — if anything outside the deadkey's own rules/fragments still
 * mentions the name, the delete is refused with the referrer list (never
 * a half-delete). A typed STORE holding the name as an item is such a
 * referrer: removing one item would shift the store's slot alignment, and
 * removing the whole store is not this op's call — the author resolves it
 * manually. (Pre-#2238 such a store was itself an entity fragment; the
 * fail-safe refusal is the conservative reading of that behaviour.)
 */
export function deleteNamedDeadkey(
  ir: KeyboardIR,
  name: string,
):
  | { ok: true; ir: KeyboardIR }
  | { ok: false; referrers: string[] } {
  const entityRules = namedDeadkeyRules(ir, name);
  const entityFrags = namedDeadkeyFragments(ir, name);
  if (entityRules.length === 0 && entityFrags.length === 0) {
    return {
      ok: false,
      referrers: [`No named-deadkey rules or fragments found for dk(${name}) — nothing to delete.`],
    };
  }
  const entityRuleIds = new Set(entityRules.map((r) => r.nodeId));
  const entityFragIds = new Set(entityFrags.map((f) => f.nodeId));
  const key = deadkeyNameKey(name);
  const re = dkNameRe(name);
  const referrers: string[] = [];

  // Other raw fragments mentioning dk(name) textually.
  for (const frag of ir.raw) {
    if (entityFragIds.has(frag.nodeId)) continue;
    if (re.test(frag.sourceText)) {
      referrers.push(`raw fragment "${frag.nodeId}" — mentions dk(${name})`);
    }
  }
  // Typed stores holding the name as an item (see header note).
  for (const store of ir.stores) {
    if (
      store.items.some(
        (item) => isNamedDeadkeyElement(item) && deadkeyNameKey(item.name) === key,
      )
    ) {
      referrers.push(`store "${store.name}" — contains dk(${name}) as an item`);
    }
  }
  // Parsed rules mentioning dk(name) textually outside a typed element
  // (e.g. inside a raw element). JSON scan is a heuristic, but it fails
  // safe: a false positive blocks the delete, never half-deletes.
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (entityRuleIds.has(rule.nodeId)) continue;
      if (re.test(JSON.stringify(rule))) {
        referrers.push(
          `group "${group.name}" rule "${rule.nodeId}" — mentions dk(${name})`,
        );
      }
    }
  }

  if (referrers.length > 0) {
    return { ok: false, referrers };
  }
  const next: KeyboardIR = {
    ...ir,
    groups: ir.groups.map((group) => ({
      ...group,
      rules: group.rules.filter((r) => !entityRuleIds.has(r.nodeId)),
    })),
    raw: ir.raw.filter((f) => !entityFragIds.has(f.nodeId)),
  };
  return { ok: true, ir: next };
}

/** Trigger-shaped named fragment: `+ [K] > dk(name)`, `+ 'c' > dk(name)`, … */
const NAMED_TRIGGER_FRAGMENT_RE =
  /^(\s*\+?\s*)(?:\[([^\]]+)\]|'([^']*)'|"([^"]*)")(\s*>\s*dk\(\s*[^)]*?\s*\)\s*(?:\/\/.*)?)$/i;

/**
 * All typed trigger rules for the named deadkey: output is exactly one
 * name-carrying element for this name, and the context — ignoring the
 * codec's `+` separators — is exactly one vkey or char element. Each hit
 * carries the index of the trigger element in the ORIGINAL context array
 * (so the rewrite preserves separators in place).
 */
function findNamedTriggerRules(
  ir: KeyboardIR,
  name: string,
): { rule: IRRule; triggerIndex: number }[] {
  const key = deadkeyNameKey(name);
  const found: { rule: IRRule; triggerIndex: number }[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.output.length !== 1) continue;
      const out = rule.output[0];
      if (
        out === undefined ||
        !isNamedDeadkeyElement(out) ||
        deadkeyNameKey(out.name) !== key
      ) {
        continue;
      }
      const nonPlus = rule.context
        .map((el, idx) => ({ el, idx }))
        .filter(({ el }) => !isPlusSeparator(el));
      if (nonPlus.length !== 1) continue;
      const only = nonPlus[0];
      if (only === undefined) continue;
      if (only.el.kind !== "vkey" && only.el.kind !== "char") continue;
      found.push({ rule, triggerIndex: only.idx });
    }
  }
  return found;
}

/**
 * Retarget a named deadkey: rewrite its trigger — the context element of
 * its typed trigger rule, or the trigger token of its trigger fragment on
 * a persisted pre-#2238 copy. Refuses when the trigger (across BOTH
 * representations) isn't exactly one clean match — rewriting an
 * unrecognized shape would be silent corruption.
 */
export function retargetNamedDeadkey(
  ir: KeyboardIR,
  name: string,
  newTrigger: { vkey: string } | { char: string },
):
  | { ok: true; ir: KeyboardIR }
  | { ok: false; error: string } {
  const typedTriggers = findNamedTriggerRules(ir, name);
  const entity = namedDeadkeyFragments(ir, name);
  const fragTriggers = entity.filter((f) => NAMED_TRIGGER_FRAGMENT_RE.test(f.sourceText));
  const total = typedTriggers.length + fragTriggers.length;
  if (total === 0) {
    return {
      ok: false,
      error: `dk(${name}) has no recognizable trigger rule or fragment — retarget refused rather than guessing.`,
    };
  }
  if (total > 1) {
    return {
      ok: false,
      error: `dk(${name}) has ${total} trigger rules/fragments — ambiguous, retarget refused.`,
    };
  }

  // Typed path: replace the trigger context element in place.
  const typed = typedTriggers[0];
  if (typed !== undefined) {
    const { rule, triggerIndex } = typed;
    const replacement =
      "vkey" in newTrigger
        ? { kind: "vkey" as const, name: newTrigger.vkey, modifiers: [] as string[] }
        : { kind: "char" as const, value: newTrigger.char };
    const next: KeyboardIR = {
      ...ir,
      groups: ir.groups.map((group) => ({
        ...group,
        rules: group.rules.map((r) =>
          r.nodeId === rule.nodeId
            ? {
                ...r,
                context: r.context.map((el, idx) =>
                  idx === triggerIndex ? replacement : el,
                ),
              }
            : r,
        ),
      })),
    };
    return { ok: true, ir: next };
  }

  // Fragment path: rewrite the trigger token in the fragment's source text.
  const trigger = fragTriggers[0]!;
  const newToken =
    "vkey" in newTrigger ? `[${newTrigger.vkey}]` : `'${newTrigger.char}'`;
  const rewritten = trigger.sourceText.replace(
    NAMED_TRIGGER_FRAGMENT_RE,
    `$1${newToken}$5`,
  );
  if (rewritten === trigger.sourceText) {
    return { ok: false, error: `Trigger rewrite produced no change — refusing.` };
  }
  const next: KeyboardIR = {
    ...ir,
    raw: ir.raw.map((f) =>
      f.nodeId === trigger.nodeId ? { ...f, sourceText: rewritten } : f,
    ),
  };
  return { ok: true, ir: next };
}
