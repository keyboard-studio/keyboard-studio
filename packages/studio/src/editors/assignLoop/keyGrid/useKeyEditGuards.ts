// useKeyEditGuards — the "at the moment of the edit" invalidation warning for
// the touch key grid (spec 058 T088; FR-036f).
//
// FR-036f: "A key-level edit that invalidates a by-character assignment MUST
// warn at the moment of the edit, naming the affected character — e.g.
// suppressing a key that carries a longpress assigned for `ɛ`. Deferring this
// to the Continue gate is too late to be actionable." This module is the
// worklist `keyEditOrphanReport.ts`'s own doc comment names (that module's
// §"the two remedies" section, "The worklist itself is `useKeyEditGuards.ts`").
//
// ## Why this is NOT `keyEditOrphanReport.ts` reused, and NOT a second
// implementation of it either
//
// `keyEditOrphanReport.ts` answers a DIFFERENT question: "did a layout
// RE-DERIVATION (a new seed replacing the one an overlay was authored
// against) strand an already-committed operation whose address no longer
// resolves." Every operation this hook evaluates, by contrast, resolves its
// address just fine — the author is editing a LIVE key right now. What this
// hook answers is "does APPLYING this pending operation, by itself, remove
// something that used to be reachable at that same address" — a same-layout,
// before/after diff of ONE operation, not a cross-layout orphan scan. The
// two modules therefore share the same LOW-LEVEL machinery
// (`resolveKeyAddress`, `resolveSubKeyEntry`, `applyKeyEditsToLayout`, all
// from `@keyboard-studio/engine`) but compose it differently, and neither
// re-derives the other's traversal.
//
// A second reason this hook cannot simply call `keyEditOrphanReport`'s
// `keyChars`-style extraction as-is: that helper (by design — see its own
// doc comment) reads only a resolved key's OWN three character sources
// (`output`, decoded `U_<HEX>` id, rule-bound production) and never recurses
// into `sk`/`multitap`/`flick`. That is exactly right for a re-derivation
// orphan (the op's OWN address is what went missing), but it is exactly
// WRONG for this hook's canonical case: `suppress` neutralizes a key's `id`
// and flips its `sp` to a non-interactive class WITHOUT clearing its
// `sk`/`multitap`/`flick` arrays (see `applyKeyEditsToLayout.ts`'s `case
// "suppress"` — the sub-entries survive in the data, they just become
// unreachable because their host is no longer interactive). Catching the
// canonical "suppressing a key that carries a longpress assigned for ɛ"
// case therefore needs a RECURSIVE, interactivity-gated character collector
// (`collectAllReachableChars` below) — deliberately not `keyChars`, and
// deliberately not `keyGridViewModel.ts`'s `collectProducedChars` either
// (that one is a grid CELL's own narrower "what does striking exactly this
// key wire to" question, by its own doc comment — also non-recursive, for a
// different, legitimate reason). Nor is it `enumerateTouchMethodsForChar`
// (pattern-apply): that function matches each key/sub-entry's own
// text/output/id independently of `sp`, so it would (incorrectly, for this
// hook's purpose) still credit a suppressed key's longpress as "producing"
// after suppression — the whole loss this hook exists to catch.
//
// ## Scope: THIS operation's own effect, not full-layout reachability
//
// This hook reports a character as invalidated when the specific operation
// being checked removes the ONLY mechanism it touches for that character —
// it does not additionally ask "is the character still reachable some other
// way, via a completely different key." That broader "lost its LAST
// mechanism anywhere in the layout" reachability sweep is FR-062, reserved
// for a later worklist over this SAME file (tasks.md T106, [US4]) — see
// `keyEditOrphanReport.ts`'s own doc comment, which draws the identical
// line for its `lostCharacters` field. Not implemented here.
//
// ## What counts as "a by-character assignment" here
//
// The characters this hook warns about are exactly the ones the by-character
// walk has already assigned — `workingCopyStore`'s `touchDraft.charTouchEntries`
// (kept live-synced by TouchGallery on every `charTouch` change; see that
// store field's own doc comment). A character the base layout merely HAPPENS
// to carry, that the author never specifically assigned via the character
// walk, is out of scope for this warning — FR-036f's own wording is "invalidates
// a BY-CHARACTER ASSIGNMENT," not "changes any character anywhere."
//
// ## Timing (the actual requirement)
//
// `checkOperation` is a plain, synchronous, pure computation over React state
// already in hand (the caller's `layout`/`ruleIndex` props plus one store
// selector) — it starts no timer and does no async work, so calling it
// immediately before `commitKeyEdit(op)` (T087) trivially satisfies "at the
// moment of the edit" without introducing a second debounce cycle (decision
// D3 is a non-issue here: there is nothing to debounce).
//
// Pure functions + a thin hook — same shape as this folder's `useGridNav.ts`
// / `useModeContextCarry.ts` precedent.

import { useCallback, useMemo } from "react";
import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import {
  decodeUnicodeKeyId,
  isSpacerKeyClass,
  producedByKeyId,
  type TouchKeyIR,
  type TouchKeyRuleIndex,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  applyKeyEditsToLayout,
  parseTouchKeyAddress,
  resolveKeyAddress,
  resolveSubKeyEntry,
  type KeyEditOperation,
  type ResolvedKeyLocation,
} from "@keyboard-studio/engine";
import { resolveMessage } from "../../../lib/i18nResolve.ts";
import { codepointLabel } from "../../../survey/codepointLabel.ts";
import { useWorkingCopyStore, type PendingKeyEditOperation } from "../../../stores/workingCopyStore.ts";

// ---------------------------------------------------------------------------
// Character collection — recursive, interactivity-gated (see module doc for
// why this cannot be `keyChars`/`collectProducedChars`/
// `enumerateTouchMethodsForChar`).
// ---------------------------------------------------------------------------

/**
 * Every character reachable by striking `key` (its own `output` / decoded
 * `U_<HEX>` id / rule-bound production) OR any of its `sk`/`multitap`/`flick`
 * sub-entries, NFC-normalized and deduplicated. Returns `[]` for a
 * spacer/blank key (`isSpacerKeyClass`) — matching `keyGridViewModel.ts`'s
 * own short-circuit — WITHOUT descending into its sub-entries either: a
 * non-interactive host makes everything it carries unreachable, which is
 * exactly the semantic `suppress` (and a `set` that flips `sp` to a
 * non-interactive class without going through the dedicated `suppress` op)
 * needs credited here.
 */
function collectAllReachableChars(
  key: TouchKeyIR,
  ruleIndex: TouchKeyRuleIndex | undefined,
): readonly string[] {
  if (isSpacerKeyClass(key.sp)) return [];

  const out = new Set<string>();
  if (key.output !== undefined && key.output.length > 0) {
    out.add(key.output.normalize("NFC"));
  }
  const decoded = decodeUnicodeKeyId(key.id);
  if (decoded !== undefined) out.add(decoded.normalize("NFC"));
  if (ruleIndex !== undefined) {
    for (const ch of producedByKeyId(ruleIndex, key.id)) out.add(ch);
  }

  for (const sub of key.sk ?? []) {
    for (const ch of collectAllReachableChars(sub, ruleIndex)) out.add(ch);
  }
  for (const sub of key.multitap ?? []) {
    for (const ch of collectAllReachableChars(sub, ruleIndex)) out.add(ch);
  }
  if (key.flick !== undefined) {
    for (const sub of Object.values(key.flick)) {
      if (sub === undefined) continue;
      for (const ch of collectAllReachableChars(sub, ruleIndex)) out.add(ch);
    }
  }

  return [...out];
}

/** Read the key currently sitting at a previously-resolved structural position — robust across a `rename`/`set`/`suppress` that changes `id` in place (a fresh `resolveKeyAddress` by the OLD id would miss it). `undefined` when nothing sits there anymore (a `remove` spliced the row). */
function readKeyAtPosition(
  layout: TouchLayoutIR,
  loc: ResolvedKeyLocation<TouchKeyIR>,
): TouchKeyIR | undefined {
  return layout.platforms[loc.platformIndex]?.layers[loc.layerIndex]?.rows[loc.rowIndex]?.keys[loc.keyIndex];
}

// ---------------------------------------------------------------------------
// The pure diff (exported for direct unit testing — see this folder's
// `useGridNav.ts` / `useModeContextCarry.ts` precedent for exporting the pure
// core alongside the thin hook).
// ---------------------------------------------------------------------------

/**
 * Which of `assignedChars` would no longer be reachable if `op` were applied
 * to `layout`, right now. `layout` is the EFFECTIVE touch layout (overlay
 * already folded) — the same "already effective" contract `keyGridViewModel.ts`
 * and `useModeContextCarry.ts` take. Never mutates `layout`; `op` is not
 * actually committed anywhere by this function.
 *
 * `add` never invalidates anything (a brand-new key touches no existing
 * content) and short-circuits to `[]` immediately.
 */
export function findInvalidatedAssignedCharacters(
  layout: TouchLayoutIR,
  op: PendingKeyEditOperation,
  ruleIndex: TouchKeyRuleIndex | undefined,
  assignedChars: ReadonlySet<string>,
): readonly string[] {
  if (op.kind === "add") return [];
  if (assignedChars.size === 0) return [];

  const parts = parseTouchKeyAddress(op.address);
  if (parts === undefined) return [];
  const resolved = resolveKeyAddress(layout, parts);
  if (resolved === undefined) return [];

  // `seq` is assignment order only; this operation is never actually
  // committed, so any value satisfies `applyKeyEditsToLayout`'s contract —
  // same synthesis idiom `workingCopyStore.ts`'s own `commitKeyEdit` uses.
  const asIfCommitted = { ...op, seq: 0 } as KeyEditOperation;

  let beforeChars: readonly string[];
  let afterChars: readonly string[];

  if (op.kind === "setSubKey" || op.kind === "removeSubKey") {
    const beforeSub = resolveSubKeyEntry(resolved.key, op.sub);
    if (beforeSub === undefined) return [];
    beforeChars = collectAllReachableChars(beforeSub.key, ruleIndex);

    if (op.kind === "removeSubKey") {
      afterChars = [];
    } else {
      const { layout: afterLayout } = applyKeyEditsToLayout(layout, [asIfCommitted]);
      const afterMainKey = readKeyAtPosition(afterLayout, resolved);
      const afterSub = afterMainKey !== undefined ? resolveSubKeyEntry(afterMainKey, op.sub) : undefined;
      afterChars = afterSub !== undefined ? collectAllReachableChars(afterSub.key, ruleIndex) : [];
    }
  } else {
    beforeChars = collectAllReachableChars(resolved.key, ruleIndex);

    if (op.kind === "remove") {
      afterChars = [];
    } else {
      const { layout: afterLayout } = applyKeyEditsToLayout(layout, [asIfCommitted]);
      const afterKey = readKeyAtPosition(afterLayout, resolved);
      afterChars = afterKey !== undefined ? collectAllReachableChars(afterKey, ruleIndex) : [];
    }
  }

  const afterSet = new Set(afterChars);
  const lost = beforeChars.filter((ch) => !afterSet.has(ch));
  return lost.filter((ch) => assignedChars.has(ch));
}

// ---------------------------------------------------------------------------
// Localized message composition (docs/accessibility.md rule 10 —
// codepoint-derived accessible name via the sanctioned `codepointLabel`
// helper; never a hand-formatted `U+xxxx` string. Same optional-`i18n`
// convention as `useModeContextCarry.ts`'s `composeCarryKindLabel`: a real
// component passes `useLingui()`'s `i18n`; a unit test calling with none
// asserts on the English source text baked into the `msg()` descriptor.)
// ---------------------------------------------------------------------------

function composeInvalidationMessage(char: string, i18n?: I18n): string {
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.keyEditGuards.invalidatesCharacter",
      message: `This edit removes the placement for ${{ character: char }} (${{ notation: codepointLabel(char).title }})`,
    }),
  );
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export interface KeyEditInvalidationWarning {
  /** The invalidated character, NFC-normalized. */
  readonly char: string;
  /** Ready-to-render, localized sentence naming `char` by its codepoint(s) — never the bare glyph alone. */
  readonly message: string;
}

export interface UseKeyEditGuardsOptions {
  /** The EFFECTIVE touch layout the pending operation's address resolves against (overlay already folded) — same contract `keyGridViewModel.ts` and `useModeContextCarry.ts` take. */
  readonly layout: TouchLayoutIR;
  /** From `buildTouchKeyRuleIndex(ir)`, built once by the caller. Optional — omitting it under-reports a rule-bound production, never over-reports (mirrors `keyEditOrphanReport.ts`'s own convention). */
  readonly ruleIndex?: TouchKeyRuleIndex;
  /** `useLingui()`'s `i18n`, for a real component. Omit in a unit test to assert on the English source text. */
  readonly i18n?: I18n;
}

export interface UseKeyEditGuardsResult {
  /**
   * Check a PENDING key edit — before it is committed — for any by-character
   * assignment it would invalidate. Call this at the moment of the edit
   * (e.g. immediately before `commitKeyEdit(op)`), never deferred to the
   * Continue gate (FR-036f). Returns `[]` when nothing is invalidated.
   */
  readonly checkOperation: (op: PendingKeyEditOperation) => readonly KeyEditInvalidationWarning[];
}

const EMPTY_ASSIGNED_CHARS: ReadonlySet<string> = new Set();

/**
 * FR-036f's "at the moment of the edit" guard for the touch key grid. See
 * this module's doc comment for the full contract, what it deliberately does
 * NOT do (the FR-062 full-reachability sweep, reserved for T106 over this
 * same file), and why it cannot reuse `keyEditOrphanReport.ts`'s character
 * extraction as-is.
 */
export function useKeyEditGuards({
  layout,
  ruleIndex,
  i18n,
}: UseKeyEditGuardsOptions): UseKeyEditGuardsResult {
  const touchDraft = useWorkingCopyStore((s) => s.touchDraft);

  const assignedChars = useMemo(() => {
    if (touchDraft === null || touchDraft.charTouchEntries.length === 0) {
      return EMPTY_ASSIGNED_CHARS;
    }
    const set = new Set<string>();
    for (const [char] of touchDraft.charTouchEntries) set.add(char.normalize("NFC"));
    return set;
  }, [touchDraft]);

  const checkOperation = useCallback(
    (op: PendingKeyEditOperation): readonly KeyEditInvalidationWarning[] => {
      const invalidated = findInvalidatedAssignedCharacters(layout, op, ruleIndex, assignedChars);
      return invalidated.map((char) => ({ char, message: composeInvalidationMessage(char, i18n) }));
    },
    [layout, ruleIndex, assignedChars, i18n],
  );

  return { checkOperation };
}
