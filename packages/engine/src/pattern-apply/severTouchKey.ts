/**
 * severTouchKey / relinkTouchKey — the severance transplant and its mirror
 * (spec 104 T011 + T027; FR-008, FR-011, FR-029; normative procedure:
 * specs/104-touch-key-id-criteria/contracts/key-id-criteria.md §3).
 *
 * Severance is a RULE-LEVEL transplant, never an output copy. Every rule
 * naming the source key that serves the touch key's behaviour is cloned
 * VERBATIM — the rule NODE is cloned (context elements, including spec 103
 * `if()` guards in place, and output elements are carried element-for-
 * element; only the struck vkey's name changes), the clone keeps the source
 * rule's group and is inserted immediately after it, so relative order —
 * which Keyman matching depends on — is preserved by construction. The
 * layout id is replaced ONLY on occurrences in the layer family where
 * arm 0 failed (the anchor layer's family per {@link groupLayerFamilies});
 * occurrences in other families keep the K_ id and their rules untouched,
 * because the same physical key there may still be the behaviour the
 * author wants (the Cameroon K_1-on-symbol case, contracts §3 step 4).
 *
 * ## Refusals (no clones, inputs returned untouched, key flagged)
 *
 * A verbatim transplant is not always possible, and a half-copied rule set
 * must never be emitted (FR-008). This module refuses, recording the
 * binding that caused it, when:
 *
 *   - the target id collides with an existing identity — a layout key
 *     (any platform/layer, subkeys included), a vkey named by any rule
 *     (the .kmn-only T_ name case: sil_euro_latin's `[T_N_Dieresis]`
 *     appears on no touch key but already names a rule-side concept), or
 *     a vkey listed in a store;
 *   - the source key is a member of a store that rules reference — its
 *     production reaches it through the shared listing (the fv fan shape:
 *     `store(fanHkeys) [T_H] [T_HI] [T_HU]` struck by
 *     `+ any(fanHkeys) > index(fanH,1)`). The rule-join cannot even index
 *     such a rule (it has no literal struck vkey), so collection ALSO
 *     scans store memberships; isolating one member would mean editing
 *     the shared store and its `index()` pairing, changing the other
 *     members' behaviour;
 *   - a collected rule's context carries a deadkey element — the rule
 *     binds the key into a deadkey composition other keys own, and the
 *     severed key would keep changing when that composition changes,
 *     which is exactly what severance promises it will not;
 *   - a collected rule lives in a readonly group (no clone can be
 *     inserted preserving order), or the index names a rule the IR does
 *     not contain (completeness cannot be verified);
 *   - the source is an emulation-class key (K_BKSP, K_ENTER, K_TAB,
 *     K_LOPT/K_ROPT, numpad — contracts §1 excludes them from severance)
 *     or an unclassified id outside the K_/T_/U_ families;
 *   - opaque fragments are present and the caller has not acknowledged
 *     them (the touchRuleSynthesis posture: a fragment can hold a rule
 *     for this key that the join cannot see, so completeness is
 *     unprovable).
 *
 * A store the source key is merely CONTEXT for (Cameroon's
 * `any(diablock) + [K_1] > context` — a character store read by the
 * rule, listing no keys) is NOT a refusal: the clone reads the same store
 * verbatim and no other key's behaviour changes.
 *
 * ## Records
 *
 * Both functions emit decision-spine records (spec 093 / data-model.md
 * §2, §5): a {@link TransplantRecord} and a {@link KeyIdentityDecision}
 * for severance (`severed`, or `flagged-manual` on refusal), a
 * `relinked` decision for the mirror. Re-linking consumes EXACTLY the
 * transplant record's clone list — a completed transplant is the only
 * artefact it may delete (data-model.md §5) — and is a plain invoked
 * function: nothing in this module calls it automatically (FR-029).
 *
 * Pure: inputs are never mutated; refusals return the input `ir`/`layout`
 * by reference.
 */

import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  isEmulationKeyId,
  parseTouchKeyAddress,
  producedByKeyId,
  type ContextElement,
  type IRGroup,
  type IRRule,
  type KeyboardIR,
  type KeyIdentityDecision,
  type KeyIdentityTrack,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
  type TransplantRecord,
} from "@keyboard-studio/contracts";
import { unicodeCharHex } from "../shared/touch-ids.js";
import { applyKeyEditsToLayout } from "./applyKeyEditsToLayout.js";
import {
  resolveKeyAddress,
  type AddressableLayoutLike,
  type KeyEditOperation,
} from "./keyEditOps.js";
import { groupLayerFamilies } from "./layerFamilies.js";
import { proposeKeyId } from "./keyIdMinting.js";
import { touchKeyIdFamily } from "./touch-mechanism-shared.js";

// ---------------------------------------------------------------------------
// Request / result shapes
// ---------------------------------------------------------------------------

export interface SeverTouchKeyRequest {
  /** The id being severed from (typically a `K_` id). */
  readonly sourceId: string;
  /** The id being minted (a `T_` id per FR-005 arm (a)). */
  readonly targetId: string;
  /** The platform whose layer-family occurrences are re-keyed. */
  readonly platformId: string;
  /** A layer in the family where arm 0 failed; its family scopes the replacement. */
  readonly anchorLayerId: string;
  readonly track?: KeyIdentityTrack;
  /** The FR-002 target host set in force (recorded with the decision). Default `["US"]`. */
  readonly hostSet?: readonly string[];
  readonly proposer?: "criteria" | "author";
  readonly authorAnswer?: string;
  /** Acknowledge opaque fragments (see the module doc's gate). Default false. */
  readonly opaqueAcknowledged?: boolean;
  readonly recordId?: string;
  readonly decisionRecordId?: string;
  /** Epoch ms for both records. Default: `Date.now()`. */
  readonly recordedAt?: number;
  /** `recordId` of the record(s) this transplant supersedes. Default `null`. */
  readonly supersedes?: string | null;
}

export interface SeverTouchKeyResult {
  readonly ir: KeyboardIR;
  readonly layout: TouchLayoutIR;
  readonly record: TransplantRecord;
  readonly decision: KeyIdentityDecision;
  /** The layer family the id replacement landed on; empty on refusal. */
  readonly layersAffected: readonly string[];
}

export interface RelinkTouchKeyMeta {
  /** The occurrence address the re-link decision is recorded against. */
  readonly keyRef: string;
  readonly track?: KeyIdentityTrack;
  readonly hostSet?: readonly string[];
  /** Re-linking is author-invoked (FR-029), so the default proposer is `"author"`. */
  readonly proposer?: "criteria" | "author";
  readonly authorAnswer?: string;
  readonly recordId?: string;
  readonly recordedAt?: number;
  readonly supersedes?: string | null;
}

export type RelinkTouchKeyResult =
  | {
      readonly ok: true;
      readonly ir: KeyboardIR;
      readonly layout: TouchLayoutIR;
      readonly decision: KeyIdentityDecision;
    }
  | {
      readonly ok: false;
      readonly ir: KeyboardIR;
      readonly layout: TouchLayoutIR;
      /** Why the re-link did not run; the inputs are returned untouched. */
      readonly reason: string;
    };

// ---------------------------------------------------------------------------
// Small predicates
// ---------------------------------------------------------------------------

/** Every key id a layout carries, main keys and subkeys alike. */
function collectLayoutKeyIds(layout: TouchLayoutIR): Set<string> {
  const ids = new Set<string>();
  const visit = (key: { id: string; sk?: readonly { id: string }[]; multitap?: readonly { id: string }[]; flick?: Readonly<Record<string, { id: string }>> }) => {
    ids.add(key.id.toUpperCase());
    for (const sub of key.sk ?? []) visit(sub as typeof key);
    for (const sub of key.multitap ?? []) visit(sub as typeof key);
    for (const sub of Object.values(key.flick ?? {})) visit(sub as typeof key);
  };
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) visit(key);
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// severTouchKey
// ---------------------------------------------------------------------------

export function severTouchKey(
  ir: KeyboardIR,
  layout: TouchLayoutIR,
  ruleIndex: TouchKeyRuleIndex,
  request: SeverTouchKeyRequest,
): SeverTouchKeyResult {
  const { sourceId, targetId } = request;
  const recordedAt = request.recordedAt ?? Date.now();
  const recordId = request.recordId ?? `transplant:${sourceId}->${targetId}`;
  const supersedes = request.supersedes ?? null;

  const refuse = (refusalBinding: string): SeverTouchKeyResult => {
    const record: TransplantRecord = {
      recordId,
      sourceId,
      targetId,
      layersAffected: [],
      clonedRuleNodeIds: [],
      outcome: "refused",
      refusalBinding,
      recordedAt,
      supersedes,
    };
    const decision: KeyIdentityDecision = {
      recordId: request.decisionRecordId ?? `${recordId}:decision`,
      keyRef: `${request.platformId}:${request.anchorLayerId}:${sourceId}`,
      action: "flagged-manual",
      criterion: "FR-008",
      track: request.track ?? "creation",
      proposer: request.proposer ?? "criteria",
      ...(request.authorAnswer !== undefined ? { authorAnswer: request.authorAnswer } : {}),
      hostSet: request.hostSet ?? ["US"],
      recordedAt,
      supersedes,
    };
    return { ir, layout, record, decision, layersAffected: [] };
  };

  // -- Source eligibility ----------------------------------------------------
  if (touchKeyIdFamily(sourceId) === undefined) {
    return refuse(
      `source key "${sourceId}" is outside the K_/T_/U_ families (unclassified) — no criterion may sever it`,
    );
  }
  if (isEmulationKeyId(sourceId)) {
    return refuse(
      `source key "${sourceId}" is an emulation-class key (contracts §1) and is excluded from severance`,
    );
  }

  // -- Opaque gate ------------------------------------------------------------
  if (ruleIndex.opaqueFragmentCount > 0 && request.opaqueAcknowledged !== true) {
    return refuse(
      `opaque fragments present (${ruleIndex.opaqueFragmentCount}) — a fragment can hold a rule for "${sourceId}" the rule-join cannot see, so transplant completeness is unprovable until acknowledged`,
    );
  }

  // -- Collision (contracts §3 step 2) ----------------------------------------
  const targetUpper = targetId.toUpperCase();
  const taken = collectLayoutKeyIds(layout);
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "vkey") taken.add(el.name.toUpperCase());
      }
    }
  }
  for (const store of ir.stores) {
    for (const item of store.items) {
      if (item.kind === "vkey") taken.add(item.name.toUpperCase());
    }
  }
  if (taken.has(targetUpper)) {
    return refuse(
      `target id "${targetId}" already names an existing key, rule, or store-listed id — minting it would silently merge two identities`,
    );
  }

  // -- Layer family + presence --------------------------------------------------
  const platform = layout.platforms.find((p) => p.id === request.platformId);
  const anchorPresent =
    platform?.layers.some((l) => l.id === request.anchorLayerId) ?? false;
  if (platform === undefined || !anchorPresent) {
    return refuse(
      `source key "${sourceId}" does not occur on platform "${request.platformId}" layer "${request.anchorLayerId}" — nothing to sever`,
    );
  }
  const grouping = groupLayerFamilies(platform.layers.map((l) => l.id));
  const family =
    grouping.families.find((f) => f.layerIds.includes(request.anchorLayerId))?.layerIds ??
    [request.anchorLayerId];
  const layersAffected = family.filter((layerId) =>
    platform.layers
      .find((l) => l.id === layerId)
      ?.rows.some((row) => row.keys.some((k) => k.id.toUpperCase() === sourceId.toUpperCase())),
  );
  if (layersAffected.length === 0) {
    return refuse(
      `source key "${sourceId}" does not occur in the layer family of "${request.anchorLayerId}" on platform "${request.platformId}" — nothing to sever`,
    );
  }

  // -- Collect the binding rule set (contracts §3 step 1) -----------------------
  const ruleByNodeId = new Map<string, { group: IRGroup; rule: IRRule }>();
  for (const group of ir.groups) {
    for (const rule of group.rules) ruleByNodeId.set(rule.nodeId, { group, rule });
  }
  const collectedNodeIds = [...new Set(bindingsForKeyId(ruleIndex, sourceId).map((b) => b.ruleNodeId))];
  const collected: { group: IRGroup; rule: IRRule }[] = [];
  for (const nodeId of collectedNodeIds) {
    const located = ruleByNodeId.get(nodeId);
    if (located === undefined) {
      return refuse(
        `rule ${nodeId} named by the rule-join was not found in the IR — group/order preservation cannot be verified`,
      );
    }
    if (located.group.readonly) {
      return refuse(
        `group "${located.group.name}" is readonly — a clone of rule ${nodeId} cannot be inserted preserving group and relative order`,
      );
    }
    collected.push(located);
  }

  // -- Shared-store membership (the fv fan shape) --------------------------------
  const referencedStores = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      for (const el of rule.context) {
        if (el.kind === "any" || el.kind === "notany" || el.kind === "index") {
          referencedStores.add(el.storeRef);
        }
      }
      for (const el of rule.output) {
        if (el.kind === "index" || el.kind === "outs") referencedStores.add(el.storeRef);
      }
    }
  }
  for (const store of ir.stores) {
    if (store.isSystem) continue;
    const listsSource = store.items.some(
      (item) => item.kind === "vkey" && item.name.toUpperCase() === sourceId.toUpperCase(),
    );
    if (listsSource && referencedStores.has(store.name)) {
      return refuse(
        `store(${store.name}) lists "${sourceId}" as a member and rules strike through that store — the key's production is bound to the shared store listing and its index() pairing, so no verbatim clone with only the key name changed exists`,
      );
    }
  }

  // -- Deadkey binding ------------------------------------------------------------
  // A numeric `deadkey(1)` in context reaches the IR as a `raw` element (only
  // the `dk(name)` spelling gets the typed variant), so the raw spelling is
  // matched too — it is the same binding, just untyped.
  for (const { rule } of collected) {
    for (const el of rule.context) {
      const deadkeyRef =
        el.kind === "deadkey"
          ? `deadkey(${el.id})`
          : el.kind === "namedDeadkey"
            ? `deadkey(${el.name})`
            : el.kind === "raw" && /^deadkey\s*\(/i.test(el.text.trim())
              ? el.text.trim()
              : undefined;
      if (deadkeyRef !== undefined) {
        return refuse(
          `${deadkeyRef} in the context of rule ${rule.nodeId} binds "${sourceId}" into a deadkey composition other keys own — a clone would keep the severed key inside that shared composition`,
        );
      }
    }
  }

  // -- Clone + re-key (contracts §3 steps 2 + 4) ------------------------------------
  const collectedSet = new Set(collectedNodeIds);
  const clonedRuleNodeIds: { sourceNodeId: string; cloneNodeId: string }[] = [];
  const cloneBySourceId = new Map<string, IRRule>();
  for (const { rule } of collected) {
    const cloneNodeId = `gen-severed-${rule.nodeId}`;
    const { sourceLine: _droppedSourceLine, ...rest } = rule;
    const clone: IRRule = {
      ...rest,
      nodeId: cloneNodeId,
      context: rule.context.map((el): ContextElement =>
        el.kind === "vkey" && el.name.toUpperCase() === sourceId.toUpperCase()
          ? { ...el, name: targetId }
          : { ...el },
      ),
      output: rule.output.map((el) => ({ ...el })),
    };
    cloneBySourceId.set(rule.nodeId, clone);
    clonedRuleNodeIds.push({ sourceNodeId: rule.nodeId, cloneNodeId });
  }

  const groups = ir.groups.map((group) => {
    if (!group.rules.some((r) => collectedSet.has(r.nodeId))) return group;
    const rules: IRRule[] = [];
    for (const rule of group.rules) {
      rules.push(rule);
      const clone = cloneBySourceId.get(rule.nodeId);
      if (clone !== undefined) rules.push(clone);
    }
    return { ...group, rules };
  });
  const nextIr: KeyboardIR = { ...ir, groups };

  const affectedSet = new Set(layersAffected);
  const nextLayout: TouchLayoutIR = {
    ...layout,
    platforms: layout.platforms.map((p) => {
      if (p.id !== request.platformId) return p;
      return {
        ...p,
        layers: p.layers.map((layer) => {
          if (!affectedSet.has(layer.id)) return layer;
          return {
            ...layer,
            rows: layer.rows.map((row) => ({
              ...row,
              keys: row.keys.map((key) =>
                key.id.toUpperCase() === sourceId.toUpperCase()
                  ? { ...key, id: targetId }
                  : key,
              ),
            })),
          };
        }),
      };
    }),
  };

  const record: TransplantRecord = {
    recordId,
    sourceId,
    targetId,
    layersAffected,
    clonedRuleNodeIds,
    outcome: "completed",
    recordedAt,
    supersedes,
  };
  const decision: KeyIdentityDecision = {
    recordId: request.decisionRecordId ?? `${recordId}:decision`,
    keyRef: `${request.platformId}:${request.anchorLayerId}:${sourceId}`,
    action: "severed",
    criterion: "FR-008",
    track: request.track ?? "creation",
    proposer: request.proposer ?? "criteria",
    ...(request.authorAnswer !== undefined ? { authorAnswer: request.authorAnswer } : {}),
    hostSet: request.hostSet ?? ["US"],
    recordedAt,
    supersedes,
  };
  return { ir: nextIr, layout: nextLayout, record, decision, layersAffected };
}

// ---------------------------------------------------------------------------
// relinkTouchKey — the FR-029 mirror
// ---------------------------------------------------------------------------

/**
 * Undo a completed transplant: delete exactly the rules its record lists
 * as clones, and restore the source id on the record's `layersAffected`
 * occurrences. Invoked only — never triggered by an edit or a resolver
 * verdict inside this module (FR-029: offered, recorded, never automatic).
 */
export function relinkTouchKey(
  ir: KeyboardIR,
  layout: TouchLayoutIR,
  record: TransplantRecord,
  meta: RelinkTouchKeyMeta,
): RelinkTouchKeyResult {
  if (record.outcome !== "completed") {
    return {
      ok: false,
      ir,
      layout,
      reason: `transplant record ${record.recordId} has outcome "${record.outcome}" — only a completed transplant can be re-linked`,
    };
  }

  const cloneIds = new Set(record.clonedRuleNodeIds.map((c) => c.cloneNodeId));
  const present = new Set<string>();
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (cloneIds.has(rule.nodeId)) present.add(rule.nodeId);
    }
  }
  const missing = [...cloneIds].filter((id) => !present.has(id));
  if (missing.length > 0) {
    return {
      ok: false,
      ir,
      layout,
      reason: `transplant record ${record.recordId} is stale — clone rule(s) ${missing.join(", ")} are not in the IR; re-linking consumes exactly the record's clone list, so nothing was changed`,
    };
  }

  const groups = ir.groups.map((group) => {
    if (!group.rules.some((r) => cloneIds.has(r.nodeId))) return group;
    return { ...group, rules: group.rules.filter((r) => !cloneIds.has(r.nodeId)) };
  });
  const nextIr: KeyboardIR = { ...ir, groups };

  const affectedSet = new Set(record.layersAffected);
  const nextLayout: TouchLayoutIR = {
    ...layout,
    platforms: layout.platforms.map((p) => ({
      ...p,
      layers: p.layers.map((layer) => {
        if (!affectedSet.has(layer.id)) return layer;
        return {
          ...layer,
          rows: layer.rows.map((row) => ({
            ...row,
            keys: row.keys.map((key) =>
              key.id.toUpperCase() === record.targetId.toUpperCase()
                ? { ...key, id: record.sourceId }
                : key,
            ),
          })),
        };
      }),
    })),
  };

  const recordedAt = meta.recordedAt ?? Date.now();
  const decision: KeyIdentityDecision = {
    recordId: meta.recordId ?? `decision:relink:${record.recordId}`,
    keyRef: meta.keyRef,
    action: "relinked",
    criterion: "FR-029",
    track: meta.track ?? "creation",
    proposer: meta.proposer ?? "author",
    ...(meta.authorAnswer !== undefined ? { authorAnswer: meta.authorAnswer } : {}),
    hostSet: meta.hostSet ?? ["US"],
    recordedAt,
    supersedes: meta.supersedes ?? null,
  };
  return { ok: true, ir: nextIr, layout: nextLayout, decision };
}

// ---------------------------------------------------------------------------
// T012 — the edit path: redefining edits trigger severance (FR-011/FR-012)
// ---------------------------------------------------------------------------

/**
 * Catalogue descriptor ids for the severance line (contracts §6, FR-026).
 * The STRINGS live in the studio's en/fr catalogue — the engine cannot own
 * catalogue copy — so the engine returns these ids plus the interpolation
 * values on {@link SeveranceApplied.notice}, and the studio resolves them.
 * Wave 3 wires the rendering; the ids are stable contract from here.
 *
 * - {@link SEVERANCE_LINE_DESCRIPTOR_ID}: "This touch key is now on its
 *   own: it types only what you set here, and changing the
 *   {physicalKeyLabel} key on the typing keyboard won't change it."
 * - {@link SEVERANCE_LINE_NO_PHYSICAL_DESCRIPTOR_ID}: the no-physical-key
 *   variant, "This touch key is on its own: it types only what you set
 *   here, and no typing-keyboard key controls it."
 */
export const SEVERANCE_LINE_DESCRIPTOR_ID = "touchKeyIdentity.severanceLine";
export const SEVERANCE_LINE_NO_PHYSICAL_DESCRIPTOR_ID =
  "touchKeyIdentity.severanceLineNoPhysicalKey";

/** The severance notice for one applied severance: a catalogue id + its values. */
export interface SeveranceNotice {
  readonly descriptorId: string;
  readonly values: { readonly physicalKeyLabel?: string };
}

export interface SeveranceApplied {
  readonly keyRef: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly record: TransplantRecord;
  readonly decision: KeyIdentityDecision;
  readonly notice: SeveranceNotice;
}

export interface SeveranceRefused {
  readonly keyRef: string;
  readonly sourceId: string;
  readonly record: TransplantRecord;
  readonly decision: KeyIdentityDecision;
}

export interface RelinkApplied {
  readonly keyRef: string;
  readonly decision: KeyIdentityDecision;
}

export interface ApplyKeyEditsWithSeveranceOptions {
  readonly track?: KeyIdentityTrack;
  readonly hostSet?: readonly string[];
  /**
   * Completed transplant records for the keyboard, used to route manual
   * `rename` edits (T_ back to the record's source K_ id) through
   * {@link relinkTouchKey} (FR-029: a manual id edit must not be able to
   * produce the half-applied state — K_ restored, transplanted rules left
   * behind). A rename with no matching record stays a plain rename.
   */
  readonly transplantRecords?: readonly TransplantRecord[];
  readonly opaqueAcknowledged?: boolean;
  readonly recordedAt?: number;
}

export interface ApplyKeyEditsWithSeveranceResult {
  readonly ir: KeyboardIR;
  readonly layout: TouchLayoutIR;
  /** Operations the underlying applier could not resolve (passed through). */
  readonly orphaned: readonly KeyEditOperation[];
  readonly warnings: readonly string[];
  readonly severances: readonly SeveranceApplied[];
  readonly refusals: readonly SeveranceRefused[];
  readonly relinks: readonly RelinkApplied[];
}

type EditTrigger =
  | {
      readonly kind: "severance";
      readonly platformId: string;
      readonly layerId: string;
      readonly sourceId: string;
      readonly newOutput: string | undefined;
      readonly physicalKeyLabel: string | undefined;
    }
  | {
      readonly kind: "relink";
      readonly platformId: string;
      readonly layerId: string;
      readonly record: TransplantRecord;
    };

/** Mint the T_ target for a severance from the key's (new) output text. */
function mintSeveranceTarget(
  newOutput: string | undefined,
  ruleIndex: TouchKeyRuleIndex,
  sourceId: string,
): string | undefined {
  const candidates: string[] = [];
  if (newOutput !== undefined && newOutput.length > 0) candidates.push(newOutput);
  candidates.push(...producedByKeyId(ruleIndex, sourceId));
  for (const text of candidates) {
    if (text.length === 0) continue;
    const proposal = proposeKeyId({ chars: text, capsHandled: true });
    if (proposal.id.startsWith("T_")) return proposal.id;
    if (proposal.alternative !== undefined) return proposal.alternative.id;
    const chars = [...text];
    if (chars.length === 1) return `T_${unicodeCharHex(chars[0]!)}`;
  }
  return undefined;
}

/**
 * Apply key edits (via {@link applyKeyEditsToLayout}) and run the identity
 * consequences the criteria attach to them, as ONE operation — so no
 * intermediate state exists in which a redefined key is half-severed
 * (FR-007 atomicity, SC-003):
 *
 *   - A **redefining edit** — a `set` operation that authors a new
 *     `output` for a key whose id is `K_`-family — triggers severance
 *     (FR-011) on this automatic path: the transplant runs, the key is
 *     re-keyed to a minted `T_` id across its layer family, and the
 *     result carries the severance notice (descriptor id + values) for
 *     the studio to render. When the transplant REFUSES, the author's
 *     edit stands, the key keeps its `K_` id, and the refusal is
 *     returned with its `flagged-manual` decision — the key is flagged
 *     for manual definition, never half-copied.
 *   - A **label-only edit** (`text`/`hint`/geometry, no `output`) NEVER
 *     triggers severance (FR-012) — nor does an edit to a key that is
 *     not `K_`-linked.
 *   - A **`rename` back to a transplant's source `K_` id** routes through
 *     {@link relinkTouchKey} when the caller supplies the transplant
 *     record (FR-029's manual-edit rule).
 *
 * Triggers are detected against the PRE-edit layout (an operation's
 * address names the key as it was when the edit was authored); the
 * severance/relink passes then run against the post-edit state, in
 * operation order. Track 2 does NOT use this wrapper for severance — it
 * presents the choice first (FR-016) and calls {@link severTouchKey}
 * only after the author's answer.
 */
export function applyKeyEditsWithSeverance(
  ir: KeyboardIR,
  layout: TouchLayoutIR,
  ops: readonly KeyEditOperation[],
  options: ApplyKeyEditsWithSeveranceOptions = {},
): ApplyKeyEditsWithSeveranceResult {
  const warnings: string[] = [];
  const triggers: EditTrigger[] = [];

  const addressable: AddressableLayoutLike<(typeof layout.platforms)[number]["layers"][number]["rows"][number]["keys"][number]> = {
    platforms: layout.platforms.map((platform) => ({
      id: platform.id,
      layers: platform.layers.map((layer) => ({ id: layer.id, rows: layer.rows })),
    })),
  };

  for (const op of ops) {
    const parts = parseTouchKeyAddress(op.address);
    if (parts === undefined || parts.sub !== undefined) continue;

    if (op.kind === "rename") {
      const record = (options.transplantRecords ?? []).find(
        (r) =>
          r.outcome === "completed" &&
          r.targetId.toUpperCase() === parts.keyId.toUpperCase() &&
          r.sourceId.toUpperCase() === op.toId.toUpperCase(),
      );
      if (record !== undefined) {
        triggers.push({
          kind: "relink",
          platformId: parts.platform,
          layerId: parts.layerId,
          record,
        });
      }
      continue;
    }

    if (op.kind !== "set") continue;
    if (!Object.prototype.hasOwnProperty.call(op.fields, "output")) continue;
    const resolved = resolveKeyAddress(addressable, parts);
    if (resolved === undefined) continue;
    const key = resolved.key;
    if (touchKeyIdFamily(key.id) !== "K_") continue;
    const newOutput = op.fields.output;
    if (newOutput === key.output) continue;
    triggers.push({
      kind: "severance",
      platformId: parts.platform,
      layerId: parts.layerId,
      sourceId: key.id,
      newOutput,
      physicalKeyLabel: key.text !== undefined && key.text.length > 0 ? key.text : undefined,
    });
  }

  const applied = applyKeyEditsToLayout(layout, ops);
  warnings.push(...applied.warnings);

  let currentIr = ir;
  let currentLayout = applied.layout;
  const severances: SeveranceApplied[] = [];
  const refusals: SeveranceRefused[] = [];
  const relinks: RelinkApplied[] = [];

  for (const trigger of triggers) {
    if (trigger.kind === "relink") {
      const result = relinkTouchKey(currentIr, currentLayout, trigger.record, {
        keyRef: `${trigger.platformId}:${trigger.layerId}:${trigger.record.sourceId}`,
        ...(options.track !== undefined ? { track: options.track } : {}),
        ...(options.hostSet !== undefined ? { hostSet: options.hostSet } : {}),
        ...(options.recordedAt !== undefined ? { recordedAt: options.recordedAt } : {}),
      });
      if (result.ok) {
        currentIr = result.ir;
        currentLayout = result.layout;
        relinks.push({ keyRef: result.decision.keyRef, decision: result.decision });
      } else {
        warnings.push(`[severance] re-link did not run: ${result.reason}`);
      }
      continue;
    }

    const ruleIndex = buildTouchKeyRuleIndex(currentIr);
    const targetId = mintSeveranceTarget(trigger.newOutput, ruleIndex, trigger.sourceId);
    if (targetId === undefined) {
      warnings.push(
        `[severance] no T_ target could be minted for "${trigger.sourceId}" — severance skipped, key flagged for manual definition`,
      );
      continue;
    }
    const result = severTouchKey(currentIr, currentLayout, ruleIndex, {
      sourceId: trigger.sourceId,
      targetId,
      platformId: trigger.platformId,
      anchorLayerId: trigger.layerId,
      ...(options.track !== undefined ? { track: options.track } : {}),
      ...(options.hostSet !== undefined ? { hostSet: options.hostSet } : {}),
      ...(options.opaqueAcknowledged !== undefined
        ? { opaqueAcknowledged: options.opaqueAcknowledged }
        : {}),
      ...(options.recordedAt !== undefined ? { recordedAt: options.recordedAt } : {}),
    });
    currentIr = result.ir;
    currentLayout = result.layout;
    if (result.record.outcome === "completed") {
      severances.push({
        keyRef: result.decision.keyRef,
        sourceId: trigger.sourceId,
        targetId,
        record: result.record,
        decision: result.decision,
        notice:
          trigger.physicalKeyLabel !== undefined
            ? {
                descriptorId: SEVERANCE_LINE_DESCRIPTOR_ID,
                values: { physicalKeyLabel: trigger.physicalKeyLabel },
              }
            : { descriptorId: SEVERANCE_LINE_NO_PHYSICAL_DESCRIPTOR_ID, values: {} },
      });
    } else {
      refusals.push({
        keyRef: result.decision.keyRef,
        sourceId: trigger.sourceId,
        record: result.record,
        decision: result.decision,
      });
    }
  }

  return {
    ir: currentIr,
    layout: currentLayout,
    orphaned: applied.orphaned,
    warnings,
    severances,
    refusals,
    relinks,
  };
}
