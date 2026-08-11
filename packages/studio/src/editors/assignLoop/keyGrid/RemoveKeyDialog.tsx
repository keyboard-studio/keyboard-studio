// RemoveKeyDialog — the three-way "remove this key" choice (spec 058 T097;
// FR-029f/FR-029g). US4: "Remove this key" is never a confirm/cancel — it is
// a genuine three-way decision, because predictability across layers and
// touchable area are opposed goals that cannot both be maximized, and the
// studio must not hard-code one of them as globally correct.
//
// ## The three author-facing outcomes map onto TWO operation kinds
//
// This is the load-bearing decision in this file, straight from
// key-edit-overlay.md §3: "Suppress-in-place is not a `remove` variant — it
// is the `suppress` operation, because it preserves geometry."
//
//   1. **Suppress in place**   -> `SuppressKeyOp`  (`kind: "suppress"`)
//   2. **Remove and reflow**   -> `RemoveKeyOp { outcome: "reflow" }`
//   3. **Remove and redistribute` -> `RemoveKeyOp { outcome: "redistribute" }`
//
// Outcomes 2 and 3 are the SAME operation kind, differing only in
// `RemoveKeyOp.outcome`; outcome 1 is a DIFFERENT kind entirely, because it
// changes no geometry — it only neutralizes rendering (`sp`) and output
// (`id`) in one compound commit (FR-029b, already implemented in
// `keyEditOps.ts`'s `applySuppressSemantics`/`proposeSuppressFields`, T095).
// {@link buildRemoveKeyDialogConfirmResult} is the ONE place this three-to-two
// mapping is decided; nothing else in this file (or, per the contract, in
// either applier) re-derives it.
//
// ## `proposeSuppressFields`, not a hand-rolled `{ spClass, sentinelId }`
//
// The task briefing is explicit: never hardcode a sentinel id or `sp` value
// here. `proposeSuppressFields` (keyEditOps.ts, T095) is the ONE place the
// `9`+`T_BLANK` vs `10`+`T_SPACER` pairing is stated (key-id-policy.md §2's
// "Gap or blank" row) — this file only chooses WHICH shape
// (`SuppressShapeChoice`, `"keycap-hole" | "spacer"`) and passes it through.
// Per FR-029a ("the studio MUST propose the appropriate value per context
// but MUST NOT remove the control"), that shape choice is itself an
// author-facing, overridable radio choice (see `suppressShape` state below),
// never silently fixed — the same "propose a good default, don't remove the
// option" principle spec.md §3c states for `sp` generally.
//
// ## Co-equal by construction, not by discipline
//
// FR-029f: "The studio MUST NOT hard-code one as globally correct." Two
// concrete choices enforce that, rather than merely asserting it in prose:
//
//   - `OUTCOME_ORDER` is fixed to the spec's own 1/2/3 enumeration order,
//     regardless of `proposedOutcome`. A UI that re-sorted the proposed
//     option to the top would itself be a soft form of "hard-coding one as
//     correct" — visual primacy is still a thumb on the scale.
//   - Every option carries its OWN trade-off `note` (FR-029f "Each option
//     MUST state its trade-off"), and the proposed option is marked with a
//     `Badge` + the caller's reason text, never a bolder/greener/differently
//     styled option — the badge names WHY it was suggested for THIS key, it
//     does not upgrade the option's visual weight relative to its siblings.
//
// ## Seams for the tasks that land on this same file next
//
// - **T098** (propose from layer kind, always overridable — IMPLEMENTED):
//   this component itself still NEVER computes a proposal — it only accepts
//   `proposedOutcome`/`proposedReason` as before. The computation now exists
//   as `computeProposedRemoveOutcome`, an exported pure function a step
//   below (this directory's own convention: `computeProposedRenameId`,
//   `buildAddKeyAfterOutcome`), which the CALLER invokes and threads the
//   result into those two props — this file's rendering contract is
//   unchanged. `undefined` (no call made yet, or a caller not wired up)
//   still pre-selects NOTHING, and Confirm stays disabled until an explicit
//   choice is made.
// - **T099** (last key in a row defaults to keeping it, full-width spacer —
//   IMPLEMENTED): confirmed against the real view model that this file
//   genuinely has no row-membership data of its own — `KeyGridCellViewModel`
//   still carries no row index or sibling count (`keyGridViewModel.ts`) —
//   so the plan in this section's earlier draft held: the caller (which
//   already holds the `KeyGridRowViewModel` this cell came from) computes
//   `row.keys.length === 1` and passes it through the new `isLastKeyInRow`
//   prop, mirroring `proposedOutcome`'s own shape. Where the earlier draft
//   was wrong: the "fourth branch" does NOT need a genuinely new op shape.
//   "Keep the row, insert a full-width spacer" is mechanically the SAME
//   `suppress` operation "Suppress in place" already commits (a suppressed
//   key keeps its position and stops producing anything — precisely what a
//   kept, spacer-shaped row entry needs), forced to the `"spacer"` shape
//   specifically. It surfaces as its own `outcome: "keepRow"` result variant
//   — distinct from an author consciously choosing "Suppress in place" from
//   the primary three-way choice — via a `keepRow` checkbox (default
//   checked) that appears ONLY when `isLastKeyInRow` is true AND the
//   selected outcome is `"reflow"` or `"redistribute"` (the two outcomes
//   that would otherwise empty the row entirely — Keyman Developer's own
//   silent-row-deletion behaviour, US4 AS2). Choosing "Suppress in place"
//   directly for a last key already keeps the row, so the checkbox does not
//   render for that outcome — asking "keep the row?" right next to an
//   outcome that never removes the row would be a redundant, confusing
//   question, not a genuine choice.
// - **T104/T105** (collateral warning — linked outputs, unreachable vs.
//   available-elsewhere, FR-060/FR-061): accepted as DATA, never computed
//   here — see `collateralWarning` prop / {@link RemoveKeyDialogCollateralWarning}.
//   Both string arrays are expected ALREADY localized and ALREADY resolved
//   (which survives where) by the engine module those tasks are building
//   (`touchKeyCollateral.ts`); this file only renders them, and only when
//   present, ahead of the Confirm button — "must appear before commit" is
//   satisfied by the fact that this whole dialog IS the pre-commit gate.
//
// ## Store-free, like every sibling editing surface in this directory
//
// Same discipline as `AssignPanel.tsx`, `RenameDialog.tsx`, and
// `useKeyCommands.ts`: no `useWorkingCopyStore` import, no `commitKeyEdit`
// call. `onConfirm` fires exactly once with the op the caller commits.

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  PLATFORM_MAX_KEYS_PER_ROW,
  countInteractiveRowKeys,
  decomposeLayerId,
  proposeSuppressFields,
  type KeyEditOperation,
  type SuppressShapeChoice,
} from "@keyboard-studio/engine";
import { Badge, Button, Checkbox, Notice, RadioGroup } from "../../../ui/index.ts";
import type { RadioOption } from "../../../ui/index.ts";
import { BG_CARD, BORDER, TEXT_DIM, TEXT_MAIN, FONT } from "../../../lib/galleryTheme.ts";
import { resolveMessage } from "../../../lib/i18nResolve.ts";
import type { KeyGridCellViewModel } from "./keyGridViewModel.ts";

// ---------------------------------------------------------------------------
// The three outcomes (see module doc, "The three author-facing outcomes")
// ---------------------------------------------------------------------------

/**
 * The three FR-029f outcomes, in the spec's own enumeration order. This
 * constant IS `OUTCOME_ORDER` below — deliberately not re-derived from
 * `proposedOutcome`, so the rendered order never changes with the proposal
 * (see module doc, "Co-equal by construction").
 */
export type RemoveKeyDialogOutcome = "suppress" | "reflow" | "redistribute";

const OUTCOME_ORDER: readonly RemoveKeyDialogOutcome[] = ["suppress", "reflow", "redistribute"];

// ---------------------------------------------------------------------------
// Confirm result — the seam the caller commits through
// ---------------------------------------------------------------------------

/** `Omit<..., "seq">` of the engine's own `suppress` operation — never hand-duplicated (mirrors `RenameDialog.tsx`'s `RenameDialogRenameOp` / `useKeyCommands.ts`'s `AddKeyAfterOp`). */
export type RemoveKeyDialogSuppressOp = Omit<Extract<KeyEditOperation, { kind: "suppress" }>, "seq">;
/** `Omit<..., "seq">` of the engine's own `remove` operation, either outcome. */
export type RemoveKeyDialogRemoveOp = Omit<Extract<KeyEditOperation, { kind: "remove" }>, "seq">;

/**
 * The engine's own two-string shape vocabulary, imported rather than restated:
 * `keycap-hole` (a visible but inert keycap, `sp:9` + `T_BLANK`) versus
 * `spacer` (the key's area yields entirely, `sp:10` + `T_SPACER`). The pairing
 * of shape to `sp`/sentinel is stated once, in `proposeSuppressFields`
 * (key-id-policy.md §2) — this module names the choice, never the values it
 * maps to.
 */
type RemoveKeyDialogSuppressShape = SuppressShapeChoice;

/**
 * Fired exactly once per confirmed choice. The discriminant IS the outcome
 * the author (or, for `"keepRow"`, the T099 last-key default) settled on;
 * `op` is whichever of the two operation kinds that outcome maps to (see
 * module doc's top section) — a caller switching on `outcome` therefore also
 * narrows `op` for free. `"keepRow"` is NOT a fourth member of the primary
 * three-way choice (FR-029f still names exactly three, rendered by
 * `OUTCOME_ORDER` below) — it only ever arises from the T099 last-key-in-row
 * default overriding a `"reflow"`/`"redistribute"` pick (see
 * {@link buildRemoveKeyDialogConfirmResult}), and it maps to the SAME
 * `suppress` operation kind `"suppress"` does.
 */
export type RemoveKeyDialogConfirmResult =
  | { readonly outcome: "suppress"; readonly op: RemoveKeyDialogSuppressOp }
  | { readonly outcome: "reflow"; readonly op: RemoveKeyDialogRemoveOp }
  | { readonly outcome: "redistribute"; readonly op: RemoveKeyDialogRemoveOp }
  | { readonly outcome: "keepRow"; readonly op: RemoveKeyDialogSuppressOp };

/**
 * The one place the outcome-to-operation mapping (module doc, top section)
 * is decided. Pure and exported for direct unit testing, matching this
 * directory's own convention (`computeProposedRenameId`,
 * `buildAddKeyAfterOutcome`). `proposeSuppressFields` is the ONLY source of
 * the `spClass`/`sentinelId` pair — this function never states either value
 * itself.
 *
 * `keepRow` (T099; FR-029, US4 AS2) defaults to `false` so every existing
 * call site keeps its prior three-way behaviour unchanged. When `true` AND
 * `outcome` is `"reflow"` or `"redistribute"` — the two outcomes that would
 * otherwise empty the row entirely — this function overrides the result to
 * the SAME `suppress` derivation "Suppress in place" uses, forced to the
 * `"spacer"` shape (never `"keycap-hole"`: FR-029/AS2 names a full-width
 * SPACER specifically), and reports it under its own `"keepRow"` outcome
 * literal rather than `"suppress"` — so a caller can tell "the author chose
 * to suppress" apart from "the last-key default kept this row alive". When
 * `outcome` is already `"suppress"`, `keepRow` is a no-op: suppressing never
 * removes the key from its row, so there is nothing to keep.
 */
export function buildRemoveKeyDialogConfirmResult(
  address: string,
  outcome: RemoveKeyDialogOutcome,
  suppressShape: RemoveKeyDialogSuppressShape,
  keepRow = false,
): RemoveKeyDialogConfirmResult {
  if (keepRow && outcome !== "suppress") {
    const { spClass, sentinelId } = proposeSuppressFields("spacer");
    return { outcome: "keepRow", op: { address, kind: "suppress", spClass, sentinelId } };
  }
  switch (outcome) {
    case "suppress": {
      const { spClass, sentinelId } = proposeSuppressFields(suppressShape);
      return { outcome, op: { address, kind: "suppress", spClass, sentinelId } };
    }
    case "reflow":
      return { outcome, op: { address, kind: "remove", outcome: "reflow" } };
    case "redistribute":
      return { outcome, op: { address, kind: "remove", outcome: "redistribute" } };
  }
}

// ---------------------------------------------------------------------------
// T098 — propose the outcome from the layer's kind (FR-029g), always
// overridable. Exported pure function, matching this directory's convention
// (`computeProposedRenameId`, `buildAddKeyAfterOutcome`) — this component
// itself still computes no proposal (see module doc's "Seams" section); a
// caller invokes this and threads the result into `proposedOutcome` /
// `proposedReason` below.
// ---------------------------------------------------------------------------

/**
 * Platform key-count limits a touch row must stay under before it counts as
 * "crowded" (FR-029g's third bullet).
 *
 * **No longer a restatement (spec 061 T022, research D6).** This used to be a
 * hand-copied twin of `check-18-3-keys-per-row.ts`'s `MAX_KEYS`, carrying a
 * comment asking a future reader to keep the two in sync — the copy the shared
 * table was created to retire. It is now an alias for
 * `PLATFORM_MAX_KEYS_PER_ROW`, read through the engine's barrel (this package's
 * only sanctioned door into engine), so the hygiene check, the edit-time
 * `TOUCH_KEY_ROW_CROWDED` finding and this proposal cannot disagree about what
 * "crowded" means.
 *
 * The name is kept rather than renamed at every call site: it reads correctly
 * where it is used, and this file's own tests pin the numbers through it.
 * `desktop` remains absent — a platform id with no entry never counts as over
 * the limit.
 */
export const PLATFORM_ROW_KEY_LIMIT: Readonly<Record<string, number>> =
  PLATFORM_MAX_KEYS_PER_ROW;

/** The two FR-029g layer-kind categories a removal proposal keys off. */
export type RemoveKeyDialogLayerKind = "twin" | "standalone";

/**
 * Classify a layer id per FR-029g's own two categories, via
 * {@link decomposeLayerId} (`layerFamilies.ts`) — NEVER re-derived by string
 * matching. A layer whose decomposition resolves to the base alphabetic
 * plane (`plane: undefined` — `default` itself, or any shift/caps/ctrl/alt
 * modifier-token variant of it) is a "casing-parallel or modifier twin" per
 * FR-029g's own example ("shift / caps / rightalt variants of the same
 * alpha layout"): its family siblings are exactly what positional
 * predictability across layers (FR-064) means. Every other layer — a named
 * plane (`symbol`, `numeric`, an alt-script plane; FR-029g's own examples)
 * or a `freeform` id the grammar could not parse at all (FR-067) — is
 * "standalone": it has no positional correspondence FR-029g wants
 * preserved, regardless of whether it happens to have its own
 * plane-internal modifier variant (FR-066's softer, plane-LOCAL parallelism
 * is a separate, weaker concern this function does not model).
 */
export function classifyLayerKind(layerId: string): RemoveKeyDialogLayerKind {
  const decomposition = decomposeLayerId(layerId);
  return decomposition.kind === "parsed" && decomposition.plane === undefined ? "twin" : "standalone";
}

export interface ProposeRemoveKeyOutcomeInput {
  readonly platform: string;
  readonly layerId: string;
  /**
   * Every key CURRENTLY in the row the targeted key belongs to (including
   * the key about to be removed) — used only to count interactive keys
   * against {@link PLATFORM_ROW_KEY_LIMIT} (rule 1 below). This is the
   * row's key count BEFORE the removal, matching AS7's "a row ALREADY over
   * the platform crowding limit" framing.
   */
  readonly rowKeys: readonly KeyGridCellViewModel[];
  /** `useLingui()`'s `i18n`, for a real component. Omit in a unit test to assert on the English source text (same convention as `useKeyCommands.ts`'s `composeAddKeyAfterLabel`). */
  readonly i18n?: I18n;
}

/** The result of {@link computeProposedRemoveOutcome} — ready to pass straight through as `proposedOutcome` / `proposedReason`. */
export interface RemoveKeyDialogProposal {
  readonly outcome: RemoveKeyDialogOutcome;
  readonly reason: string;
}

/**
 * FR-029g's proposal, in FR-029g's OWN stated precedence — encoded as
 * explicit branch order, never left to fall out of a switch statement by
 * accident:
 *
 *   1. The row is already over its platform's crowding limit
 *      ({@link PLATFORM_ROW_KEY_LIMIT}) → **redistribute**, regardless of
 *      layer kind. This wins over rule 2 even for a twin layer — a row that
 *      is genuinely too crowded needs the touch-area relief more than it
 *      needs cross-layer predictability.
 *   2. The layer is a casing-parallel or modifier twin
 *      ({@link classifyLayerKind} `"twin"`) → **suppress**, because muscle
 *      memory across the twins is the dominant value.
 *   3. Otherwise (a standalone function layer with no positional
 *      correspondence to preserve) → **redistribute**, because simplicity
 *      and target size are the dominant value.
 *
 * Always a PROPOSAL (spec.md §3c "propose-then-confirm") — the caller passes
 * the result straight through as `proposedOutcome`/`proposedReason`, and
 * this dialog's own three-way radiogroup (`OUTCOME_ORDER`) still renders
 * every option, still fully overridable (FR-029f/FR-029g "MUST allow
 * override").
 */
export function computeProposedRemoveOutcome(input: ProposeRemoveKeyOutcomeInput): RemoveKeyDialogProposal {
  const { platform, layerId, rowKeys, i18n } = input;

  const limit = PLATFORM_ROW_KEY_LIMIT[platform];
  const interactiveCount = countInteractiveRowKeys(rowKeys);
  if (limit !== undefined && interactiveCount > limit) {
    return {
      outcome: "redistribute",
      reason: resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.proposal.overLimit",
          message: `This row has ${{ count: interactiveCount }} keys, over the ${{ platform }} limit of ${{ limit }}.`,
        }),
      ),
    };
  }

  if (classifyLayerKind(layerId) === "twin") {
    return {
      outcome: "suppress",
      reason: resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.proposal.twin",
          message: "This layer mirrors another layer's key positions; suppressing keeps them aligned.",
        }),
      ),
    };
  }

  return {
    outcome: "redistribute",
    reason: resolveMessage(
      i18n,
      msg({
        id: "editor.assignLoop.keyGrid.removeKeyDialog.proposal.standalone",
        message: "This layer has no positional counterpart to preserve, so redistributing gives the row larger touch targets.",
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Collateral warning — the T104/T105 seam (see module doc)
// ---------------------------------------------------------------------------

/**
 * Data shape T104/T105 supply once `touchKeyCollateral.ts` exists. Both
 * lists are expected to arrive ALREADY composed into ready-to-render,
 * already-localized strings (one entry per lost/relocated character) — this
 * dialog performs no enumeration, no lookup, and no localization of its own
 * for this section; it is a pure display seam.
 */
export interface RemoveKeyDialogCollateralWarning {
  /** Characters that become unreachable if this edit commits (FR-060: the key's own output plus every `sk`/flick/multitap sub-key it hosts). */
  readonly lostOutputs: readonly string[];
  /** Characters that remain reachable via another mechanism, each string already naming the surviving location (FR-061). `[]` — not omitted — when nothing survives elsewhere. */
  readonly stillAvailableElsewhere: readonly string[];
}

// ---------------------------------------------------------------------------
// Focus management helpers (ARIA APG dialog pattern; docs/accessibility.md).
// Duplicated from RenameDialog.tsx rather than shared — that file has the
// same small trap inline and this package has not yet extracted a common
// hook; extracting one is out of this task's scope.
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface RemoveKeyDialogProps {
  /** Nothing renders while `false`. */
  open: boolean;
  /** The key being removed/suppressed. */
  selectedCell: KeyGridCellViewModel | null;
  /**
   * The layer-kind-derived proposal (FR-029g; T098's seam). `undefined`
   * before T098 exists — see module doc's "Seams" section for exactly why
   * that pre-selects nothing rather than guessing.
   */
  proposedOutcome?: RemoveKeyDialogOutcome;
  /** T098's own composed, already-localized reason for `proposedOutcome` (e.g. "This row is over the platform crowding limit"). Ignored when `proposedOutcome` is `undefined`. */
  proposedReason?: string;
  /**
   * Whether the row `selectedCell` belongs to would become EMPTY once this
   * key is removed — i.e. it is the last key currently in that row (T099;
   * FR-029, US4 AS2). `undefined`/`false` renders the dialog exactly as it
   * did before this task landed. Deliberately a plain boolean, not a
   * row/sibling-count prop of its own: `KeyGridCellViewModel` carries no
   * row-membership data (see `keyGridViewModel.ts`), so the caller — which
   * already holds the `KeyGridRowViewModel` this cell came from — computes
   * `row.keys.length === 1` itself and passes the answer through, mirroring
   * `proposedOutcome`'s own shape.
   */
  isLastKeyInRow?: boolean;
  /** T104/T105's seam — see {@link RemoveKeyDialogCollateralWarning}. `undefined` renders no collateral section at all. */
  collateralWarning?: RemoveKeyDialogCollateralWarning;
  /** Escape, the Cancel button, or the backdrop. Does not itself move focus back — the caller owns the invoker and restores focus to it (mirrors RenameDialog.tsx's convention). */
  onCancel: () => void;
  /** Fired exactly once per confirmed choice — see {@link RemoveKeyDialogConfirmResult}. */
  onConfirm: (result: RemoveKeyDialogConfirmResult) => void;
  /** Localized dialog accessible name override. */
  label?: string;
}

export function RemoveKeyDialog({
  open,
  selectedCell,
  proposedOutcome,
  proposedReason,
  isLastKeyInRow,
  collateralWarning,
  onCancel,
  onConfirm,
  label,
}: RemoveKeyDialogProps) {
  const { t } = useLingui();
  const uid = useId();
  const dialogRef = useRef<HTMLFormElement>(null);

  // Pre-selects the CALLER'S proposal (never a value this component computes
  // itself) — `null` means no selection at all, which is the deliberately
  // safe state before T098 supplies a real proposal (module doc, "Seams").
  const [selectedOutcome, setSelectedOutcome] = useState<RemoveKeyDialogOutcome | null>(null);
  // FR-029a: the shape choice is proposed (default "spacer" — removing a key
  // is more often "make it disappear" than "leave a keycap-shaped hole") but
  // never removed as a control; the radio group below always renders it.
  const [suppressShape, setSuppressShape] = useState<RemoveKeyDialogSuppressShape>("spacer");
  // T099 (FR-029, US4 AS2): defaults to KEEPING the row — Keyman Developer's
  // own behaviour is to silently delete it instead, which breaks the
  // positional alignment sibling layers depend on. Only consulted when
  // `isLastKeyInRow` is true AND the chosen outcome would otherwise empty
  // the row (see `keepRowControlVisible` below); reset alongside every
  // other per-open default in this file.
  const [keepRow, setKeepRow] = useState(true);

  // Reset on every open/target change, and move focus into the dialog — the
  // APG dialog pattern's "opening a dialog moves focus into it"
  // (docs/accessibility.md rule 4).
  useEffect(() => {
    if (!open || selectedCell === null) return;
    setSelectedOutcome(proposedOutcome ?? null);
    setSuppressShape("spacer");
    setKeepRow(true);
    dialogRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `proposedOutcome` is intentionally read only at open/target-change time; a later change to the SAME proposal while the dialog stays open must not silently overwrite an author's own in-progress choice.
  }, [open, selectedCell]);

  // Escape closes from anywhere in the dialog (APG dialog pattern).
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  const canConfirm = selectedCell !== null && selectedOutcome !== null;

  // T099: the checkbox only makes sense for the two outcomes that would
  // otherwise empty the row (`"reflow"`/`"redistribute"`) — "Suppress in
  // place" already keeps the row by construction (it never removes the key),
  // so asking "keep the row?" next to it would be a redundant, confusing
  // question rather than a genuine choice (see module doc, "Seams").
  const keepRowControlVisible =
    isLastKeyInRow === true && (selectedOutcome === "reflow" || selectedOutcome === "redistribute");

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

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    if (!canConfirm || selectedCell === null || selectedOutcome === null) return;
    // `keepRow` only takes effect while its control is actually visible —
    // guards against a stale `true` from a PRIOR open where the control was
    // shown, in case a future change reorders the reset-vs-derivation timing.
    const effectiveKeepRow = keepRowControlVisible && keepRow;
    onConfirm(
      buildRemoveKeyDialogConfirmResult(selectedCell.address, selectedOutcome, suppressShape, effectiveKeepRow),
    );
  }

  // -------------------------------------------------------------------------
  // Localized option content (built even while closed is harmless — the
  // early `return null` below happens after hooks, matching RenameDialog's
  // own ordering).
  // -------------------------------------------------------------------------

  const outcomeLabel = (outcome: RemoveKeyDialogOutcome): string => {
    switch (outcome) {
      case "suppress":
        return t({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.outcome.suppress.label",
          message: "Suppress in place",
        });
      case "reflow":
        return t({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.outcome.reflow.label",
          message: "Remove and reflow",
        });
      case "redistribute":
        return t({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.outcome.redistribute.label",
          message: "Remove and redistribute",
        });
    }
  };

  const outcomeNote = (outcome: RemoveKeyDialogOutcome): string => {
    switch (outcome) {
      case "suppress":
        return t({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.outcome.suppress.note",
          message: "Positions stay identical across every layer; the touchable area does not change.",
        });
      case "reflow":
        return t({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.outcome.reflow.note",
          message: "The row closes up; its stretched last key absorbs the freed width unevenly.",
        });
      case "redistribute":
        return t({
          id: "editor.assignLoop.keyGrid.removeKeyDialog.outcome.redistribute.note",
          message: "The freed width is shared across the row's remaining keys, giving each a genuinely larger touch target.",
        });
    }
  };

  const proposedBadgeText = t({
    id: "editor.assignLoop.keyGrid.removeKeyDialog.proposedBadge",
    message: "Proposed",
  });

  const options: RadioOption[] = OUTCOME_ORDER.map((outcome) => {
    const isProposed = proposedOutcome === outcome;
    return {
      value: outcome,
      label: outcomeLabel(outcome),
      note: outcomeNote(outcome),
      ...(isProposed
        ? {
            detail: (
              <span
                data-testid={`remove-key-dialog-proposed-${outcome}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 4 }}
              >
                <Badge tone="accent">{proposedBadgeText}</Badge>
                {proposedReason !== undefined && (
                  <span style={{ fontSize: 11, color: TEXT_DIM }}>{proposedReason}</span>
                )}
              </span>
            ),
          }
        : {}),
    };
  });

  const shapeOptions: RadioOption[] = [
    {
      value: "keycap-hole",
      label: t({
        id: "editor.assignLoop.keyGrid.removeKeyDialog.shape.keycapHole.label",
        message: "Keycap-shaped hole",
      }),
      note: t({
        id: "editor.assignLoop.keyGrid.removeKeyDialog.shape.keycapHole.note",
        message: "Renders a blank keycap outline; the space still looks occupied.",
      }),
    },
    {
      value: "spacer",
      label: t({
        id: "editor.assignLoop.keyGrid.removeKeyDialog.shape.spacer.label",
        message: "No keycap",
      }),
      note: t({
        id: "editor.assignLoop.keyGrid.removeKeyDialog.shape.spacer.note",
        message: "Renders nothing at all — an empty gap.",
      }),
    },
  ];

  if (!open || selectedCell === null) return null;

  const dialogLabel =
    label ??
    t({
      id: "editor.assignLoop.keyGrid.removeKeyDialog.ariaLabel",
      message: `Remove ${{ id: selectedCell.id }}`,
    });

  const hasLostOutputs = collateralWarning !== undefined && collateralWarning.lostOutputs.length > 0;
  const hasAvailableElsewhere =
    collateralWarning !== undefined && collateralWarning.stillAvailableElsewhere.length > 0;

  return (
    <>
      {/* Fixed transparent backdrop — click outside to cancel (mirrors RenameDialog.tsx's own convention). */}
      <div
        style={{ position: "fixed", inset: 0, background: "color-mix(in srgb, var(--sil-black) 50%, transparent)", zIndex: 299 }}
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the ARIA APG modal DIALOG pattern (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) requires the container itself to trap Tab focus via onKeyDown; jsx-a11y's interactive-role allowlist does not include "dialog" (it is a window/structure role, not a widget role), so this fires regardless of the explicit role — same carve-out RenameDialog.tsx already documents. */}
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={dialogLabel}
        data-testid="remove-key-dialog"
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
          minWidth: 360,
          maxWidth: 520,
          maxHeight: "80vh",
          overflowY: "auto",
          background: BG_CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          fontFamily: FONT,
          boxShadow: "0 8px 24px color-mix(in srgb, var(--sil-black) 50%, transparent)",
        }}
      >
        <div style={{ fontSize: 13, color: TEXT_MAIN }} data-testid="remove-key-dialog-target">
          {t({
            id: "editor.assignLoop.keyGrid.removeKeyDialog.targetLabel",
            message: `Removing ${{ id: selectedCell.id }}`,
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span id={`${uid}-outcome-label`} style={{ fontSize: 11, color: TEXT_DIM }}>
            {t({
              id: "editor.assignLoop.keyGrid.removeKeyDialog.outcomeLabel",
              message: "What should happen to the freed space?",
            })}
          </span>
          <RadioGroup
            name={`${uid}-outcome`}
            value={selectedOutcome}
            options={options}
            onChange={(value) => setSelectedOutcome(value as RemoveKeyDialogOutcome)}
            ariaLabelledby={`${uid}-outcome-label`}
          />
        </div>

        {selectedOutcome === "suppress" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid="remove-key-dialog-shape">
            <span id={`${uid}-shape-label`} style={{ fontSize: 11, color: TEXT_DIM }}>
              {t({
                id: "editor.assignLoop.keyGrid.removeKeyDialog.shape.label",
                message: "How should the suppressed key look?",
              })}
            </span>
            <RadioGroup
              name={`${uid}-shape`}
              value={suppressShape}
              options={shapeOptions}
              onChange={(value) => setSuppressShape(value as RemoveKeyDialogSuppressShape)}
              ariaLabelledby={`${uid}-shape-label`}
            />
          </div>
        )}

        {keepRowControlVisible && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }} data-testid="remove-key-dialog-keep-row">
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: TEXT_MAIN }}>
              <Checkbox
                checked={keepRow}
                onChange={(e) => setKeepRow(e.target.checked)}
                data-testid="remove-key-dialog-keep-row-checkbox"
              />
              <Trans id="editor.assignLoop.keyGrid.removeKeyDialog.keepRow.label">
                Keep this row (insert a full-width spacer)
              </Trans>
            </label>
            <span style={{ fontSize: 11, color: TEXT_DIM }}>
              <Trans id="editor.assignLoop.keyGrid.removeKeyDialog.keepRow.note">
                This is the last key in its row. Keyman Developer would delete the row outright instead, which
                breaks the positional alignment sibling layers depend on.
              </Trans>
            </span>
          </div>
        )}

        {(hasLostOutputs || hasAvailableElsewhere) && (
          <Notice tone="warn">
            <div data-testid="remove-key-dialog-collateral" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {hasLostOutputs && (
                <div>
                  <div>
                    <Trans id="editor.assignLoop.keyGrid.removeKeyDialog.collateral.lostHeading">
                      This would discard:
                    </Trans>
                  </div>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                    {collateralWarning?.lostOutputs.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </div>
              )}
              {hasAvailableElsewhere && (
                <div>
                  <div>
                    <Trans id="editor.assignLoop.keyGrid.removeKeyDialog.collateral.availableHeading">
                      Still reachable elsewhere:
                    </Trans>
                  </div>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                    {collateralWarning?.stillAvailableElsewhere.map((entry) => <li key={entry}>{entry}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </Notice>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button type="button" variant="secondary" onClick={onCancel} data-testid="remove-key-dialog-cancel">
            <Trans id="editor.assignLoop.keyGrid.removeKeyDialog.cancel">Cancel</Trans>
          </Button>
          <Button type="submit" variant="primary" disabled={!canConfirm} data-testid="remove-key-dialog-confirm">
            <Trans id="editor.assignLoop.keyGrid.removeKeyDialog.confirm">Remove</Trans>
          </Button>
        </div>
      </form>
    </>
  );
}
