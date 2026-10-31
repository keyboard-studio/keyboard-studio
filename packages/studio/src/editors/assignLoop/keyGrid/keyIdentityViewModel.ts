// keyIdentityViewModel — the FR-025 (spec 104) display model for one touch
// key's identity: which criterion (contracts §2 arm) explains its id form,
// what it produces in every state it is exercised in, the recorded decisions
// behind that identity, and whether FR-029 re-linking is currently offered.
//
// PURE and store-free, like every sibling in this directory: the caller
// (TouchGallery) hands in the working IR, the rule index built from it, the
// effective layout, and whatever identity records the working copy carries.
// Every production verdict comes from the ONE resolver
// (`resolveTouchProduction`, contracts) and every criterion verdict from the
// ONE decision table (`decideKeyIdForm`, contracts) — this module derives
// the table's INPUTS from the resolver's outputs and composes the results;
// it re-derives no production and no criterion of its own (FR-003).
//
// ## Recorded decisions win over derivation
//
// When a `KeyIdentityDecision` exists for the key, its `criterion` is the
// answer the panel shows — the decision is the historical fact of why the
// key has this form, and a fresh derivation could disagree with history
// (the keyboard has been edited since). Derivation is the fallback for the
// common case of an imported or freshly scaffolded keyboard, which carries
// no records at all: there, the key's CURRENT state is run through the
// decision table and the table's own `reason` — authored to be shown
// verbatim on an FR-025 surface — becomes the panel's explanation.
//
// ## Which decisions belong to a key
//
// A severance decision is recorded against the SOURCE id's address
// (`<platform>:<anchorLayer>:<sourceId>` — see engine's severTouchKey), but
// by the time the author selects the key it carries the TARGET id. Matching
// is therefore threefold, all within the selected platform:
//   1. the decision's keyRef IS the selected occurrence's address;
//   2. the decision's keyRef names the selected key's current id (any layer);
//   3. the decision is the companion of the key's transplant record
//      (`<transplantRecordId>:decision`, the engine's own convention), or
//      names the transplant's source id on the anchor platform.
// The chain is then supersede-resolved: a decision another decision in the
// set supersedes is history, not the current verdict — but it still shows
// in the provenance list, newest first, because FR-025 asks for provenance,
// not just the latest word.

import {
  bindingsForKeyId,
  decideKeyIdForm,
  isFrameKeyClass,
  isSpacerKeyClass,
  resolveTouchProduction,
  touchKeyStateFromLayerId,
  type KeyIdentityDecision,
  type KeyboardIR,
  type TouchKeyIR,
  type TouchKeyProduction,
  type TouchKeyRole,
  type TouchKeyRuleIndex,
  type TouchKeyState,
  type TouchLayoutIR,
  type TransplantRecord,
} from "@keyboard-studio/contracts";

import type { BareMarkAllowedByMark } from "../../../hooks/useBareMarkAllowedByMark.ts";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type KeyIdForm = "K_" | "T_" | "U_" | "other";

/** One row of the FR-025 production table: one layer the key occurs on. */
export interface KeyProductionRow {
  readonly layerId: string;
  /** The modifier/Lstate the layer's name encodes (FR-001). */
  readonly state: TouchKeyState;
  /** Human label for the state, e.g. "state 0", "SHIFT", "SHIFT + CAPS". */
  readonly stateLabel: string;
  readonly production: TouchKeyProduction;
  /** True when this occurrence is a sub-key (longpress/multitap/flick) of another key. */
  readonly viaSubkey: boolean;
}

export interface KeyIdentityCriterion {
  /** Where the verdict came from: a recorded decision, or a fresh derivation. */
  readonly source: "recorded" | "derived";
  /** The contracts §2 arm ("0", "a", …) or the governing FR ("FR-008", …). */
  readonly criterion: string;
  /** The recorded action, present iff `source` is "recorded". */
  readonly action?: KeyIdentityDecision["action"];
  /** The explanation, fit to show verbatim (decideKeyIdForm's reason, or composed from the record). */
  readonly detail: string;
}

/** FR-029 re-link eligibility for the selected key. */
export interface KeyRelinkOffer {
  /** The completed transplant this re-link would consume (data-model.md §5). */
  readonly record: TransplantRecord;
  /** The K_ id the key would return to (`record.sourceId`). */
  readonly sourceId: string;
}

export interface KeyIdentityViewModel {
  /** The FR-001 occurrence address of the selected key. */
  readonly keyRef: string;
  readonly keyId: string;
  readonly form: KeyIdForm;
  readonly criterion: KeyIdentityCriterion;
  /** One row per layer (on the selected platform) the key occurs on. */
  readonly productionRows: readonly KeyProductionRow[];
  /** Recorded decisions about this key, newest first (superseded included — provenance). */
  readonly decisions: readonly KeyIdentityDecision[];
  /** The key's transplant record (latest, supersede-resolved), when one exists. */
  readonly transplant?: TransplantRecord;
  /**
   * The key's combining-mark "start of line" box state — the per-mark
   * #2374 replacement for the keyboard-wide guard specification's display.
   * Present only when the caller supplied the box map and the key types a
   * combining mark.
   */
  readonly bareMarkAllowed?: boolean;
  /** Present iff FR-029 re-linking is offered for this key right now. */
  readonly relink?: KeyRelinkOffer;
}

export interface BuildKeyIdentityViewModelInputs {
  readonly ir: KeyboardIR;
  readonly ruleIndex: TouchKeyRuleIndex;
  readonly layout: TouchLayoutIR;
  readonly platformId: string;
  /** The containing layer of the selected occurrence. */
  readonly layerId: string;
  /** The selected occurrence's key object. */
  readonly key: TouchKeyIR;
  readonly decisions?: readonly KeyIdentityDecision[];
  readonly transplants?: readonly TransplantRecord[];
  /**
   * The per-mark "start of line" box (#2374), when the caller can supply
   * it. The criterion derivation resolves the key's own mark against it;
   * absent, every mark takes the unticked default.
   */
  readonly bareMarkAllowedByMark?: BareMarkAllowedByMark;
  /** The FR-002 target host set in force; recorded decisions carry their own. Default `["US"]`. */
  readonly hostSet?: readonly string[];
  /** The keyboard's `&VERSION`, for the decision table's arm (c)/(c′) split. */
  readonly keyboardVersion?: string;
}

// ---------------------------------------------------------------------------
// Small derivations
// ---------------------------------------------------------------------------

function idForm(id: string): KeyIdForm {
  const upper = id.toUpperCase();
  if (upper.startsWith("K_")) return "K_";
  if (upper.startsWith("T_")) return "T_";
  if (upper.startsWith("U_")) return "U_";
  return "other";
}

/** "state 0" / "SHIFT" / "RALT + CAPS" — the state a layer name encodes, in words. */
export function stateLabel(state: TouchKeyState): string {
  const words = [...state.modifiers];
  if (state.caps === true) words.push("CAPS");
  return words.length === 0 ? "state 0" : words.join(" + ");
}

/** Every occurrence of `keyId` on one platform, layer by layer (first per layer wins). */
function occurrencesOnPlatform(
  layout: TouchLayoutIR,
  platformId: string,
  keyId: string,
): { layerId: string; key: TouchKeyIR; viaSubkey: boolean }[] {
  const platform = layout.platforms.find((p) => p.id === platformId);
  if (platform === undefined) return [];
  const wanted = keyId.toUpperCase();
  const out: { layerId: string; key: TouchKeyIR; viaSubkey: boolean }[] = [];
  const visit = (
    key: TouchKeyIR,
    layerId: string,
    viaSubkey: boolean,
    sink: { layerId: string; key: TouchKeyIR; viaSubkey: boolean }[],
  ) => {
    if (key.id.toUpperCase() === wanted) sink.push({ layerId, key, viaSubkey });
    for (const sub of key.sk ?? []) visit(sub, layerId, true, sink);
    for (const sub of key.multitap ?? []) visit(sub, layerId, true, sink);
    if (key.flick) {
      for (const sub of Object.values(key.flick)) {
        if (sub) visit(sub, layerId, true, sink);
      }
    }
  };
  for (const layer of platform.layers) {
    const found: { layerId: string; key: TouchKeyIR; viaSubkey: boolean }[] = [];
    for (const row of layer.rows) {
      for (const key of row.keys) visit(key, layer.id, false, found);
    }
    // One row per layer: production is a function of (id, state, key fields);
    // same-id occurrences on one layer share the state, and the first
    // occurrence's fields (nextlayer/sp) are the layer's representative.
    if (found.length > 0) out.push(found[0]!);
  }
  return out;
}

/** Two production records are the same behaviour iff their entry sets match exactly. */
function productionsEqual(a: TouchKeyProduction, b: TouchKeyProduction): boolean {
  if (a.source !== b.source) return false;
  const key = (p: TouchKeyProduction) =>
    p.productions
      .map((e) => {
        const o = e.output;
        const out =
          o.kind === "text"
            ? `text:${o.text}`
            : o.kind === "deadkey"
              ? `deadkey:${o.name}`
              : o.kind === "layerSwitch"
                ? `layer:${o.layerId}`
                : o.kind;
        return `${out}|${e.condition ?? ""}|${e.viaFallback === true ? "fb" : ""}`;
      })
      .sort()
      .join(";");
  return key(a) === key(b);
}

const ALL_MARKS_RE = /^\p{M}+$/u;

interface DerivedFacts {
  readonly form: KeyIdForm;
  readonly ruled: boolean;
  readonly roles: ReadonlySet<TouchKeyRole>;
  readonly plainOutput?: string;
  readonly ruleLogicRequired: boolean;
  /**
   * A producing-class T_ key whose production is `none` in every exercised
   * state — the FR-009 dead key. Judged on ENTRY kinds, not the record
   * source: a layer-switch key's record also carries source "none", but its
   * entry is a layerSwitch, and it is not dead.
   */
  readonly dead: boolean;
}

/** Facts about the key's current state, derived from resolver outputs only. */
function deriveFacts(
  inputs: BuildKeyIdentityViewModelInputs,
  rows: readonly KeyProductionRow[],
): DerivedFacts {
  const { key, ruleIndex } = inputs;
  const form = idForm(key.id);
  const ruled = bindingsForKeyId(ruleIndex, key.id).length > 0;

  const roles = new Set<TouchKeyRole>();
  const anyRuleProduction = rows.some((r) => r.production.source === "rule");
  const anyTextOrDeadkey = rows.some((r) =>
    r.production.productions.some((e) => e.output.kind === "text" || e.output.kind === "deadkey"),
  );
  if (isSpacerKeyClass(key.sp)) roles.add("spacer");
  else if (isFrameKeyClass(key.sp)) roles.add("frame");
  // Producer is a role the key FILLS, not only one it currently succeeds at:
  // a dead T_ key (FR-009) produces nothing anywhere, yet it is a producer
  // by position and keycap — inferring "non-producing" from its silence
  // would misclassify it as frame class (arm e) and hide the finding.
  const producerByIntent =
    !roles.has("spacer") &&
    !roles.has("frame") &&
    // A key whose only behaviour is a layer switch is a switch key even when
    // its keycap shows a character (basic_kbdus's T_0031 is labelled "1" and
    // jumps back to default) — the switch role, not the label, governs.
    !(key.nextlayer !== undefined && key.nextlayer.length > 0) &&
    ((key.text !== undefined && key.text.length > 0 && !key.text.startsWith("*")) ||
      (key.output !== undefined && key.output.length > 0));
  if (anyTextOrDeadkey || anyRuleProduction || producerByIntent) roles.add("producer");
  if (key.nextlayer !== undefined && key.nextlayer.length > 0) roles.add("layer-switch");
  const subkeyCount =
    (key.sk?.length ?? 0) +
    (key.multitap?.length ?? 0) +
    (key.flick ? Object.values(key.flick).filter(Boolean).length : 0);
  if (subkeyCount > 0) roles.add("subkey-host");

  // The fixed output an unruled key types, when every exercised state agrees
  // on exactly one text production (the U_ decode / K_ fallback / `output`
  // cases). Disagreement means there is no single plain output to name.
  let plainOutput: string | undefined;
  if (!ruled) {
    const texts = new Set<string>();
    for (const row of rows) {
      for (const entry of row.production.productions) {
        if (entry.output.kind === "text") texts.add(entry.output.text);
      }
    }
    if (texts.size === 1) plainOutput = [...texts][0];
  }

  const ruleLogicRequired =
    anyRuleProduction ||
    rows.some((r) => r.production.contextConditional) ||
    rows.some((r) => r.production.productions.some((e) => e.output.kind === "deadkey"));

  const dead =
    form === "T_" &&
    roles.has("producer") &&
    rows.length > 0 &&
    rows.every((r) => r.production.productions.every((e) => e.output.kind === "none"));

  return {
    form,
    ruled,
    roles,
    ...(plainOutput !== undefined ? { plainOutput } : {}),
    ruleLogicRequired,
    dead,
  };
}

/**
 * Run the key's current state through the contracts §2 decision table.
 * Inputs are derived from resolver outputs only (see the module doc).
 */
function deriveCriterion(
  inputs: BuildKeyIdentityViewModelInputs,
  facts: DerivedFacts,
): KeyIdentityCriterion {
  const { key } = inputs;
  const { form, ruled, roles, plainOutput, ruleLogicRequired } = facts;

  const decision = decideKeyIdForm({
    roles: [...roles],
    // A K_-linked key: the panel cannot judge DESIRED behaviour, only the
    // current one — "undecidable" is the table's own keep-the-link verdict
    // (FR-004 non-interference). A severed/converted key's equality question
    // is FR-029's, answered by `relink` below, never re-decided here (the
    // table's own doc says the same).
    ...(form === "K_" ? { behaviourVsPhysical: "undecidable" as const } : {}),
    ...(ruleLogicRequired ? { ruleLogicRequired: true } : {}),
    ...(form !== "other"
      ? { existingIdentity: { id: key.id, form, ruled } }
      : {}),
    ...(plainOutput !== undefined ? { plainOutput } : {}),
    ...(plainOutput !== undefined && ALL_MARKS_RE.test(plainOutput)
      ? {
          isCombiningMark: true,
          // Per-mark #2374: the key's own mark resolved against the box
          // map; absent map (or absent mark entry) reads as unticked.
          bareMarkAllowed: inputs.bareMarkAllowedByMark?.[plainOutput] === true,
        }
      : {}),
    ...(inputs.keyboardVersion !== undefined
      ? { keyboardVersion: inputs.keyboardVersion }
      : {}),
  });

  return { source: "derived", criterion: decision.arm, detail: decision.reason };
}

// ---------------------------------------------------------------------------
// Record matching
// ---------------------------------------------------------------------------

function keyRefParts(keyRef: string): { platform: string; keyId: string } | undefined {
  const parts = keyRef.split(":");
  if (parts.length < 3) return undefined;
  return { platform: parts[0]!, keyId: parts[parts.length - 1]!.replace(/#\d+$/, "") };
}

/** Latest record of a supersede chain (the one nothing in the set supersedes). */
function chainHead<T extends { recordId: string; supersedes: string | null; recordedAt: number }>(
  records: readonly T[],
): T | undefined {
  if (records.length === 0) return undefined;
  const supersededIds = new Set(records.map((r) => r.supersedes).filter((s) => s !== null));
  const heads = records.filter((r) => !supersededIds.has(r.recordId));
  const pool = heads.length > 0 ? heads : [...records];
  return pool.sort((a, b) => b.recordedAt - a.recordedAt)[0];
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildKeyIdentityViewModel(
  inputs: BuildKeyIdentityViewModelInputs,
): KeyIdentityViewModel {
  const { ir, ruleIndex, layout, platformId, layerId, key } = inputs;
  const form = idForm(key.id);
  const keyRef = `${platformId}:${layerId}:${key.id}`;

  const occurrences = occurrencesOnPlatform(layout, platformId, key.id);
  // The selected occurrence itself is always a row, even if the layout the
  // caller passed does not contain it (a stale layout must degrade the table,
  // never empty it).
  if (!occurrences.some((o) => o.layerId === layerId)) {
    occurrences.unshift({ layerId, key, viaSubkey: false });
  }
  const productionRows: KeyProductionRow[] = occurrences.map((occ) => {
    const state = touchKeyStateFromLayerId(occ.layerId);
    return {
      layerId: occ.layerId,
      state,
      stateLabel: stateLabel(state),
      production: resolveTouchProduction({ ir, ruleIndex }, occ.key, state),
      viaSubkey: occ.viaSubkey,
    };
  });

  // The key's transplant: the latest record (chain head) whose target is
  // this id. A refused record is kept too — its refusal is provenance.
  const allTransplants = inputs.transplants ?? [];
  const ownTransplants = allTransplants.filter(
    (tr) => tr.targetId.toUpperCase() === key.id.toUpperCase(),
  );
  const transplant = chainHead(ownTransplants);

  // Decisions about this key (see the module doc's threefold matching).
  const allDecisions = inputs.decisions ?? [];
  const decisions = allDecisions
    .filter((d) => {
      if (d.keyRef === keyRef) return true;
      const parts = keyRefParts(d.keyRef);
      if (parts !== undefined && parts.platform === platformId) {
        if (parts.keyId.toUpperCase() === key.id.toUpperCase()) return true;
        if (
          transplant !== undefined &&
          parts.keyId.toUpperCase() === transplant.sourceId.toUpperCase()
        ) {
          return true;
        }
      }
      return transplant !== undefined && d.recordId === `${transplant.recordId}:decision`;
    })
    .sort((a, b) => b.recordedAt - a.recordedAt);
  const currentDecision = chainHead(decisions);

  const facts = deriveFacts(inputs, productionRows);
  const criterion: KeyIdentityCriterion =
    currentDecision !== undefined
      ? {
          source: "recorded",
          criterion: currentDecision.criterion,
          action: currentDecision.action,
          detail: currentDecisionDetail(currentDecision),
        }
      : form === "other"
        ? {
            source: "derived",
            criterion: "unclassified",
            detail:
              "This id is outside the K_/T_/U_ families; no criterion in spec 104 judges it, and no repair or severance may be premised on it.",
          }
        : facts.dead
          ? {
              source: "derived",
              criterion: "FR-009",
              detail:
                "This key produces nothing in any state it appears in — a producing T_ key with no rule is dead in Keyman, and FR-009's repair applies to it.",
            }
          : deriveCriterion(inputs, facts);

  // FR-029: re-linking is offered when a completed transplant exists for
  // this key, no recorded re-link has already consumed it, and arm 0 holds
  // again — the key's current productions equal the source K_ key's in
  // every exercised state (resolver vs resolver, fallbacks included).
  let relink: KeyRelinkOffer | undefined;
  if (
    transplant !== undefined &&
    transplant.outcome === "completed" &&
    !decisions.some(
      (d) => d.action === "relinked" && d.recordId === `decision:relink:${transplant.recordId}`,
    )
  ) {
    const sourceKey: TouchKeyIR = { ...key, id: transplant.sourceId };
    const holdsAgain = productionRows.every((row) =>
      productionsEqual(
        row.production,
        resolveTouchProduction({ ir, ruleIndex }, sourceKey, row.state),
      ),
    );
    if (holdsAgain) relink = { record: transplant, sourceId: transplant.sourceId };
  }

  return {
    keyRef,
    keyId: key.id,
    form,
    criterion,
    productionRows,
    decisions,
    ...(transplant !== undefined ? { transplant } : {}),
    // The key's own mark resolved against the box map, for the identity
    // section's per-mark display (replaces the keyboard-wide guard spec).
    ...(facts.plainOutput !== undefined &&
    ALL_MARKS_RE.test(facts.plainOutput) &&
    inputs.bareMarkAllowedByMark !== undefined
      ? { bareMarkAllowed: inputs.bareMarkAllowedByMark[facts.plainOutput] === true }
      : {}),
    ...(relink !== undefined ? { relink } : {}),
  };
}

/** A recorded decision's panel explanation, composed from the record's own fields. */
function currentDecisionDetail(decision: KeyIdentityDecision): string {
  const by = decision.proposer === "author" ? "the author" : "the criteria";
  switch (decision.action) {
    case "severed":
      return `Severed by ${by} under ${decision.criterion} — the transplanted rules now serve this key alone.`;
    case "relinked":
      return `Re-linked to its physical key by ${by} under ${decision.criterion}; the transplanted rules were deleted.`;
    case "repaired":
      return `Repaired by ${by} under ${decision.criterion} — the key produced nothing before the repair.`;
    case "converted":
      return `Converted by ${by} under ${decision.criterion}.`;
    case "minted":
      return `Minted by ${by} under criterion ${decision.criterion}.`;
    case "kept-by-choice":
      return `Kept as-is by the author's choice under ${decision.criterion}.`;
    case "flagged-manual":
      return `Flagged for manual definition under ${decision.criterion} — the automatic change was refused.`;
    case "kept":
      return `Kept by ${by} under criterion ${decision.criterion}.`;
    default:
      return `Recorded under ${decision.criterion}.`;
  }
}
