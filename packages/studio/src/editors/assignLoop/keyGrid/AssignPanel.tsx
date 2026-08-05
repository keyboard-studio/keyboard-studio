// AssignPanel — assign a character to an existing touch key (spec 058 T085,
// T086, T087; FR-024, FR-025, FR-026; key-id-policy.md §2.1, §5).
//
// Propose-then-confirm (spec.md §3c): everything below the character field
// is a PREVIEW, computed by pure `useMemo`s over the current selection — no
// IR/layout mutation happens anywhere in this file except inside
// `handleSubmit`, and even there only once, on an explicit submit (Enter in
// the field, or the Confirm button — the same native `<form>` submit event
// either way). Nothing writes on render or on selection.
//
// ## Store-free, like every other file in this directory
//
// KeyInspector.tsx / FindPanel.tsx / KeyGrid.tsx take the working IR / layout
// / rule index as PROPS and never import `useWorkingCopyStore` — composition
// into TouchGallery.tsx (which key edit ops actually get committed through
// `commitKeyEdit`, which store field carries the promoted layout for Case A
// vs Case B, etc.) is explicitly documented in those files as a LATER task's
// job, not this one's. This file follows the same discipline: `onCommit`
// fires exactly once per confirmed assignment with everything the caller
// needs (see {@link AssignPanelCommitResult}) — the caller (a future
// TouchGallery wiring task) is responsible for actually calling
// `commitKeyEdit(result.op)` (which itself pushes exactly one undo entry per
// call — see workingCopyStore.ts's own doc on `commitKeyEdit`, so "one undo
// entry per committed edit" falls out of this component firing `onCommit`
// exactly once per confirm, never per keystroke) and for folding
// `result.nextIr` / `result.promotedLayout` into whichever store field
// currently backs the layout (`ir.touchLayout` for Case A, `touchLayoutJson`
// for Case B — a branch this file cannot make on its own without importing
// the store, which would break the established convention).
//
// ## Two write paths bundled into one commit
//
// An assignment can touch up to three things, computed here and handed back
// as one bundle:
//   1. The KEY EDIT overlay op (`kind: "set"`, `fields: { id, text }`) — the
//      layout-side half, always present.
//   2. The `.kmn` RULE, only when the minting path requires one
//      (`ensureTouchKeyRule` for the T_ alternative / multi-codepoint /
//      case-triple paths; `applyGuardSynthesis` for the combining-mark path,
//      which also mints/reuses the guard store) — `result.nextIr`, absent
//      for the ruleless `U_` default.
//   3. PROVENANCE promotion via `promoteKeyAtAddressToHandSet` (T059,
//      address-matched — NOT the id-matched `promoteKeyToHandSet`, which is
//      the by-character flow's own helper and is never touched by this
//      file) — `result.promotedLayout`, always present.
//
// ## The character/U+ field's dual role (FR-024) — a deliberate, documented
// disambiguation rule
//
// `parseUPlusNotation` (which `rawCodepointEntry.ts`'s `parseCodepointInput`
// wraps, reused here rather than re-derived) accepts BARE hex with no "U+"
// prefix — appropriate for the character-map escape hatch it was built for,
// where every input is codepoint notation by construction. This field is
// dual-purpose (a literal character/grapheme cluster OR U+ notation), so bare
// hex is genuinely ambiguous with a literal ASCII mnemonic string typed
// directly (`mintMultiCodepointKeyId`'s own `ASCII_MNEMONIC_RE` row — "FCFA"
// is itself valid hex). `resolveCharacterFieldInput` below resolves this by
// requiring an explicit "U+"/"u+" prefix for the notation reading; anything
// else (including a bare hex-shaped string) is treated as literal text. A
// multi-codepoint grapheme cluster typed or pasted directly is handled
// mechanically identically to a single character (FR-025) — no special case.
//
// ## The character map (FR-024's third affordance)
//
// `CharScrollStrip` (../parts/CharScrollStrip.tsx) is reused verbatim for
// BOTH the "inventory characters offered first" strip and, when the caller
// supplies a broader `characterMapChars` list, a second strip beneath it —
// the closest existing decoupled "click a character to select it" component
// in this codebase, and already the established idiom for exactly this
// interaction (TouchGallery/MechanismGallery's own character walk).
// `CharacterMapPane.tsx` (survey/) was considered and deliberately NOT reused
// here: it accumulates a GROWING list into `phaseBDraftStore` (Phase B's own
// survey state) rather than resolving a single pick, and its rendering
// primitives (`CharacterMapGroupSection`) pull in `useGlyphFontStack`/
// `useFontSupportChecker`, both keyed off that same Phase B font-selection
// store — a real cross-boundary coupling this component has no business
// introducing for an unrelated flow. Documented here as a deliberate scope
// decision, not a missed-reuse oversight; see this task's own report for the
// seam this leaves (a proper decoupled character-map primitive is future
// work, not a re-implementation of the survey one).
//
// ## Case triplication — fully wired (plan/apply, mirroring the guard path)
//
// `proposeKeyId` can request a NCAPS/SHIFT+NCAPS/CAPS trio; `touchRuleSynthesis.ts`
// now exposes `planCaseTripleSynthesis`/`applyCaseTripleSynthesis` (the same
// plan-then-apply split as `planGuardSynthesis`/`applyGuardSynthesis`), gated
// on the SAME `keyHasCapsHandling` predicate the guard path uses. This file
// still never imports `keyIdMinting.ts`'s private `tryBuildCaseTriple` — the
// lower/upper pair the synthesizer needs is derived here from `selectedChar`
// via the same PUBLIC `caseCounterpart` primitive `tryBuildCaseTriple` itself
// calls (mirroring its own `direction === "toUpper" ? ... : ...` split
// exactly), never by parsing the proposal's literal rule-line text back into
// characters. A `proposal.path === "case-triple"` is proposeKeyId's own proof
// that this pair exists and is well-formed; recomputing it independently from
// the same public function is composition, not re-derivation of engine
// internals. `planCaseTripleSynthesis` can still decline per-key
// (`"caps-not-handled"` — a finer check than this panel's own `capsHandled`
// prop, since a keyboard can handle CAPS elsewhere but not yet on THIS key's
// group) or under the opaque gate; both are surfaced as stated reasons and
// block confirm, exactly like the guard path's own "no-repertoire" failure.

import { useId, useMemo, useState, type FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import type { KeyboardIR, TouchKeyRuleIndex, TouchLayoutIR } from "@keyboard-studio/contracts";
import { normalizeTouchKeyId } from "@keyboard-studio/contracts";
import {
  applyCaseTripleSynthesis,
  applyGuardSynthesis,
  caseCounterpart,
  checkOpaqueGate,
  decomposeLayerId,
  ensureTouchKeyRule,
  parseTouchKeyAddress,
  planCaseTripleSynthesis,
  planGuardSynthesis,
  proposeKeyId,
  touchKeyAddress,
  type ApplyCaseTripleSynthesisResult,
  type CaseTriplePlanResult,
  type EnsureTouchKeyRuleOutcome,
  type ApplyGuardSynthesisResult,
  type GuardSynthesisPlanResult,
  type KeyEditOperation,
  type KeyIdMintingAlternativeReason,
  type KeyIdMintingProposal,
  type ModifierToken,
  type NoCaseTripleReason,
} from "@keyboard-studio/engine";
import { promoteKeyAtAddressToHandSet } from "../touchBehavior.ts";
import { CharScrollStrip } from "../parts/CharScrollStrip.tsx";
import { parseCodepointInput } from "../../../survey/characterMap/rawCodepointEntry.ts";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { displayChar } from "../../../lib/irToCarveNodes.ts";
import { RadioGroup, TextField, Checkbox, Button, Notice, type RadioOption } from "../../../ui/index.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { FONT_MONO } from "../../../ui/theme.ts";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// The field's dual literal/notation resolution (see module doc)
// ---------------------------------------------------------------------------

/**
 * Resolve the character/U+ field's current text into a character (or
 * multi-codepoint grapheme cluster) to propose, or `null` when it does not
 * yet resolve to anything (empty, or a "U+"-prefixed string that fails to
 * parse). See the module doc's "field's dual role" section for why a bare
 * hex string is deliberately NOT reinterpreted as notation here.
 */
export function resolveCharacterFieldInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^[Uu]\+/.test(trimmed)) {
    const parsed = parseCodepointInput(trimmed);
    return parsed.ok ? parsed.char : null;
  }
  return trimmed.normalize("NFC");
}

// ---------------------------------------------------------------------------
// "N other layers/platforms already carry this candidate id" (key-id-policy.md
// §2.1) — a plain layout scan, mirroring FindPanel.tsx's own
// platforms->layers->rows->keys walk rather than reaching into engine
// internals for something this shallow.
// ---------------------------------------------------------------------------

function countSharedCandidateOccurrences(
  layout: TouchLayoutIR,
  candidateId: string,
  excludeAddress: string,
): number {
  const target = normalizeTouchKeyId(candidateId);
  let count = 0;
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          if (normalizeTouchKeyId(key.id) !== target) continue;
          if (touchKeyAddress(platform.id, layer.id, key.id) === excludeAddress) continue;
          count++;
        }
      }
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Commit result (T087)
// ---------------------------------------------------------------------------

/** The layout-side half of a commit — append via `commitKeyEdit` exactly once. */
export type AssignPanelSetOp = Omit<Extract<KeyEditOperation, { kind: "set" }>, "seq">;

export interface AssignPanelCommitResult {
  /** Append via `commitKeyEdit` (store-owned; this file never calls it — see module doc). */
  readonly op: AssignPanelSetOp;
  /**
   * The rule-side half, already applied to a COPY of the `ir` prop. Present
   * only when the minting path required a rule (the `T_` alternative,
   * multi-codepoint output, or the combining-mark guard pair); absent for the
   * ruleless `U_` default.
   */
  readonly nextIr?: KeyboardIR;
  /**
   * `layout` with the assigned key promoted to `hand-set` provenance (T059's
   * address-matched `promoteKeyAtAddressToHandSet`) — the caller folds this
   * into whichever store field currently backs the layout.
   */
  readonly promotedLayout: TouchLayoutIR;
  /** The confirmed proposal, echoed for logging/testing. */
  readonly proposal: KeyIdMintingProposal;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AssignPanelProps {
  /** The key being assigned to, or `null` before a selection has settled (mirrors KeyInspector's `selectedCell`). */
  selectedCell: KeyGridCellViewModel | null;
  /** The EFFECTIVE (already overlay-folded) touch layout — for the shared-candidate scan and provenance promotion. */
  layout: TouchLayoutIR;
  /** The working IR — rule synthesis reads this and returns a new IR; never mutated in place. */
  ir: KeyboardIR;
  /** From `buildTouchKeyRuleIndex(ir)`, built once by the caller (matches every sibling in this directory). */
  ruleIndex: TouchKeyRuleIndex;
  /** Inventory characters offered first (FR-024). */
  inventoryChars: readonly string[];
  /** A broader candidate set for the "character map" affordance (FR-024's third option). Omit or empty to skip that section. */
  characterMapChars?: readonly string[];
  /** Does this keyboard already handle CAPS — gates the case-triple checkbox (key-id-policy.md §2). */
  capsHandled: boolean;
  /** BCP47 tag forwarded to `proposeKeyId`'s case-mapping. */
  bcp47?: string;
  /**
   * The keyboard's own repertoire (declared exemplars or discovered
   * inventory) — REQUIRED so a freshly-minted guard store is never a
   * hardcoded ASCII literal (key-id-policy.md §2, contract §6.1). May be
   * empty; a mint then fails with the honest "no-repertoire" outcome rather
   * than silently falling back to one.
   */
  repertoire: readonly string[];
  /** Fired exactly once per confirmed assignment — see {@link AssignPanelCommitResult}. */
  onCommit: (result: AssignPanelCommitResult) => void;
  /** Localized panel accessible name override. */
  label?: string;
}

// ---------------------------------------------------------------------------
// Localized reason sentences (FR-044/FR-051 — composed here, never a literal
// crossing the engine boundary)
// ---------------------------------------------------------------------------

function useAlternativeReasonText(): (reason: KeyIdMintingAlternativeReason) => string {
  const { t } = useLingui();
  return (reason) => {
    if (reason.kind === "shared-candidate") {
      return t({
        id: "editor.assignLoop.keyGrid.assignPanel.alternativeReason.shared",
        message: plural(reason.count, {
          one: "The same id already appears on # other layer or platform, so one rule serves all of them.",
          other: "The same id already appears on # other layers or platforms, so one rule serves all of them.",
        }),
      });
    }
    return t({
      id: "editor.assignLoop.keyGrid.assignPanel.alternativeReason.always",
      message: "One rule here would also serve any other layer or platform that later reuses this id.",
    });
  };
}

function useNoCaseTripleReasonText(): (reason: NoCaseTripleReason) => string {
  const { t } = useLingui();
  return (reason) => {
    switch (reason) {
      case "caps-not-handled":
        return t({
          id: "editor.assignLoop.keyGrid.assignPanel.noCaseTriple.capsNotHandled",
          message: "This keyboard doesn't use CAPS lock, so there's no CAPS layer to add the pair to.",
        });
      case "titlecase-self-third-form":
        return t({
          id: "editor.assignLoop.keyGrid.assignPanel.noCaseTriple.titlecase",
          message:
            "This character is its own third case form (neither upper- nor lowercase), so there's no counterpart to pair it with.",
        });
      case "no-case-counterpart":
        return t({
          id: "editor.assignLoop.keyGrid.assignPanel.noCaseTriple.noCounterpart",
          message: "No uppercase or lowercase counterpart was found for this character.",
        });
      case "combining-mark":
        return t({
          id: "editor.assignLoop.keyGrid.assignPanel.noCaseTriple.combiningMark",
          message: "Combining marks don't have separate case forms.",
        });
      case "not-single-letter":
        return t({
          id: "editor.assignLoop.keyGrid.assignPanel.noCaseTriple.notSingleLetter",
          message: "Case pairing only applies to a single letter, not a multi-character sequence.",
        });
      default: {
        const _exhaustive: never = reason;
        return String(_exhaustive);
      }
    }
  };
}

// ---------------------------------------------------------------------------
// The assignment plan — what would be written, derived from the current
// selection (pure; see module doc, "propose-then-confirm")
// ---------------------------------------------------------------------------

type ChosenPath = "default" | "alternative";

interface AssignmentPlan {
  readonly finalKeyId: string;
  readonly needsRule: boolean;
  readonly guardNeeded: boolean;
  readonly caseTripleNeeded: boolean;
  readonly outputText: string;
}

function planFor(
  proposal: KeyIdMintingProposal,
  chosenPath: ChosenPath,
  outputText: string,
): AssignmentPlan {
  if (proposal.path === "unicode-default") {
    if (chosenPath === "alternative" && proposal.alternative !== undefined) {
      return { finalKeyId: proposal.alternative.id, needsRule: true, guardNeeded: false, caseTripleNeeded: false, outputText };
    }
    return { finalKeyId: proposal.id, needsRule: false, guardNeeded: false, caseTripleNeeded: false, outputText };
  }
  if (proposal.path === "combining-mark-guard") {
    return { finalKeyId: proposal.id, needsRule: true, guardNeeded: true, caseTripleNeeded: false, outputText };
  }
  if (proposal.path === "case-triple") {
    return { finalKeyId: proposal.id, needsRule: true, guardNeeded: false, caseTripleNeeded: true, outputText };
  }
  // "multi-codepoint-string"
  return { finalKeyId: proposal.id, needsRule: true, guardNeeded: false, caseTripleNeeded: false, outputText };
}

/**
 * The lower/upper pair a confirmed case-triple proposal needs, derived from
 * `selectedChar` via the SAME public `caseCounterpart` primitive
 * `keyIdMinting.ts`'s own (private) `tryBuildCaseTriple` calls — see the
 * module doc's "Case triplication" section for why this is composition, not
 * re-derivation. Returns `undefined` when no counterpart exists (should not
 * happen once `proposal.path === "case-triple"` already proved one does, but
 * never assumed — this stays a plain, checked lookup).
 */
function caseTripleCharsFor(
  selectedChar: string,
  bcp47: string | undefined,
): { readonly lowerChar: string; readonly upperChar: string } | undefined {
  const counterpart = caseCounterpart(selectedChar, bcp47);
  if (counterpart === null) return undefined;
  return counterpart.direction === "toUpper"
    ? { lowerChar: selectedChar, upperChar: counterpart.counterpart }
    : { lowerChar: counterpart.counterpart, upperChar: selectedChar };
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export function AssignPanel({
  selectedCell,
  layout,
  ir,
  ruleIndex,
  inventoryChars,
  characterMapChars,
  capsHandled,
  bcp47,
  repertoire,
  onCommit,
  label,
}: AssignPanelProps) {
  const { t } = useLingui();
  const uid = useId();
  const alternativeReasonText = useAlternativeReasonText();
  const noCaseTripleReasonText = useNoCaseTripleReasonText();

  const [charInput, setCharInput] = useState("");
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [chosenPath, setChosenPath] = useState<ChosenPath>("default");
  const [caseTripleRequested, setCaseTripleRequested] = useState(false);
  const [opaqueAcknowledged, setOpaqueAcknowledged] = useState(false);

  function selectChar(ch: string): void {
    setSelectedChar(ch);
    setCharInput(ch);
    setChosenPath("default");
    setOpaqueAcknowledged(false);
  }

  function handleFieldChange(value: string): void {
    setCharInput(value);
    const resolved = resolveCharacterFieldInput(value);
    if (resolved !== selectedChar) {
      setChosenPath("default");
      setOpaqueAcknowledged(false);
    }
    setSelectedChar(resolved);
  }

  const targetParts = useMemo(
    () => (selectedCell !== null ? parseTouchKeyAddress(selectedCell.address) : undefined),
    [selectedCell],
  );

  const targetCombo: readonly ModifierToken[] = useMemo(() => {
    if (targetParts === undefined) return [];
    const decomposition = decomposeLayerId(targetParts.layerId);
    return decomposition.kind === "parsed" ? decomposition.tokens : [];
  }, [targetParts]);

  // Two-pass proposal (see key-id-policy.md §2.1): first learn the candidate
  // `T_` alternative id, then count its occurrences elsewhere in the layout,
  // then re-propose with that count so the alternative's reason is accurate.
  const baseProposal = useMemo(() => {
    if (selectedChar === null) return undefined;
    return proposeKeyId({
      chars: selectedChar,
      capsHandled,
      ...(caseTripleRequested ? { caseTripleRequested } : {}),
      ...(bcp47 !== undefined ? { bcp47 } : {}),
    });
  }, [selectedChar, capsHandled, caseTripleRequested, bcp47]);

  const sharedCandidateCount = useMemo(() => {
    if (baseProposal?.alternative === undefined || selectedCell === null) return undefined;
    return countSharedCandidateOccurrences(layout, baseProposal.alternative.id, selectedCell.address);
  }, [baseProposal, layout, selectedCell]);

  const proposal = useMemo(() => {
    if (selectedChar === null) return undefined;
    return proposeKeyId({
      chars: selectedChar,
      capsHandled,
      ...(caseTripleRequested ? { caseTripleRequested } : {}),
      ...(bcp47 !== undefined ? { bcp47 } : {}),
      ...(sharedCandidateCount !== undefined ? { sharedCandidateCount } : {}),
    });
  }, [selectedChar, capsHandled, caseTripleRequested, bcp47, sharedCandidateCount]);

  const assignmentPlan = useMemo<AssignmentPlan | undefined>(() => {
    if (proposal === undefined || selectedChar === null) return undefined;
    return planFor(proposal, chosenPath, selectedChar);
  }, [proposal, chosenPath, selectedChar]);

  // Preview only — `opaqueAcknowledged: true` here never writes anything
  // (planGuardSynthesis is pure); the REAL gate that governs whether commit
  // is allowed is `opaqueGate` below, computed against the actual flag.
  const guardPreview: GuardSynthesisPlanResult | undefined = useMemo(() => {
    if (assignmentPlan === undefined || !assignmentPlan.guardNeeded) return undefined;
    return planGuardSynthesis(ir, ruleIndex, assignmentPlan.finalKeyId, targetCombo, assignmentPlan.outputText, {
      repertoire,
      opaqueAcknowledged: true,
    });
  }, [assignmentPlan, ir, ruleIndex, targetCombo, repertoire]);

  // The lower/upper pair a confirmed case-triple needs — see caseTripleCharsFor's doc.
  const caseTriplePair = useMemo(() => {
    if (assignmentPlan === undefined || !assignmentPlan.caseTripleNeeded || selectedChar === null) return undefined;
    return caseTripleCharsFor(selectedChar, bcp47);
  }, [assignmentPlan, selectedChar, bcp47]);

  // Preview only, exactly like guardPreview above — opaqueAcknowledged:true
  // here never writes anything; the real gate is opaqueGate below.
  const caseTriplePreview: CaseTriplePlanResult | undefined = useMemo(() => {
    if (assignmentPlan === undefined || !assignmentPlan.caseTripleNeeded || caseTriplePair === undefined) {
      return undefined;
    }
    return planCaseTripleSynthesis(
      ir,
      ruleIndex,
      assignmentPlan.finalKeyId,
      caseTriplePair.lowerChar,
      caseTriplePair.upperChar,
      { opaqueAcknowledged: true },
    );
  }, [assignmentPlan, caseTriplePair, ir, ruleIndex]);

  const opaqueGate = useMemo(() => {
    if (assignmentPlan === undefined || !assignmentPlan.needsRule) {
      return { blocked: false as const, opaqueFragmentCount: ruleIndex.opaqueFragmentCount };
    }
    return checkOpaqueGate(ruleIndex, opaqueAcknowledged);
  }, [assignmentPlan, ruleIndex, opaqueAcknowledged]);

  const guardUnavailable = assignmentPlan?.guardNeeded === true && guardPreview?.ok !== true;
  const caseTripleUnavailable =
    assignmentPlan?.caseTripleNeeded === true && caseTriplePreview?.ok !== true;

  const canCommit =
    selectedCell !== null &&
    assignmentPlan !== undefined &&
    proposal !== undefined &&
    !opaqueGate.blocked &&
    !guardUnavailable &&
    !caseTripleUnavailable;

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!canCommit || selectedCell === null || assignmentPlan === undefined || proposal === undefined) return;

    const promotedLayout = promoteKeyAtAddressToHandSet(layout, selectedCell.address);
    const op: AssignPanelSetOp = {
      address: selectedCell.address,
      kind: "set",
      fields: { id: assignmentPlan.finalKeyId, text: displayChar(assignmentPlan.outputText) },
    };

    if (assignmentPlan.guardNeeded) {
      if (guardPreview === undefined || !guardPreview.ok) return;
      const applied: ApplyGuardSynthesisResult = applyGuardSynthesis(
        ir,
        ruleIndex,
        guardPreview,
        assignmentPlan.finalKeyId,
        assignmentPlan.outputText,
        { opaqueAcknowledged },
      );
      if (!applied.ok) return;
      onCommit({ op, nextIr: applied.ir, promotedLayout, proposal });
    } else if (assignmentPlan.caseTripleNeeded) {
      if (caseTriplePreview === undefined || !caseTriplePreview.ok) return;
      const applied: ApplyCaseTripleSynthesisResult = applyCaseTripleSynthesis(
        ir,
        ruleIndex,
        caseTriplePreview,
        assignmentPlan.finalKeyId,
        { opaqueAcknowledged },
      );
      if (!applied.ok) return;
      onCommit({ op, nextIr: applied.ir, promotedLayout, proposal });
    } else if (assignmentPlan.needsRule) {
      const outcome: EnsureTouchKeyRuleOutcome = ensureTouchKeyRule(
        ir,
        ruleIndex,
        { keyId: assignmentPlan.finalKeyId, combo: targetCombo, outputText: assignmentPlan.outputText },
        { opaqueAcknowledged },
      );
      if (!outcome.ok) return;
      onCommit({ op, nextIr: outcome.ir, promotedLayout, proposal });
    } else {
      onCommit({ op, promotedLayout, proposal });
    }

    setCharInput("");
    setSelectedChar(null);
    setChosenPath("default");
    setOpaqueAcknowledged(false);
  }

  const panelLabel =
    label ?? t({ id: "editor.assignLoop.keyGrid.assignPanel.ariaLabel", message: "Assign a character" });

  if (selectedCell === null) {
    return (
      <div role="region" aria-label={panelLabel} data-testid="assign-panel">
        <p data-testid="assign-panel-empty" style={{ fontSize: 13, color: TEXT_DIM, fontFamily: FONT, margin: 0 }}>
          <Trans id="editor.assignLoop.keyGrid.assignPanel.emptyState">
            Select a key to assign a character to it.
          </Trans>
        </p>
      </div>
    );
  }

  const singleChar = selectedChar !== null && [...selectedChar].length === 1;
  const fieldError = charInput.trim() !== "" && selectedChar === null;

  const pathOptions: RadioOption[] =
    proposal?.path === "unicode-default" && proposal.alternative !== undefined
      ? [
          {
            value: "default",
            label: t({
              id: "editor.assignLoop.keyGrid.assignPanel.pathDefaultLabel",
              message: `${{ id: proposal.id }} — no rule required`,
            }),
          },
          {
            value: "alternative",
            label: t({
              id: "editor.assignLoop.keyGrid.assignPanel.pathAlternativeLabel",
              message: `Keep ${{ id: proposal.alternative.id }} and add a rule`,
            }),
            detail: (
              <div style={{ marginTop: 4 }}>
                <code style={{ fontFamily: FONT_MONO, fontSize: 12 }}>{proposal.alternative.ruleLine}</code>
                <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>
                  {alternativeReasonText(proposal.alternative.reason)}
                </div>
              </div>
            ),
          },
        ]
      : [];

  return (
    <form
      role="region"
      aria-label={panelLabel}
      data-testid="assign-panel"
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 12,
        background: BG_CARD,
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 13, color: TEXT_MAIN }} data-testid="assign-panel-target">
        {t({
          id: "editor.assignLoop.keyGrid.assignPanel.targetLabel",
          message: `Assigning ${{ id: selectedCell.id }}`,
        })}
      </div>

      {inventoryChars.length > 0 && (
        <div>
          <span style={{ fontSize: 11, color: TEXT_DIM, display: "block", marginBottom: 4 }}>
            {t({ id: "editor.assignLoop.keyGrid.assignPanel.inventoryLabel", message: "From your inventory" })}
          </span>
          <CharScrollStrip
            chars={inventoryChars}
            currentChar={selectedChar}
            onSelectChar={selectChar}
            assignments={[]}
            modality="touch"
          />
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 260 }}>
        <label htmlFor={`${uid}-char-field`} style={{ fontSize: 11, color: TEXT_DIM }}>
          <Trans id="editor.assignLoop.keyGrid.assignPanel.fieldLabel">Character or code point</Trans>
        </label>
        <TextField
          id={`${uid}-char-field`}
          value={charInput}
          onChange={(e) => handleFieldChange(e.target.value)}
          placeholder="U+025B"
          error={fieldError}
          aria-invalid={fieldError}
          aria-describedby={fieldError ? `${uid}-char-field-error` : undefined}
        />
        {fieldError && (
          <span id={`${uid}-char-field-error`} role="alert" data-testid="assign-panel-field-error" style={{ fontSize: 11, color: TEXT_DIM }}>
            <Trans id="editor.assignLoop.keyGrid.assignPanel.fieldError">
              Not a recognized character or U+ code point.
            </Trans>
          </span>
        )}
        {selectedChar !== null && (
          <span style={{ fontSize: 11, color: TEXT_DIM }} data-testid="assign-panel-field-preview">
            {codepointLabel(selectedChar).title}
          </span>
        )}
      </div>

      {characterMapChars !== undefined && characterMapChars.length > 0 && (
        <div>
          <span style={{ fontSize: 11, color: TEXT_DIM, display: "block", marginBottom: 4 }}>
            {t({ id: "editor.assignLoop.keyGrid.assignPanel.charMapLabel", message: "Character map" })}
          </span>
          <CharScrollStrip
            chars={characterMapChars}
            currentChar={selectedChar}
            onSelectChar={selectChar}
            assignments={[]}
            modality="touch"
          />
        </div>
      )}

      {capsHandled && singleChar && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT_MAIN }}>
          <Checkbox
            checked={caseTripleRequested}
            onChange={(e) => setCaseTripleRequested(e.target.checked)}
            data-testid="assign-panel-case-triple-checkbox"
          />
          <Trans id="editor.assignLoop.keyGrid.assignPanel.caseTripleCheckbox">
            Also add the CAPS / Shift+CAPS pair
          </Trans>
        </label>
      )}

      {proposal === undefined ? (
        <span style={{ fontSize: 12, color: TEXT_DIM }} data-testid="assign-panel-no-proposal">
          <Trans id="editor.assignLoop.keyGrid.assignPanel.noProposal">
            Pick a character to see what the studio will write.
          </Trans>
        </span>
      ) : (
        <div data-testid="assign-panel-proposal" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {proposal.path === "unicode-default" && pathOptions.length > 0 && (
            <RadioGroup name={`${uid}-path`} value={chosenPath} options={pathOptions} onChange={(v) => setChosenPath(v as ChosenPath)} />
          )}

          {proposal.path === "combining-mark-guard" && (
            <div data-testid="assign-panel-guard-pair" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {guardPreview !== undefined && guardPreview.ok ? (
                <>
                  <span style={{ fontSize: 11, color: TEXT_DIM }}>
                    {guardPreview.storeSource === "reuse"
                      ? t({
                          id: "editor.assignLoop.keyGrid.assignPanel.guardStoreReuse",
                          message: `Reusing the existing guard store "${{ name: guardPreview.storeName }}".`,
                        })
                      : t({
                          id: "editor.assignLoop.keyGrid.assignPanel.guardStoreMint",
                          message: `Creating a new guard store "${{ name: guardPreview.storeName }}" from this keyboard's own characters.`,
                        })}
                  </span>
                  {guardPreview.rules.map((rule, i) => (
                    <code key={`${rule.role}-${rule.comboLabel}-${i}`} style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
                      {rule.kmnText}
                    </code>
                  ))}
                </>
              ) : (
                <Notice tone="error">
                  {guardPreview?.warning ??
                    t({
                      id: "editor.assignLoop.keyGrid.assignPanel.guardUnavailable",
                      message: "A guard rule could not be prepared for this key.",
                    })}
                </Notice>
              )}
            </div>
          )}

          {proposal.path === "multi-codepoint-string" && (
            <div data-testid="assign-panel-rule-lines" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(proposal.ruleLines ?? []).map((line, i) => (
                <code key={i} style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
                  {line}
                </code>
              ))}
            </div>
          )}

          {proposal.path === "case-triple" && (
            <div data-testid="assign-panel-case-triple-rules" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {caseTriplePreview !== undefined && caseTriplePreview.ok ? (
                caseTriplePreview.rules.map((rule, i) => (
                  <code key={`${rule.comboLabel}-${i}`} style={{ fontFamily: FONT_MONO, fontSize: 12 }}>
                    {rule.kmnText}
                  </code>
                ))
              ) : (
                <Notice tone="error">
                  <span data-testid="assign-panel-case-triple-unavailable">
                    {caseTriplePreview?.reason === "caps-not-handled"
                      ? t({
                          id: "editor.assignLoop.keyGrid.assignPanel.caseTripleCapsNotHandled",
                          message:
                            "This key's group doesn't handle CAPS explicitly yet, so the studio can't add a CAPS / Shift+CAPS pair here.",
                        })
                      : (caseTriplePreview?.warning ??
                        t({
                          id: "editor.assignLoop.keyGrid.assignPanel.caseTripleUnavailable",
                          message: "A CAPS / Shift+CAPS pair could not be prepared for this key.",
                        }))}
                  </span>
                </Notice>
              )}
            </div>
          )}

          {proposal.noCaseTripleReason !== undefined && (
            <Notice tone="info">
              <span data-testid="assign-panel-no-case-triple-reason">
                {noCaseTripleReasonText(proposal.noCaseTripleReason)}
              </span>
            </Notice>
          )}

          {opaqueGate.blocked && (
            <Notice tone="warn">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span data-testid="assign-panel-opaque-warning">
                  {t({
                    id: "editor.assignLoop.keyGrid.assignPanel.opaqueWarning",
                    message: plural(opaqueGate.opaqueFragmentCount, {
                      one: "This keyboard has # part the studio could not fully read. It can't prove an equivalent rule isn't already hiding there.",
                      other: "This keyboard has # parts the studio could not fully read. It can't prove an equivalent rule isn't already hiding in one of them.",
                    }),
                  })}
                </span>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <Checkbox
                    checked={opaqueAcknowledged}
                    onChange={(e) => setOpaqueAcknowledged(e.target.checked)}
                    data-testid="assign-panel-opaque-acknowledge"
                  />
                  <Trans id="editor.assignLoop.keyGrid.assignPanel.opaqueAcknowledge">
                    Write the rule anyway
                  </Trans>
                </label>
              </div>
            </Notice>
          )}
        </div>
      )}

      <Button type="submit" variant="primary" disabled={!canCommit} data-testid="assign-panel-confirm">
        <Trans id="editor.assignLoop.keyGrid.assignPanel.confirm">Assign</Trans>
      </Button>
    </form>
  );
}
