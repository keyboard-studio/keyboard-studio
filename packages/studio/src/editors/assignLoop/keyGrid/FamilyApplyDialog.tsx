// FamilyApplyDialog — the resolution surface for a broken layer family
// (spec 058 T108; FR-065). `layerFamilies.ts`'s `findFamilyParallelismBreaks`
// (T107) NAMES the break and stops there, by its own design: "no single
// mutation resolves a broken family on its own" (that module's
// `ReviewFamilyMemberFix` doc). This dialog is the mutation surface it defers
// to.
//
// ## Why this is a dialog and not a one-click fix
//
// FR-065: "Where a family-breaking edit is intended, the studio MUST offer to
// **apply it across the family** as the proposed resolution, showing every
// affected layer **and its per-layer content first** (the same key may carry a
// different character on `shift` than on `default`)."
//
// The parenthetical is the whole reason this cannot be a one-click "fix all".
// Fanning an edit out across `default`/`shift`/`caps`/`rightalt`/… looks
// mechanical only if every member carries the same content — and in a real
// layout they systematically do not: that is what the modifier layers are FOR.
// Suppressing "the key at row 2 column 5" across an alphabetic family discards
// `a` on `default`, `A` on `shift`, and possibly `ä`/`Ä` on the `rightalt`
// pair. An author who has not been shown those four different characters has
// not actually been asked the question. So the enumeration below is not
// decoration on a confirm button; it IS the confirmation (spec v1.3.1 §3c:
// propose, then confirm — and a proposal the author cannot inspect is not a
// proposal).
//
// Per-layer content is therefore resolved from the LAYOUT, once per member,
// rather than assumed identical to the anchor's — {@link enumerateFamilyApplyTargets}.
//
// ## Every member is opt-OUT, not opt-in
//
// All resolvable members start selected: applying across the family is the
// PROPOSED resolution (FR-065's own wording), so the default must be the
// proposal, not an empty set the author has to build by hand. But each member
// is individually deselectable, because "apply it across the family" is an
// offer, not a mandate — an author may legitimately want the edit on
// `default`/`shift` and not on the `rightalt` pair. Deselecting every member
// leaves nothing to do and disables Apply, rather than silently committing the
// anchor-only edit the author already has.
//
// The ANCHOR layer (the member the author actually edited) is rendered in the
// list for context but is never selectable and never returned: its edit is
// already committed or pending through the caller's own path. Including it in
// the fan-out would double-apply it.
//
// ## Store-free, like every sibling editing surface in this directory
//
// Same discipline as `AssignPanel.tsx`, `RenameDialog.tsx`,
// `RemoveKeyDialog.tsx`, and `useKeyCommands.ts`: no `useWorkingCopyStore`
// import and no `commitKeyEdit` call. This dialog takes the effective
// (overlay-folded) layout as a prop and fires `onConfirm` exactly once with
// the ops the caller commits. It builds those ops by re-addressing the
// author's OWN operation onto each chosen layer — never by inventing a
// different kind of edit per layer.
//
// ## What this component deliberately does NOT do
//
// - Decide WHEN to open. That is the caller's call — this component never runs
//   the check itself, exactly as `RemoveKeyDialog` never computes its own
//   `proposedOutcome`. {@link isFamilyApplicableOp} answers only whether an op
//   CAN be fanned out; whether the question is worth asking is the engine's
//   `keyEditAffectsFamilyParallelism` (`layerFamilies.ts`), read forwards off
//   the same FR-068 property split `findFamilyParallelismBreaks` (T107) checks
//   backwards. Both gates apply, and the caller (`TouchGallery.tsx`'s
//   `maybeOfferFamilyApply`) applies them in that order.
// - Re-run the parallelism check after applying. The caller's next render
//   recomputes findings from the mutated layout, the same way every other
//   surface in this directory gets its post-commit truth.
// - Handle `add`. FR-065 is scoped to "a family-breaking edit"; an `add`'s
//   family-wide counterpart needs a per-layer id proposal (a `U_FFFD`
//   collision on the second member — see `useKeyCommands.ts`'s own
//   "Validation" note), which is a minting question this dialog has no
//   business answering. {@link isFamilyApplicableOp} is the explicit gate, so
//   an unsupported kind is refused loudly at the seam rather than silently
//   fanned out wrong.

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  parseTouchKeyAddress,
  resolveKeyAddress,
  touchKeyAddress,
  type KeyEditOperation,
} from "@keyboard-studio/engine";
import {
  decodeUnicodeKeyId,
  isSpacerKeyClass,
  producedByKeyId,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { Button, Checkbox, Notice } from "../../../ui/index.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { codepointLabel } from "../../../survey/codepointLabel.ts";

// ---------------------------------------------------------------------------
// The op shape (mirrors this directory's own `Omit<..., "seq">` convention —
// `AddKeyAfterOp`, `RenameDialogRenameOp`, `RemoveKeyDialogSuppressOp`)
// ---------------------------------------------------------------------------

/** Any key-edit operation, minus the store-assigned `seq` — never hand-duplicated, so this cannot drift from the shape `commitKeyEdit` expects. */
export type FamilyApplyOp = Omit<KeyEditOperation, "seq">;

/**
 * The operation kinds this dialog can fan out across a family. `suppress`,
 * `remove`, and `set` all re-address cleanly: their meaning is "do this to the
 * key at this address", which is exactly what a sibling layer's corresponding
 * address expresses.
 *
 * `add` is excluded deliberately (see module doc, "What this component
 * deliberately does NOT do"), as are the two sub-key kinds: `setSubKey` /
 * `removeSubKey` address a specific `sk`/`multitap`/`flick` entry INSIDE a
 * key, and a sibling layer's key of the same id need not host a sub-entry at
 * the same index at all — fanning those out would silently edit whichever
 * unrelated sub-key happened to occupy that slot.
 */
const FAMILY_APPLICABLE_OP_KINDS: ReadonlySet<string> = new Set(["suppress", "remove", "set"]);

/** True when `op` is a kind {@link FamilyApplyDialog} can fan out — see {@link FAMILY_APPLICABLE_OP_KINDS}. */
export function isFamilyApplicableOp(op: FamilyApplyOp): boolean {
  return FAMILY_APPLICABLE_OP_KINDS.has(op.kind);
}

// ---------------------------------------------------------------------------
// Per-layer content enumeration — the substance of FR-065 (see module doc,
// "Why this is a dialog and not a one-click fix"). Pure and exported for
// direct unit testing, matching this directory's convention
// (`computeProposedRenameId`, `buildAddKeyAfterOutcome`,
// `computeProposedRemoveOutcome`).
// ---------------------------------------------------------------------------

/** One family member's own state at the address the edit would be applied to. */
export interface FamilyApplyTarget {
  readonly layerId: string;
  /** The address the op would carry on THIS layer. */
  readonly address: string;
  /**
   * `true` for the layer the author actually edited — rendered for context,
   * never selectable, never returned (see module doc, "Every member is
   * opt-OUT").
   */
  readonly isAnchor: boolean;
  /**
   * Whether a key actually resolves at `address` on this layer. A member that
   * does not carry the key at all cannot have the edit applied to it, and is
   * listed as unavailable rather than silently dropped — an author comparing
   * the list against their eight layers must be able to see why a layer is
   * missing from the fan-out.
   */
  readonly resolved: boolean;
  /**
   * The characters this key produces ON THIS LAYER — its own `output`, its
   * decoded `U_<HEX>` id, and any rule-bound production. Empty for a
   * non-interactive (blank/spacer) key or one that produces nothing. THE field
   * FR-065's parenthetical is about: `a` here, `A` on `shift`.
   */
  readonly chars: readonly string[];
  /** The key's id on this layer, for display — may differ from the anchor's on a frame key (FR-068). */
  readonly keyId: string | undefined;
}

/**
 * What each member of `familyLayerIds` carries at the position `anchorAddress`
 * names, so the author can see the per-layer content before agreeing to a
 * fan-out. `layout` is the EFFECTIVE (overlay-folded) touch layout — the same
 * contract every sibling in this directory takes.
 *
 * Correlation is by KEY ID across the family, matching
 * `findFamilyParallelismBreaks`'s own choice for ordinary keys: the address
 * for a sibling layer is `(platform, thatLayer, sameKeyId)`. A frame key whose
 * id legitimately differs across the family (FR-068) therefore resolves as
 * unavailable on the members that spell it differently — a conservative,
 * visible outcome, and the right one: this dialog must not guess that the key
 * at the same slot under a different id is "the same key" and then edit it.
 *
 * Returns `[]` for an unparseable anchor address (defensive; should not occur
 * against a real `KeyGridCellViewModel` address).
 */
export function enumerateFamilyApplyTargets(
  layout: TouchLayoutIR,
  anchorAddress: string,
  familyLayerIds: readonly string[],
  ruleIndex?: TouchKeyRuleIndex,
): readonly FamilyApplyTarget[] {
  const parts = parseTouchKeyAddress(anchorAddress);
  if (parts === undefined) return [];

  return familyLayerIds.map((layerId) => {
    // The anchor's OCCURRENCE carries across: correlation is by (id,
    // occurrence), so the third `T_BLANK` on `default` corresponds to the third
    // on `shift`, not to whichever blank happens to come first there.
    const address =
      layerId === parts.layerId
        ? anchorAddress
        : touchKeyAddress(parts.platform, layerId, parts.keyId, parts.occurrence);
    const resolved = resolveKeyAddress(layout, {
      platform: parts.platform,
      layerId,
      keyId: parts.keyId,
      ...(parts.occurrence !== undefined ? { occurrence: parts.occurrence } : {}),
    });
    return {
      layerId,
      address,
      isAnchor: layerId === parts.layerId,
      resolved: resolved !== undefined,
      chars: resolved === undefined ? [] : collectKeyChars(resolved.key, ruleIndex),
      keyId: resolved?.key.id,
    };
  });
}

/**
 * The characters striking `key` produces on its own layer: its `output`, its
 * decoded `U_<HEX>` id, and any rule-bound production. NFC-normalized and
 * deduplicated, insertion-ordered.
 *
 * Deliberately NON-recursive, unlike `useKeyEditGuards.ts`'s
 * `collectAllReachableChars`: that hook answers "what reachable output would
 * this edit destroy", which must descend into `sk`/`multitap`/`flick` because
 * suppressing a host silently strands everything under it. This function
 * answers a different question — "what does this keycap SAY it produces, per
 * layer" — which is about telling `a` on `default` apart from `A` on `shift`.
 * Folding a key's twelve longpress accents into that list would bury the one
 * character the author is actually comparing across layers. The sub-key
 * collateral is `RemoveKeyDialog`'s own section (T104/T105), reported there
 * for the anchor before the edit commits.
 */
function collectKeyChars(
  key: TouchKeyIR,
  ruleIndex: TouchKeyRuleIndex | undefined,
): readonly string[] {
  if (isSpacerKeyClass(key.sp)) return [];
  const out = new Set<string>();
  if (key.output !== undefined && key.output.length > 0) out.add(key.output.normalize("NFC"));
  const decoded = decodeUnicodeKeyId(key.id);
  if (decoded !== undefined) out.add(decoded.normalize("NFC"));
  if (ruleIndex !== undefined) {
    for (const ch of producedByKeyId(ruleIndex, key.id)) out.add(ch);
  }
  return [...out];
}

/**
 * Re-address `op` onto each of `layerIds`, producing the ops the caller
 * commits. Pure and exported for direct unit testing.
 *
 * The op's KIND and every one of its own fields are carried across unchanged —
 * only `address` differs per layer. That is what makes this a fan-out of the
 * author's own edit rather than a second, independently-derived edit per layer:
 * whatever `suppress` shape or `set` fields the author confirmed once apply
 * identically to every member they chose.
 *
 * Returns `[]` for an unparseable anchor address or an op kind
 * {@link isFamilyApplicableOp} refuses, so an unsupported fan-out is empty
 * rather than wrong.
 */
export function buildFamilyApplyOps(
  op: FamilyApplyOp,
  layerIds: readonly string[],
): readonly FamilyApplyOp[] {
  if (!isFamilyApplicableOp(op)) return [];
  const parts = parseTouchKeyAddress(op.address);
  if (parts === undefined) return [];
  return layerIds
    .filter((layerId) => layerId !== parts.layerId)
    .map((layerId) => ({
      ...op,
      address: touchKeyAddress(parts.platform, layerId, parts.keyId, parts.occurrence),
    }));
}

// ---------------------------------------------------------------------------
// Focus management helpers (ARIA APG dialog pattern; docs/accessibility.md).
// Duplicated from RenameDialog.tsx/RemoveKeyDialog.tsx rather than shared —
// those files have the same small trap inline and this package has not yet
// extracted a common hook; extracting one is out of this task's scope.
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FamilyApplyDialogProps {
  /** Nothing renders while `false`. */
  open: boolean;
  /**
   * The author's own operation, already confirmed for the anchor layer. Its
   * `address` names the anchor; every other member's address is derived from
   * it (see {@link enumerateFamilyApplyTargets}).
   */
  op: FamilyApplyOp | null;
  /** The EFFECTIVE (overlay-folded) touch layout the per-layer content is read from. */
  layout: TouchLayoutIR;
  /** The family's layer ids, from `groupLayerFamilies` — the caller owns the grouping, this dialog never re-derives it. */
  familyLayerIds: readonly string[];
  /** From `buildTouchKeyRuleIndex(ir)`. Optional — omitting it under-reports a rule-bound production, never over-reports (mirrors this directory's own convention). */
  ruleIndex?: TouchKeyRuleIndex;
  /** Escape, the Cancel button, or the backdrop. Does not itself move focus back — the caller owns the invoker and restores focus to it (mirrors RenameDialog.tsx's convention). */
  onCancel: () => void;
  /**
   * Fired exactly once, with one op per layer the author kept selected — never
   * including the anchor. `[]` is not possible: Apply is disabled with nothing
   * selected.
   */
  onConfirm: (ops: readonly FamilyApplyOp[]) => void;
  /** Localized dialog accessible name override. */
  label?: string;
}

export function FamilyApplyDialog({
  open,
  op,
  layout,
  familyLayerIds,
  ruleIndex,
  onCancel,
  onConfirm,
  label,
}: FamilyApplyDialogProps) {
  const { t } = useLingui();
  const uid = useId();
  const dialogRef = useRef<HTMLFormElement>(null);

  const targets = useMemo(
    () =>
      op === null ? [] : enumerateFamilyApplyTargets(layout, op.address, familyLayerIds, ruleIndex),
    [op, layout, familyLayerIds, ruleIndex],
  );

  /** Applicable members: resolvable, and not the anchor (see module doc). */
  const applicableLayerIds = useMemo(
    () => targets.filter((target) => !target.isAnchor && target.resolved).map((t2) => t2.layerId),
    [targets],
  );

  // Every applicable member starts SELECTED — applying across the family is
  // the proposed resolution (FR-065), so the default is the proposal.
  const [selectedLayerIds, setSelectedLayerIds] = useState<readonly string[]>([]);

  const applicableKey = applicableLayerIds.join("\0");
  useEffect(() => {
    if (!open || op === null) return;
    setSelectedLayerIds(applicableLayerIds);
    dialogRef.current?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus();
    // `applicableLayerIds` is depended on via its stable primitive proxy —
    // same convention TouchGallery.tsx uses for its own derived-array deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, op, applicableKey]);

  // Escape closes from anywhere in the dialog (APG dialog pattern).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  function handleKeyDownTrap(e: ReactKeyboardEvent<HTMLFormElement>): void {
    if (e.key !== "Tab" || dialogRef.current === null) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function toggleLayer(layerId: string, checked: boolean): void {
    setSelectedLayerIds((prev) => {
      if (checked) return prev.includes(layerId) ? prev : [...prev, layerId];
      return prev.filter((id) => id !== layerId);
    });
  }

  const canConfirm = op !== null && selectedLayerIds.length > 0;

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!canConfirm || op === null) return;
    // Ordered by the FAMILY's own order, not by click order, so the committed
    // ops (and the undo entries they produce) read in layer order.
    const ordered = applicableLayerIds.filter((layerId) => selectedLayerIds.includes(layerId));
    onConfirm(buildFamilyApplyOps(op, ordered));
  }

  if (!open || op === null) return null;

  const dialogLabel =
    label ??
    t({
      id: "editor.assignLoop.keyGrid.familyApplyDialog.ariaLabel",
      message: "Apply this edit across the layer family",
    });

  /**
   * Per-layer content, composed for display: each character named by its
   * codepoint as well as its glyph (docs/accessibility.md rule 10 — a glyph
   * alone has no accessible name, and several of these differ only by case or
   * by an invisible combining mark).
   */
  const describeChars = (chars: readonly string[]): string =>
    chars.map((ch) => `${ch} (${codepointLabel(ch).title})`).join(", ");

  const noContentText = t({
    id: "editor.assignLoop.keyGrid.familyApplyDialog.noContent",
    message: "produces nothing",
  });

  const unavailableText = t({
    id: "editor.assignLoop.keyGrid.familyApplyDialog.unavailable",
    message: "no matching key on this layer",
  });

  const anchorText = t({
    id: "editor.assignLoop.keyGrid.familyApplyDialog.anchorNote",
    message: "already edited",
  });

  return (
    <>
      {/* Fixed transparent backdrop — click outside to cancel (mirrors RenameDialog.tsx's own convention). */}
      <div
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 299 }}
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the ARIA APG modal DIALOG pattern requires the container itself to trap Tab focus via onKeyDown; jsx-a11y's interactive-role allowlist does not include "dialog" (a window/structure role, not a widget role), so this fires regardless of the explicit role — same carve-out RenameDialog.tsx/RemoveKeyDialog.tsx already document. */}
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        data-testid="family-apply-dialog"
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDownTrap}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 300,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 16,
          minWidth: 380,
          maxWidth: 560,
          maxHeight: "80vh",
          overflowY: "auto",
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          fontFamily: FONT,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontSize: 13, color: TEXT_MAIN }} data-testid="family-apply-dialog-heading">
          <Trans id="editor.assignLoop.keyGrid.familyApplyDialog.heading">
            This edit leaves the layer family out of step. Apply it to these layers too?
          </Trans>
        </div>

        <Notice tone="info">
          <Trans id="editor.assignLoop.keyGrid.familyApplyDialog.perLayerNote">
            Check what each layer carries first — the same key holds a different character on each one, so this
            is not the same edit everywhere.
          </Trans>
        </Notice>

        <div
          role="group"
          aria-labelledby={`${uid}-members-label`}
          data-testid="family-apply-dialog-members"
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <span id={`${uid}-members-label`} style={{ fontSize: 11, color: TEXT_DIM }}>
            <Trans id="editor.assignLoop.keyGrid.familyApplyDialog.membersLabel">
              Layers in this family
            </Trans>
          </span>

          {targets.map((target) => {
            const selectable = !target.isAnchor && target.resolved;
            const contentText =
              !target.resolved
                ? unavailableText
                : target.chars.length === 0
                  ? noContentText
                  : describeChars(target.chars);
            return (
              <div
                key={target.layerId}
                data-testid={`family-apply-dialog-member-${target.layerId}`}
                style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12 }}
              >
                {selectable ? (
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 6, color: TEXT_MAIN }}>
                    <Checkbox
                      checked={selectedLayerIds.includes(target.layerId)}
                      onChange={(e) => toggleLayer(target.layerId, e.target.checked)}
                      data-testid={`family-apply-dialog-checkbox-${target.layerId}`}
                    />
                    <span>
                      <span style={{ fontWeight: 600 }}>{target.layerId}</span>
                      {" — "}
                      <span data-testid={`family-apply-dialog-content-${target.layerId}`}>{contentText}</span>
                    </span>
                  </label>
                ) : (
                  // Not a control: an unapplicable member is context, so it is
                  // plain text rather than a disabled checkbox an author could
                  // waste a Tab stop reaching for.
                  <span style={{ color: TEXT_DIM }}>
                    <span style={{ fontWeight: 600 }}>{target.layerId}</span>
                    {" — "}
                    <span data-testid={`family-apply-dialog-content-${target.layerId}`}>{contentText}</span>
                    {target.isAnchor && ` (${anchorText})`}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onCancel} data-testid="family-apply-dialog-cancel">
            <Trans id="editor.assignLoop.keyGrid.familyApplyDialog.cancel">Leave as is</Trans>
          </Button>
          <Button type="submit" variant="primary" disabled={!canConfirm} data-testid="family-apply-dialog-confirm">
            <Trans id="editor.assignLoop.keyGrid.familyApplyDialog.confirm">Apply to selected layers</Trans>
          </Button>
        </div>
      </form>
    </>
  );
}
