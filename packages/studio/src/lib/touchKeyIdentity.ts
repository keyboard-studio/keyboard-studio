/**
 * Spec 104 T015/T016 — touch key-identity derivation, record-keeping, and
 * application for the studio side of the key-id criteria
 * (specs/104-touch-key-id-criteria, contracts §5–§6, data-model.md §2–§5).
 *
 * Three pure surfaces, all consumed by `TouchKeyIdentityList.tsx` and the
 * TouchGallery inline severance choice:
 *
 *  1. DERIVATION — the pending presentation set is *derived*, never stored:
 *     {@link deriveRepairRows} re-runs the contracts dead-key scan
 *     (`findDeadTouchKeys`, resolver-backed per FR-024) over the working IR +
 *     effective layout, so a track switch or an underlying state change
 *     re-derives the set automatically (FR-017/FR-018) while recorded
 *     answers — looked up from the {@link TouchKeyIdentityRecords} slice —
 *     stand. A row whose key is no longer dead is simply no longer derived.
 *
 *  2. RECORDS — append-only helpers over the store slice. A decision is
 *     superseded, never edited in place (data-model.md §2): answering a row
 *     appends a new `RepairProposal` / `KeyIdentityDecision` /
 *     `TransplantRecord` whose `supersedes` names the record it replaces.
 *     The latest non-superseded record per subject governs presentation.
 *
 *  3. APPLICATION — turning an answer into edits. Convert-to-U_ and blank
 *     are key-edit ops (`PendingKeyEditOperation`s) on the ordinary overlay;
 *     mint-and-rule goes through the engine's `ensureTouchKeyRule`. The
 *     record is appended BEFORE the transformation is applied
 *     (data-model.md §4: never applied without the outcome recorded first).
 *
 * The FR-009 default reads the mark's per-mark "start of line" box (#2374):
 * when the box is unticked for the row's evidence mark, a combining mark's
 * default is mint-and-rule (the guard can only live in a rule), never the
 * U_ conversion that would silently drop it.
 */

import type {
  KeyIdentityDecision,
  KeyboardIR,
  RepairAction,
  RepairProposal,
  TouchKeyRuleIndex,
  TouchLayoutIR,
  TransplantRecord,
} from "@keyboard-studio/contracts";
import {
  bindingsForKeyId,
  buildTouchKeyRuleIndex,
  decodeUnicodeKeyId,
  findDeadTouchKeys,
  parseTouchKeyAddress,
  stripDottedCircle,
  touchKeyAddress,
  touchKeyStateFromLayerId,
  touchSubKeyAddress,
  walkTouchKeysDeep,
} from "@keyboard-studio/contracts";
import {
  decomposeLayerId,
  ensureTouchKeyRule,
  insertBlockBeforeTerminalRules,
  severTouchKey,
  type EnsureTouchKeyRuleOutcome,
  type SeverTouchKeyResult,
} from "@keyboard-studio/engine";
import type {
  IdentityChoiceState,
  PendingKeyEditOperation,
  TouchKeyIdentityRecords,
} from "../stores/workingCopyStore.ts";
import type { BareMarkAllowedByMark } from "../hooks/useBareMarkAllowedByMark.ts";
import { EMPTY_TOUCH_KEY_IDENTITY } from "../stores/workingCopyStore.ts";

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

/** The contracts track vocabulary for the studio's instantiation modes. */
export type TouchIdentityTrack = "creation" | "copy" | "adapt";

/**
 * Map the store's instantiation mode onto the decision-record track:
 * `new-from-base` is the Copy track (Track 1), `adapt-existing` the Adapt
 * track (Track 2), and no instantiation (a from-scratch keyboard) creation.
 */
export function identityTrackFor(
  instantiationMode: "new-from-base" | "adapt-existing" | null,
): TouchIdentityTrack {
  if (instantiationMode === "adapt-existing") return "adapt";
  if (instantiationMode === "new-from-base") return "copy";
  return "creation";
}

// ---------------------------------------------------------------------------
// Record-set helpers (append-only; latest non-superseded governs)
// ---------------------------------------------------------------------------

/** The records value to read/write when the slice is still null. */
export function recordsOrEmpty(
  records: TouchKeyIdentityRecords | null,
): TouchKeyIdentityRecords {
  return records ?? EMPTY_TOUCH_KEY_IDENTITY;
}

/** Ids named by some record's `supersedes` — those records no longer govern. */
function supersededIds(
  records: readonly { readonly recordId: string; readonly supersedes: string | null }[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const r of records) if (r.supersedes !== null) ids.add(r.supersedes);
  return ids;
}

/** Records not superseded by any later record, in append order. */
export function liveRecords<T extends { recordId: string; supersedes: string | null }>(
  records: readonly T[],
): T[] {
  const dead = supersededIds(records);
  return records.filter((r) => !dead.has(r.recordId));
}

/** The latest live record matching `pred`, or undefined. */
export function latestLive<T extends { recordId: string; supersedes: string | null }>(
  records: readonly T[],
  pred: (r: T) => boolean,
): T | undefined {
  const live = liveRecords(records);
  for (let i = live.length - 1; i >= 0; i--) {
    const r = live[i]!;
    if (pred(r)) return r;
  }
  return undefined;
}

/**
 * True when the swallow guard is in force for `mark` (#2374's per-mark
 * replacement for the keyboard-wide guard specification): the box is
 * unticked, or the mark has no box at all (a late-added mark with no
 * survey row takes the unticked default — guarded, blocked).
 *
 * The mark may arrive in keycap form (dotted circle + mark, e.g. "◌̀");
 * the box map is keyed by the bare mark, so the dotted circle is stripped
 * before the lookup — otherwise a ticked box would silently never apply.
 */
export function swallowGuardInForce(
  mark: string,
  bareMarkAllowedByMark?: BareMarkAllowedByMark,
): boolean {
  const bare = mark.replace(/\u25CC/g, "");
  return bareMarkAllowedByMark?.[bare] !== true;
}

/** Append a repair proposal, superseding the live proposal for the same key. */
export function appendRepairProposal(
  records: TouchKeyIdentityRecords | null,
  proposal: Omit<RepairProposal, "supersedes">,
): TouchKeyIdentityRecords {
  const base = recordsOrEmpty(records);
  const prior = latestLive(base.repairProposals, (p) => p.keyRef === proposal.keyRef);
  return {
    ...base,
    repairProposals: [
      ...base.repairProposals,
      { ...proposal, supersedes: prior?.recordId ?? null },
    ],
  };
}

/** Append an identity decision, superseding the live one for the same key. */
export function appendIdentityDecision(
  records: TouchKeyIdentityRecords | null,
  decision: Omit<KeyIdentityDecision, "supersedes">,
): TouchKeyIdentityRecords {
  const base = recordsOrEmpty(records);
  const prior = latestLive(
    base.identityDecisions,
    (d) => d.keyRef === decision.keyRef && d.action === decision.action,
  );
  return {
    ...base,
    identityDecisions: [
      ...base.identityDecisions,
      { ...decision, supersedes: prior?.recordId ?? null },
    ],
  };
}

/** Append a transplant record (transplants are never superseded in place). */
export function appendTransplantRecord(
  records: TouchKeyIdentityRecords | null,
  record: TransplantRecord,
): TouchKeyIdentityRecords {
  const base = recordsOrEmpty(records);
  return { ...base, transplantRecords: [...base.transplantRecords, record] };
}

/** Deterministic record ids for this slice (`<kind>:<subject>:<n>`). */
export function mintRecordId(
  records: TouchKeyIdentityRecords | null,
  kind: "repair" | "decision" | "transplant" | "guard",
  subject: string,
): string {
  const base = recordsOrEmpty(records);
  const n =
    base.repairProposals.length +
    base.identityDecisions.length +
    base.transplantRecords.length +
    base.guardSpecifications.length;
  return `${kind}:${subject}:${n + 1}`;
}

// ---------------------------------------------------------------------------
// Repair rows (T015) — derived from the contracts dead-key scan
// ---------------------------------------------------------------------------

/** One occurrence of a dead key id in the layout, with its edit address. */
export interface DeadKeyOccurrence {
  /** The overlay address: a main-key address, or a subkey address. */
  readonly address: string;
  readonly platformId: string;
  readonly layerId: string;
  /** True when this occurrence is a subkey of `hostKeyId`. */
  readonly isSubKey: boolean;
  readonly hostKeyId?: string;
  /** The host main key's overlay address (subkey occurrences only). */
  readonly hostAddress?: string;
  /** The wire collection the subkey lives in (subkey occurrences only). */
  readonly subKind?: "sk" | "multitap" | "flick";
  /**
   * The id a key-edit op addresses the subkey by (subkey occurrences
   * only): the subkey's own id for `sk`/`multitap`; for `flick`, the
   * direction key of the host's flick record.
   */
  readonly subRefId?: string;
  /**
   * True when a key-edit op can address this occurrence: main keys and
   * depth-1 subkeys. A subkey nested inside another subkey has no
   * single-op address (the op vocabulary addresses one level), so a
   * repair records its answer but applies no op for it.
   */
  readonly addressable: boolean;
}

/** A derived dead-key repair row (one per dead id, anchored at its finding). */
export interface DeadKeyRepairRow {
  /** The finding's address — the row's identity and record keyRef. */
  readonly keyRef: string;
  readonly keyId: string;
  readonly platformId: string;
  /** The layer the finding is anchored on (shown in the row). */
  readonly layerId: string;
  /** Every layer the dead id occurs on. */
  readonly layerIds: readonly string[];
  /** The anchor key's keycap text, as authored. */
  readonly keycapText: string;
  /**
   * The character evidence for what this key should type: the keycap's
   * character (dotted circle stripped), or the T_ suffix's character when
   * the keycap carries none.
   */
  readonly evidenceChar: string | undefined;
  /** The U_ id a convert-to-u repair would rename to, when derivable. */
  readonly convertToId: string | undefined;
  readonly occurrences: readonly DeadKeyOccurrence[];
  /** The FR-009 criteria default, preselected in the row. */
  readonly defaultAction: RepairAction;
  /** The actions offered (FR-009's set; convert only when derivable). */
  readonly options: readonly RepairAction[];
}

/** Combining-mark test for the FR-009 guard rider. */
function isCombiningMark(ch: string): boolean {
  return /\p{M}/u.test(ch);
}

/**
 * The FR-009 default for one dead key:
 *  - convert-to-u when the id suffix parses as the key's character AND —
 *    for a combining mark — no swallow-guard specification is in force
 *    (a U_ key cannot carry the guard; converting would drop it silently);
 *  - else mint-and-rule when there is character evidence to rule;
 *  - else blank (nothing about the key says what it should type).
 * A keycap-less key whose id suffix parses is taken at the id's word: the
 * author named it `T_0031` to mean the "1" key, so the suffix alone
 * qualifies the conversion.
 */
export function deadKeyRepairDefault(args: {
  readonly keyId: string;
  readonly keycapChar: string | undefined;
  readonly convertToId: string | undefined;
  readonly guardSwallowInForce: boolean;
}): { defaultAction: RepairAction; options: readonly RepairAction[]; evidenceChar: string | undefined } {
  const suffixChar =
    args.convertToId !== undefined ? decodeUnicodeKeyId(args.convertToId) : undefined;
  const evidenceChar = args.keycapChar ?? suffixChar;
  const suffixAgrees =
    args.convertToId !== undefined &&
    (args.keycapChar === undefined || suffixChar === args.keycapChar);
  const markBlocked =
    evidenceChar !== undefined && isCombiningMark(evidenceChar) && args.guardSwallowInForce;

  const options: RepairAction[] = [];
  if (args.convertToId !== undefined) options.push("convert-to-u");
  if (evidenceChar !== undefined) options.push("mint-and-rule");
  options.push("blank");

  let defaultAction: RepairAction;
  if (suffixAgrees && !markBlocked) defaultAction = "convert-to-u";
  else if (evidenceChar !== undefined) defaultAction = "mint-and-rule";
  else defaultAction = "blank";
  return { defaultAction, options, evidenceChar };
}

/**
 * Derive the dead-key repair rows for the current working state. Pure: the
 * same (ir, layout, records) always derives the same rows, so track
 * switches and edits re-derive without stored pending state (FR-017).
 */
export function deriveRepairRows(args: {
  readonly ir: KeyboardIR;
  readonly layout: TouchLayoutIR;
  readonly records: TouchKeyIdentityRecords | null;
  /**
   * The per-mark "start of line" box (#2374), when the caller can supply
   * it. Absent (e.g. a host that never read the survey answers) every
   * mark takes the unticked default — guarded, blocked.
   */
  readonly bareMarkAllowedByMark?: BareMarkAllowedByMark;
}): DeadKeyRepairRow[] {
  const ruleIndex: TouchKeyRuleIndex = buildTouchKeyRuleIndex(args.ir);
  const findings = findDeadTouchKeys({ ir: args.ir, layout: args.layout, ruleIndex });

  // Every occurrence of every key id, in walk order, with overlay addresses,
  // plus each id's first main-key keycap text (the FR-009 evidence source).
  const occurrencesById = new Map<string, DeadKeyOccurrence[]>();
  const keycapById = new Map<string, string>();
  walkTouchKeysDeep(args.layout, (ctx) => {
    if (ctx.path.length === 0 && !keycapById.has(ctx.key.id)) {
      keycapById.set(ctx.key.id, ctx.key.text ?? "");
    }
    const list = occurrencesById.get(ctx.key.id) ?? [];
    if (ctx.path.length === 0) {
      list.push({
        address: touchKeyAddress(ctx.platform.id, ctx.layer.id, ctx.key.id, ctx.occurrence),
        platformId: ctx.platform.id,
        layerId: ctx.layer.id,
        isSubKey: false,
        addressable: true,
      });
    } else {
      const host = ctx.path[0]!;
      const parent = ctx.path[ctx.path.length - 1]!;
      let subKind: "sk" | "multitap" | "flick";
      let subRefId = ctx.key.id;
      if ((parent.sk ?? []).some((s) => s === ctx.key)) {
        subKind = "sk";
      } else if ((parent.multitap ?? []).some((s) => s === ctx.key)) {
        subKind = "multitap";
      } else {
        subKind = "flick";
        const direction = Object.entries(parent.flick ?? {}).find(
          ([, v]) => v === ctx.key,
        )?.[0];
        if (direction !== undefined) subRefId = direction;
      }
      const hostAddress = touchKeyAddress(ctx.platform.id, ctx.layer.id, host.id, ctx.occurrence);
      list.push({
        // The address grammar names sk/multitap subkeys; a flick entry has
        // no address of its own, so its occurrence address is the host's
        // (the same anchor the contracts finding uses).
        address:
          subKind === "flick"
            ? hostAddress
            : touchSubKeyAddress(
                ctx.platform.id,
                ctx.layer.id,
                host.id,
                subKind,
                subRefId,
                ctx.occurrence,
              ),
        platformId: ctx.platform.id,
        layerId: ctx.layer.id,
        isSubKey: true,
        hostKeyId: host.id,
        hostAddress,
        subKind,
        subRefId,
        addressable: ctx.path.length === 1,
      });
    }
    occurrencesById.set(ctx.key.id, list);
  });

  const rows: DeadKeyRepairRow[] = [];
  for (const finding of findings) {
    const keyId = String(finding.fields.keyId ?? "");
    const convertFix = finding.fixes.find((f) => f.kind === "convertToUnicodeId");
    const convertToId = convertFix?.kind === "convertToUnicodeId" ? convertFix.toId : undefined;
    const occurrences = occurrencesById.get(keyId) ?? [];
    const keycapText = keycapById.get(keyId) ?? "";
    const keycapChar = keycapText !== "" ? stripDottedCircle(keycapText) : undefined;
    // FR-009's guard rider, per mark (#2374): the swallow guard is in
    // force for this row's evidence mark unless its "start of line" box
    // is ticked. Resolved here (not once per keyboard) because the box is
    // per-mark; `deadKeyRepairDefault` itself only honours it for
    // combining-mark evidence. The evidence char is the keycap char, else
    // the id suffix's char — the same char `deadKeyRepairDefault` judges.
    const suffixChar =
      convertToId !== undefined ? decodeUnicodeKeyId(convertToId) : undefined;
    const { defaultAction, options, evidenceChar } = deadKeyRepairDefault({
      keyId,
      keycapChar,
      convertToId,
      guardSwallowInForce: swallowGuardInForce(
        keycapChar ?? suffixChar ?? "",
        args.bareMarkAllowedByMark,
      ),
    });
    rows.push({
      keyRef: finding.address,
      keyId,
      platformId: String(finding.fields.platform ?? ""),
      layerId: String(finding.fields.layerId ?? ""),
      layerIds: [...new Set(occurrences.map((o) => o.layerId))],
      keycapText,
      evidenceChar,
      convertToId,
      occurrences,
      defaultAction,
      options,
    });
  }

  // Answered rows whose finding has RESOLVED stay visible-and-answered
  // (FR-017's row contract; the list component renders the recorded outcome
  // against the row). A successful repair removes the key from
  // `findDeadTouchKeys` — convert renames it, mint gives it a rule, blank
  // makes it a spacer — so a findings-only derivation deletes the row at the
  // exact moment the author answers it, and the recorded outcome has
  // nothing left to render against. Re-derive those rows from the records
  // (which is why records are an input at all). A declined record keeps its
  // live finding row above, so it never reaches here; a record whose key
  // has left the layout entirely (deleted, not repaired) stays buried.
  const liveRefs = new Set(rows.map((r) => r.keyRef));
  const latestByRef = new Map<string, RepairProposal>();
  for (const proposal of liveRecords(recordsOrEmpty(args.records).repairProposals)) {
    latestByRef.set(proposal.keyRef, proposal);
  }
  for (const proposal of latestByRef.values()) {
    if (liveRefs.has(proposal.keyRef)) continue;
    if (proposal.outcome === "unvisited") continue;
    const parts = parseTouchKeyAddress(proposal.keyRef);
    if (parts === undefined || parts.sub !== undefined) continue;
    const keyId = parts.keyId;
    const suffix = /^T_([0-9A-Fa-f]{4,6})$/.exec(keyId)?.[1];
    const convertToId = suffix !== undefined ? `U_${suffix.toUpperCase()}` : undefined;
    const liveId = occurrencesById.has(keyId)
      ? keyId
      : convertToId !== undefined && occurrencesById.has(convertToId)
        ? convertToId
        : undefined;
    if (liveId === undefined) continue;
    const occurrences = occurrencesById.get(liveId) ?? [];
    const keycapText = keycapById.get(liveId) ?? "";
    const keycapChar = keycapText !== "" ? stripDottedCircle(keycapText) : undefined;
    rows.push({
      keyRef: proposal.keyRef,
      keyId,
      platformId: parts.platform,
      layerId: parts.layerId,
      layerIds: [...new Set(occurrences.map((o) => o.layerId))],
      keycapText,
      evidenceChar:
        keycapChar ?? (convertToId !== undefined ? decodeUnicodeKeyId(convertToId) : undefined),
      convertToId,
      occurrences,
      defaultAction: proposal.defaultAction,
      options: proposal.options,
    });
  }
  return rows;
}

/** The recorded outcome governing a row, if the author already answered it. */
export function repairOutcomeFor(
  records: TouchKeyIdentityRecords | null,
  keyRef: string,
): RepairProposal | undefined {
  return latestLive(recordsOrEmpty(records).repairProposals, (p) => p.keyRef === keyRef);
}

// ---------------------------------------------------------------------------
// Repair application
// ---------------------------------------------------------------------------

/**
 * The key-edit ops a convert-to-u or blank repair applies — one op per
 * occurrence of the dead id. Mint-and-rule is NOT an op (it writes a rule
 * into the IR); use {@link mintRuleForRepair}.
 */
export function repairApplyOps(
  row: DeadKeyRepairRow,
  action: RepairAction,
): PendingKeyEditOperation[] {
  if (action === "mint-and-rule") return [];
  const ops: PendingKeyEditOperation[] = [];
  for (const occ of row.occurrences) {
    if (!occ.addressable) continue;
    if (!occ.isSubKey) {
      ops.push(
        action === "convert-to-u"
          ? { kind: "rename", address: occ.address, toId: row.convertToId! }
          : { kind: "suppress", address: occ.address, spClass: 10, sentinelId: "T_BLANK" },
      );
    } else {
      // Subkey ops address the HOST key plus a sub ref (engine
      // keyEditOps.ts) — the sub ref's id is the subkey's own id for
      // sk/multitap and the flick direction for flick entries.
      const sub = { kind: occ.subKind!, id: occ.subRefId! };
      ops.push(
        action === "convert-to-u"
          ? {
              kind: "setSubKey",
              address: occ.hostAddress!,
              sub,
              fields: { id: row.convertToId! },
            }
          : { kind: "removeSubKey", address: occ.hostAddress!, sub },
      );
    }
  }
  return ops;
}

/**
 * Mint-and-rule application: ensure a producing rule for the dead id, at
 * the anchor layer's modifier combo, typing the row's evidence character.
 * Returns the engine outcome — a blocked outcome (e.g. the opaque-key
 * acknowledgement gate) is the caller's to surface, unapplied.
 */
export function mintRuleForRepair(args: {
  readonly ir: KeyboardIR;
  readonly row: DeadKeyRepairRow;
  readonly opaqueAcknowledged?: boolean;
}): EnsureTouchKeyRuleOutcome {
  const decomposition = decomposeLayerId(args.row.layerId);
  const combo = decomposition.kind === "parsed" ? decomposition.tokens : [];
  return ensureTouchKeyRule(
    args.ir,
    buildTouchKeyRuleIndex(args.ir),
    {
      keyId: args.row.keyId,
      combo,
      outputText: args.row.evidenceChar ?? "",
    },
    { opaqueAcknowledged: args.opaqueAcknowledged ?? false },
  );
}

// ---------------------------------------------------------------------------
// Track 2 identity choices (T016)
// ---------------------------------------------------------------------------

/**
 * The severance plan for an editor-triggered identity change:
 * `severTouchKey` run against the PRE-commit working state. Pre-commit is
 * the only faithful state for the plan: `severTouchKey` refuses a target
 * id that already names a key or rule, and after the assignment commit
 * the target legitimately exists (it is the key being severed TO). The
 * FR-016 refusal collapse is read from this plan before the choice is
 * presented; on a sever answer the plan's transplanted IR is composed
 * with the panel's own synthesis via {@link mergeSeveranceWithSynthesis}.
 */
export interface InlineSeverancePlan {
  readonly sourceId: string;
  readonly targetId: string;
  readonly platformId: string;
  readonly anchorLayerId: string;
  /** The speculative result — `record.outcome` decides the choice shape. */
  readonly speculative: SeverTouchKeyResult;
  /** The refusing binding's id, when the transplant refused (FR-016). */
  readonly refusalBinding: string | undefined;
}

export function planInlineSeverance(args: {
  readonly ir: KeyboardIR;
  readonly layout: TouchLayoutIR;
  readonly platformId: string;
  readonly anchorLayerId: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly track: KeyIdentityDecision["track"];
  /** Decision provenance for the transplant's own records (FR-016). */
  readonly proposer?: "criteria" | "author";
  readonly authorAnswer?: string;
}): InlineSeverancePlan {
  const speculative = severTouchKey(
    args.ir,
    args.layout,
    buildTouchKeyRuleIndex(args.ir),
    {
      sourceId: args.sourceId,
      targetId: args.targetId,
      platformId: args.platformId,
      anchorLayerId: args.anchorLayerId,
      track: args.track,
      ...(args.proposer !== undefined ? { proposer: args.proposer } : {}),
      ...(args.authorAnswer !== undefined ? { authorAnswer: args.authorAnswer } : {}),
    },
  );
  return {
    sourceId: args.sourceId,
    targetId: args.targetId,
    platformId: args.platformId,
    anchorLayerId: args.anchorLayerId,
    speculative,
    refusalBinding:
      speculative.record.outcome === "refused" ? speculative.record.refusalBinding : undefined,
  };
}

/** True when the key carries any rule binding (a severance can transplant). */
export function keyHasRuleBindings(
  ir: KeyboardIR,
  keyId: string,
): boolean {
  const index = buildTouchKeyRuleIndex(ir);
  return bindingsForKeyId(index, keyId).length > 0;
}

/**
 * Compose a completed severance transplant with the AssignPanel's own rule
 * synthesis for the same edit (T016's commit-time composition).
 *
 * The transplant is planned against the PRE-commit IR (the only state in
 * which `severTouchKey`'s target-collision guard is meaningful — after the
 * panel's commit the target legitimately exists). The panel's synthesis
 * (`nextIr`, also derived from the pre-commit IR) is then overlaid onto
 * the transplanted IR:
 *
 *  - stores the synthesis minted are appended;
 *  - rules the synthesis updated in place replace their transplanted
 *    counterparts by node id;
 *  - rules the synthesis created are inserted with the engine's own
 *    terminal-insertion primitive, the placement the synthesis itself
 *    uses;
 *  - a transplanted clone at a combo the edit redefined is dropped: at
 *    the states the author actually redefined, the author's new
 *    production is the behaviour, and a clone of the source's old rule at
 *    the same combo would shadow it (rules beat the U_ decode and
 *    earlier rules beat later ones). The redefined combos are the ones
 *    the synthesis produced for the target — plus, for a U_ target with
 *    no synthesis (the decode path), the anchor layer's own combo, where
 *    the decode must show through. Clones at every other combo stand —
 *    they are what "both halves keep typing" means (US1).
 *
 * The composed result's delta over `baseIr` (standing clones, synthesized
 * rules, minted stores) is stamped `rulesStepAdded` before returning —
 * see {@link stampComposedAdditions} for why the projection depends on it.
 */
export function mergeSeveranceWithSynthesis(args: {
  readonly plan: SeverTouchKeyResult;
  readonly baseIr: KeyboardIR;
  readonly nextIr: KeyboardIR | undefined;
  /** The layer the edit was made on — its state is the decode-supersede combo. */
  readonly anchorLayerId: string;
}): KeyboardIR {
  const { plan, baseIr, nextIr } = args;
  if (plan.record.outcome !== "completed") return plan.ir;
  const targetId = plan.record.targetId;

  const panelCombos = new Set<string>();
  if (nextIr !== undefined) {
    const nextIndex = buildTouchKeyRuleIndex(nextIr);
    for (const b of bindingsForKeyId(nextIndex, targetId)) {
      panelCombos.add(b.modifiers.join(" "));
    }
  }
  const anchorState = touchKeyStateFromLayerId(args.anchorLayerId);
  const anchorWords = new Set<string>(anchorState.modifiers.map((w) => w.toUpperCase()));
  if (anchorState.caps === true) anchorWords.add("CAPITAL");
  const isAnchorCombo = (modifiers: readonly string[]): boolean => {
    const words = new Set(
      modifiers.map((m) => m.toUpperCase()).filter((m) => m !== "NCAPS"),
    );
    return words.size === anchorWords.size && [...words].every((w) => anchorWords.has(w));
  };
  const decodeSupersedes =
    nextIr === undefined &&
    targetId.startsWith("U_") &&
    decodeUnicodeKeyId(targetId) !== undefined;

  const cloneIds = new Set(plan.record.clonedRuleNodeIds.map((c) => c.cloneNodeId));
  const dropIds = new Set<string>();
  if (cloneIds.size > 0 && (panelCombos.size > 0 || decodeSupersedes)) {
    const planIndex = buildTouchKeyRuleIndex(plan.ir);
    for (const b of bindingsForKeyId(planIndex, targetId)) {
      if (!cloneIds.has(b.ruleNodeId)) continue;
      if (panelCombos.has(b.modifiers.join(" "))) dropIds.add(b.ruleNodeId);
      else if (decodeSupersedes && isAnchorCombo(b.modifiers)) dropIds.add(b.ruleNodeId);
    }
  }
  if (nextIr === undefined) {
    if (dropIds.size === 0) return stampComposedAdditions(plan.ir, baseIr);
    return stampComposedAdditions(
      {
        ...plan.ir,
        groups: plan.ir.groups.map((g) => ({
          ...g,
          rules: g.rules.filter((r) => !dropIds.has(r.nodeId)),
        })),
      },
      baseIr,
    );
  }

  const baseGroups = new Map(baseIr.groups.map((g) => [g.nodeId, g]));
  const groups = plan.ir.groups.map((group) => {
    const baseGroup = baseGroups.get(group.nodeId);
    const nextGroup = nextIr.groups.find((g) => g.nodeId === group.nodeId);
    if (baseGroup === undefined || nextGroup === undefined) {
      return dropIds.size > 0
        ? { ...group, rules: group.rules.filter((r) => !dropIds.has(r.nodeId)) }
        : group;
    }
    const baseById = new Map(baseGroup.rules.map((r) => [r.nodeId, r]));
    const nextById = new Map(nextGroup.rules.map((r) => [r.nodeId, r]));
    let rules = group.rules.filter((r) => !dropIds.has(r.nodeId));
    rules = rules.map((r) => {
      const next = nextById.get(r.nodeId);
      const base = baseById.get(r.nodeId);
      return next !== undefined && base !== undefined && next !== base ? next : r;
    });
    const newRules = nextGroup.rules.filter((r) => !baseById.has(r.nodeId));
    if (newRules.length > 0) {
      rules = insertBlockBeforeTerminalRules(rules, newRules);
    }
    return { ...group, rules };
  });

  const baseStoreIds = new Set(baseIr.stores.map((s) => s.nodeId));
  const addedStores = nextIr.stores.filter((s) => !baseStoreIds.has(s.nodeId));
  return stampComposedAdditions(
    {
      ...plan.ir,
      groups,
      stores: addedStores.length > 0 ? [...plan.ir.stores, ...addedStores] : plan.ir.stores,
    },
    baseIr,
  );
}

/**
 * Stamp every rule/store the composition ADDED over the base IR with
 * `rulesStepAdded` — the marker the VFS projection's additions seam
 * (`deriveRuleAdditions` / `spliceRuleAdditions`, spec 082) collects.
 *
 * The working IR is never emitted into the preview or the download
 * directly; the projection rebuilds the artifact from the base IR plus
 * replayable overlays, and the additions seam is the only channel a
 * working-IR rule reaches it through. Unstamped, the transplant's clones
 * and the panel's synthesized guard/producing rules existed only in the
 * editor's model: the compiled preview keyboard had no guard at all, and
 * the sibling rename ops' mechanical rule fix-up (projection step 1.7b)
 * rewrote the SOURCE key's producing rule onto the new id instead — a
 * guarded T_0301 minted from K_1 typed K_1's "&" (walk 1's OSK failure).
 *
 * The double-projection hazard the seam's marker discipline guards
 * against (spec 082: a rule replayed by its own overlay must not also be
 * spliced) does not apply here: no overlay replays these rules — step
 * 1.7b handles only pure renames, and it skips a rename whose target the
 * additions already bind. Returns `merged` itself when nothing was added,
 * so a no-op composition keeps its identity.
 */
function stampComposedAdditions(merged: KeyboardIR, baseIr: KeyboardIR): KeyboardIR {
  const baseRuleIds = new Set<string>();
  for (const g of baseIr.groups) {
    for (const r of g.rules) baseRuleIds.add(r.nodeId);
  }
  const baseStoreIds = new Set(baseIr.stores.map((s) => s.nodeId));
  let changed = false;
  const groups = merged.groups.map((g) => {
    let groupChanged = false;
    const rules = g.rules.map((r) => {
      if (!baseRuleIds.has(r.nodeId) && r.rulesStepAdded !== true) {
        groupChanged = true;
        return { ...r, rulesStepAdded: true as const };
      }
      return r;
    });
    if (groupChanged) {
      changed = true;
      return { ...g, rules };
    }
    return g;
  });
  const stores = merged.stores.map((s) => {
    if (!baseStoreIds.has(s.nodeId) && s.rulesStepAdded !== true) {
      changed = true;
      return { ...s, rulesStepAdded: true as const };
    }
    return s;
  });
  return changed ? { ...merged, groups, stores } : merged;
}

/** The platform/layer parts of an overlay address, for severance requests. */
export function addressParts(address: string): { platformId: string; layerId: string; keyId: string } | undefined {
  const parts = parseTouchKeyAddress(address);
  if (parts === undefined) return undefined;
  return { platformId: parts.platform, layerId: parts.layerId, keyId: parts.keyId };
}

/**
 * The identity decision that describes the key at `address` — the durable
 * record the key inspector's provenance shows (T016). Decisions are
 * recorded against the SOURCE address (the key as it was when the choice
 * was made), so a severed key — now living under its target id — is
 * resolved through its transplant record.
 */
export function identityDecisionForAddress(
  records: TouchKeyIdentityRecords | null,
  address: string,
): KeyIdentityDecision | undefined {
  const all = recordsOrEmpty(records);
  const direct = latestLive(all.identityDecisions, (d) => d.keyRef === address);
  if (direct !== undefined) return direct;
  const parts = parseTouchKeyAddress(address);
  if (parts === undefined) return undefined;
  let found: KeyIdentityDecision | undefined;
  for (const record of all.transplantRecords) {
    if (record.outcome !== "completed" || record.targetId !== parts.keyId) continue;
    const decision = latestLive(
      all.identityDecisions,
      (d) =>
        d.keyRef.startsWith(`${parts.platform}:`) && d.keyRef.endsWith(`:${record.sourceId}`),
    );
    if (decision !== undefined) found = decision;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Inline-choice decline suppression (FR-017)
// ---------------------------------------------------------------------------

/**
 * A fingerprint of everything a severance of `sourceId` would transplant:
 * the rules bound to the id, by node id and full serialised content. Two
 * states with the same fingerprint present the author with the identical
 * severance question; any edit to a bound rule (or a binding added /
 * removed) changes it and re-opens the question.
 */
export function identityChoiceFingerprint(ir: KeyboardIR, sourceId: string): string {
  const index = buildTouchKeyRuleIndex(ir);
  const boundIds = [...new Set(bindingsForKeyId(index, sourceId).map((b) => b.ruleNodeId))].sort();
  const ruleByNodeId = new Map<string, unknown>();
  for (const group of ir.groups ?? []) {
    for (const rule of group.rules) ruleByNodeId.set(rule.nodeId, rule);
  }
  const material = boundIds.map((id) => `${id}=${JSON.stringify(ruleByNodeId.get(id) ?? null)}`);
  // djb2 — a change detector, not a security hash.
  let hash = 5381;
  const joined = material.join("|");
  for (let i = 0; i < joined.length; i++) {
    hash = ((hash << 5) + hash + joined.charCodeAt(i)) >>> 0;
  }
  return `${boundIds.length}:${hash.toString(36)}`;
}

/** Pin an answered inline choice to the bindings state it was answered against. */
export function appendIdentityChoiceState(
  records: TouchKeyIdentityRecords | null,
  state: IdentityChoiceState,
): TouchKeyIdentityRecords {
  const base = recordsOrEmpty(records);
  return {
    ...base,
    identityChoiceStates: [...(base.identityChoiceStates ?? []), state],
  };
}

/**
 * The standing answer for an identical inline identity choice, when one
 * exists (FR-017): the author already answered keep-the-link or
 * flag-for-manual for this (address, source → target) against the same
 * bound-rules state, and no newer decision for the key has been recorded
 * since. While this returns a state, the assign path commits the edit as
 * authored WITHOUT re-presenting the choice; a changed fingerprint or a
 * newer decision re-opens the question.
 */
export function standingIdentityChoice(
  records: TouchKeyIdentityRecords | null,
  args: {
    readonly keyRef: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly ir: KeyboardIR;
  },
): IdentityChoiceState | undefined {
  const all = recordsOrEmpty(records);
  const states = all.identityChoiceStates ?? [];
  let candidate: IdentityChoiceState | undefined;
  for (const s of states) {
    if (s.keyRef === args.keyRef && s.sourceId === args.sourceId && s.targetId === args.targetId) {
      candidate = s;
    }
  }
  if (candidate === undefined) return undefined;
  if (candidate.fingerprint !== identityChoiceFingerprint(args.ir, args.sourceId)) {
    return undefined;
  }
  // A newer live decision for the same key, recorded after the pinned
  // answer, retires the suppression — the author's latest word governs.
  const decisions = all.identityDecisions;
  const pinIndex = decisions.findIndex((d) => d.recordId === candidate.decisionRecordId);
  if (pinIndex >= 0) {
    const superseded = supersededIds(decisions);
    for (let i = pinIndex + 1; i < decisions.length; i++) {
      const d = decisions[i]!;
      if (d.keyRef === candidate.keyRef && !superseded.has(d.recordId)) return undefined;
    }
  }
  return candidate;
}
