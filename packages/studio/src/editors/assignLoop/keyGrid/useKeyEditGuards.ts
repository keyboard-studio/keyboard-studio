// useKeyEditGuards — the "at the moment of the edit" invalidation warning for
// the touch key grid (spec 063 T088; FR-036f).
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
// (`findInvalidatedAssignedCharacters`) — plus the FR-062 sweep layered on
// top (`findCharactersLostForGood`)
//
// `findInvalidatedAssignedCharacters` reports a character as invalidated
// when the specific operation being checked removes the ONLY mechanism IT
// TOUCHES for that character — it does not additionally ask "is the
// character still reachable some other way, via a completely different
// key." That question — "did this character lose its LAST mechanism
// ANYWHERE in the layout, or is it still reachable elsewhere" — is FR-061/
// FR-062 (tasks.md T104-T106, [US4]), and is answered by
// {@link findCharactersLostForGood} below: it takes
// `findInvalidatedAssignedCharacters`'s own output, actually applies the
// pending op (`applyKeyEditsToLayout`, same as the diff above), and asks the
// CANONICAL FR-036d truth source — `touchCoverage`, the SAME function
// `keyGridProgress` (TouchGallery.tsx) already audits the confirmed
// inventory against — whether each invalidated character is still produced
// anywhere in the resulting layout. A character `touchCoverage` still finds
// is FR-061's "still available elsewhere" case and MUST NOT be treated as
// lost; one it no longer finds anywhere has lost its last mechanism and MUST
// return to the unplaced worklist / shared progress figures and be offered
// for re-placement (FR-062) — never merely reported. Deliberately NOT a
// second, independently-derived reachability walk (e.g. a recursive
// collector mirroring `collectAllReachableChars` below but scoped to the
// WHOLE layout): reusing `touchCoverage` is what lets this classification
// and `keyGridProgress`'s own count agree by construction rather than by
// discipline (FR-036d: "MUST NOT be independently maintained counters that
// can disagree"). `keyEditOrphanReport.ts`'s own doc comment draws the
// identical "not implemented here" line for its `lostCharacters` field —
// still accurate for THAT module; this one now closes the gap for the
// by-character-assignment guard.
//
// `@keyboard-studio/engine`'s `touchKeyCollateral.ts` (T104/T105) computes a
// closely related classification for a DIFFERENT caller (`RemoveKeyDialog`'s
// pre-commit collateral warning) via its OWN full-layout traversal
// (`findSurvivingLocation`), independent of `touchCoverage`. This module
// deliberately does not call it: as of this writing
// `@keyboard-studio/engine`'s package barrel (`src/index.ts`) does not
// re-export `analyzeKeyEditCollateral`/`enumerateKeyLinkedOutputs` (only
// `./pattern-apply/index.ts` does, one level down — not itself a published
// subpath), so studio code cannot import it without an engine-side export
// change this task is scoped not to make. Independent of that gap,
// `touchCoverage` is the better-aligned choice FOR THIS FILE'S PURPOSE
// regardless: `analyzeKeyEditCollateral`'s traversal walks every layer
// unconditionally, while `touchCoverage`'s (via `computeTouchCoverage`)
// restricts to layers actually reachable from `"default"` — the same
// restriction `keyGridProgress` relies on — so borrowing the OTHER module's
// traversal here could disagree with the shared progress figures at exactly
// the margin FR-036d exists to rule out. If a future change re-exports the
// engine module and this margin turns out to matter for some other caller,
// that is a reason to reconcile the two traversals, not to swap which one
// this file uses.
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
// ## T119 — the second watched set: the CONFIRMED INVENTORY (US5 AS3)
//
// FR-036f's by-character-assignment scope above is necessary but not
// sufficient. US5 AS3 is stated over a different set: "an author edit that
// removes the last mechanism for an INVENTORY character ... warns inline ...
// and the existing FR-008 gate still blocks at Continue." Those two sets
// genuinely differ, and the gap is not hypothetical: the by-character walk
// deliberately never stops on a character the seed layout already covers (see
// TouchGallery's `touchLettersToAdd` entry-parity rule), so a confirmed
// inventory character the SHIPPED layout happened to type has no
// `charTouchEntries` row at all. Stranding exactly that character is the
// canonical import-fix-up mistake — and with the assignment-only scope it
// warned about nothing at edit time and only surfaced minutes later as a
// refused Continue, which is precisely what US5 exists to rule out.
//
// So the watched set is the UNION of the two, and each warning carries which
// consequence applies:
//   - `returnsToWorklist` (FR-062, T106) — this character lost its last
//     mechanism ANYWHERE, so it goes back on the worklist to be re-placed.
//   - `blocksContinue` (T119) — that same character is in the CONFIRMED
//     INVENTORY, so the FR-008 completion gate will refuse Continue until it
//     types again. The edit still lands (FR-036f: "an editor must permit
//     invalid intermediate states"); the author is simply told now rather
//     than at the gate. This hook does not, and must not, enforce anything:
//     the gate itself stays where it is (`handleContinue`, TouchGallery), and
//     `blocksContinue` is a PREDICTION of that one gate's verdict.
//
//     That prediction agrees with the gate only so long as BOTH are given the
//     same `ruleIndex`. That is a caller obligation this hook cannot enforce,
//     and it was got wrong once already: the gate ran `touchCoverage` with a
//     `baseIr`-scoped index while this hook was handed the mutable-`ir` one, so
//     a character produced by a freshly synthesized touch rule was credited
//     here and refused there — the gate-time surprise US5 AS3 exists to remove,
//     reintroduced through the back door. TouchGallery now threads one
//     `keyModeCoverageOptions` through the shared figures, the gate, and this
//     hook; see that memo's own doc comment. A future caller that passes this
//     hook a different index than its gate uses breaks the same way.
// A character that is in neither set is still not warned about at all.
//
// ## T118 — the second, different guard on this hook: REJECTION
//
// `checkRejections` is the counterpart to everything above, and the two must not
// be conflated. Everything above reports a real, PERMITTED consequence of a
// legitimate edit — FR-036f explicitly wants the edit to proceed, because "an
// editor must permit invalid intermediate states". `checkRejections` reports an
// edit that must not happen at all (FR-045): an id the compiler cannot lex
// (0x05A, author-typed — emitting NO finding, since the invalid state never comes
// to exist), an in-layer id collision, or a `T_` key with nothing to type.
//
// Detection lives in `checkKeyEditRejections` (engine's `keyEditOps.ts`), beside
// the operation union it screens, and shares its predicates with
// `findDeadTouchKeys` so a state the DETECTOR would report cannot be reachable by
// an edit the GUARD allows. This file owns only the localized wording, exactly as
// `findingCopy.ts` does for findings.
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
  checkKeyEditRejections,
  parseTouchKeyAddress,
  resolveKeyAddress,
  resolveSubKeyEntry,
  touchCoverage,
  type KeyEditOperation,
  type KeyEditRejection,
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
 * `assignedChars` is a WATCHED SET, not necessarily the by-character
 * assignments alone: the hook passes the union of those and the confirmed
 * inventory (T119 — see the module doc's "The second watched set"). Callers
 * that only care about the FR-036f half pass just the assignments, and get
 * exactly the FR-036f answer.
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

/**
 * FR-062: of `findInvalidatedAssignedCharacters`'s own result, which
 * characters lose their LAST mechanism ANYWHERE in `layout` once `op`
 * commits — as opposed to remaining reachable via a completely different
 * key/sub-entry (FR-061's "still available elsewhere", which this function
 * excludes). See the module doc's "Scope" section for why this is computed
 * through `touchCoverage` (the SAME truth `keyGridProgress`, TouchGallery.tsx,
 * already audits `inventory` against) rather than a second, independently-
 * derived full-layout reachability walk.
 *
 * `op` is actually applied (never mutating `layout`) so the check runs
 * against the layout as it would exist AFTER the commit — the same
 * `asIfCommitted` synthesis idiom `findInvalidatedAssignedCharacters` uses
 * above.
 *
 * Short-circuits to `[]` without resolving anything when nothing is
 * invalidated in the first place (the common case — most edits invalidate
 * no by-character assignment at all), so a caller checking every commit
 * pays the extra `applyKeyEditsToLayout` + `touchCoverage` pass only when
 * there is something worth classifying.
 */
export function findCharactersLostForGood(
  layout: TouchLayoutIR,
  op: PendingKeyEditOperation,
  ruleIndex: TouchKeyRuleIndex | undefined,
  assignedChars: ReadonlySet<string>,
): readonly string[] {
  const invalidated = findInvalidatedAssignedCharacters(layout, op, ruleIndex, assignedChars);
  if (invalidated.length === 0) return invalidated;

  // `seq` is assignment order only; see `findInvalidatedAssignedCharacters`'s
  // own comment on the same synthesis.
  const asIfCommitted = { ...op, seq: 0 } as KeyEditOperation;
  const { layout: afterLayout } = applyKeyEditsToLayout(layout, [asIfCommitted]);

  // `invalidated` (not the gallery's full confirmed inventory) is passed as
  // touchCoverage's own `inventory` argument — this call only needs to know
  // whether THESE specific characters remain reachable anywhere in the
  // post-edit layout, so there is no need to thread the full inventory list
  // into this hook as a new dependency.
  const { uncovered } = touchCoverage(
    afterLayout,
    invalidated,
    ruleIndex !== undefined ? { ruleIndex } : {},
  );
  const uncoveredSet = new Set(uncovered.map((ch) => ch.normalize("NFC")));
  return invalidated.filter((ch) => uncoveredSet.has(ch));
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

/**
 * T119 (US5 AS3): the wording for an INVENTORY character that just lost its
 * last mechanism. A separate id rather than a suffix appended to the sentence
 * above, because the two say different things to the author: one reports a
 * placement that went away, this one additionally tells them the step will not
 * complete until they act. Naming the gate here is the whole point — "warns
 * inline ... and the existing FR-008 gate still blocks at Continue" is one
 * statement, and splitting it across two surfaces is how an author gets
 * surprised at the gate.
 */
function composeBlockingInvalidationMessage(char: string, i18n?: I18n): string {
  return resolveMessage(
    i18n,
    msg({
      id: "editor.assignLoop.keyGrid.keyEditGuards.invalidatesInventoryCharacter",
      message: `Nothing types ${{ character: char }} (${{ notation: codepointLabel(char).title }}) anymore. The edit is kept, but this step cannot be finished until that character has a key again.`,
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
  /**
   * FR-062: `true` when `char` loses its LAST mechanism anywhere in the
   * layout once this op commits — the caller MUST return it to the unplaced
   * worklist / shared progress figures (FR-036d) and offer it for
   * re-placement, not merely report it as lost (e.g. by removing any stale
   * `TouchAssignment` entry so the character-mode gallery re-offers the
   * method chooser instead of showing a now-broken "existing methods" list).
   * `false` when `char` remains reachable via some other key/sub-entry
   * elsewhere in the layout (FR-061's "still available elsewhere") — such a
   * character MUST NOT be treated as lost by any caller consuming this
   * warning, even though this hook still warns about it (FR-036f's own
   * narrower "did THIS op's own address stop producing it" question is
   * independent of whether the character survives elsewhere). See
   * {@link findCharactersLostForGood}.
   */
  readonly returnsToWorklist: boolean;
  /**
   * T119 (US5 AS3): `true` when `char` is in the CONFIRMED INVENTORY and has
   * lost its last mechanism — i.e. the FR-008 completion gate will refuse
   * Continue until it types again. A prediction of that one gate's verdict
   * (derived from the same `touchCoverage` pass, so the two cannot disagree),
   * never an enforcement: the edit itself still commits, because "an editor
   * must permit invalid intermediate states" (FR-036f).
   *
   * `false` — with `returnsToWorklist` possibly still `true` — for a character
   * the by-character walk had assigned that is NOT in the confirmed inventory,
   * or one that survives elsewhere (FR-061). Callers MUST NOT treat this as a
   * reason to block the edit.
   */
  readonly blocksContinue: boolean;
}

export interface UseKeyEditGuardsOptions {
  /** The EFFECTIVE touch layout the pending operation's address resolves against (overlay already folded) — same contract `keyGridViewModel.ts` and `useModeContextCarry.ts` take. */
  readonly layout: TouchLayoutIR;
  /** From `buildTouchKeyRuleIndex(ir)`, built once by the caller. Optional — omitting it under-reports a rule-bound production, never over-reports (mirrors `keyEditOrphanReport.ts`'s own convention). */
  readonly ruleIndex?: TouchKeyRuleIndex;
  /**
   * T119 (US5 AS3): the confirmed inventory (`session.confirmedInventory`, as
   * the gallery collates it) — the SAME list the FR-008 completion gate audits
   * coverage against. Watched in addition to the by-character assignments, and
   * the source of `blocksContinue`. Omitting it narrows this hook back to
   * FR-036f's assignment-only scope; it never widens what is reported beyond
   * these two sets.
   */
  readonly inventoryChars?: readonly string[];
  /** `useLingui()`'s `i18n`, for a real component. Omit in a unit test to assert on the English source text. */
  readonly i18n?: I18n;
}

/**
 * One refused mutation, with the localized sentence to show for it (T118).
 *
 * `blocking` is `true` for a hard refusal and `false` for warn-and-confirm — the
 * caller MUST NOT commit a `blocking` rejection under any circumstance, and MAY
 * commit a non-blocking one once the author has acknowledged it. See
 * `KeyEditRejection.confirmable` (engine) for which reasons can downgrade and
 * why the other two never do.
 */
export interface KeyEditRejectionNotice {
  readonly reason: KeyEditRejection["reason"];
  readonly blocking: boolean;
  readonly keyId: string;
  /** Ready-to-render, localized sentence naming the key and what is wrong. */
  readonly message: string;
}

export interface UseKeyEditGuardsResult {
  /**
   * Check a PENDING key edit — before it is committed — for any by-character
   * assignment (FR-036f) or confirmed-inventory character (T119, US5 AS3) it
   * would invalidate. Call this at the moment of the edit (e.g. immediately
   * before `commitKeyEdit(op)`), never deferred to the Continue gate. Returns
   * `[]` when nothing is invalidated.
   *
   * The returned warnings are informational in BOTH cases: no verdict here
   * ever refuses an edit. That is `checkRejections`' job, and only for the
   * three states of FR-045.
   */
  readonly checkOperation: (op: PendingKeyEditOperation) => readonly KeyEditInvalidationWarning[];
  /**
   * Check a PENDING key edit for mutations that must be REFUSED rather than
   * committed-and-reported (T118, FR-045). Returns `[]` when the edit is
   * admissible.
   *
   * Distinct from {@link checkOperation}, and deliberately not folded into it:
   * the two answer different questions with different consequences.
   * `checkOperation` reports a real, permitted consequence of a legitimate edit
   * (a character loses a mechanism — FR-036f explicitly wants the edit to
   * proceed, since "an editor must permit invalid intermediate states"). This
   * one reports an edit that must not happen at all. Merging them would force
   * every caller to re-separate "warn" from "refuse" at the call site, which is
   * exactly where the distinction gets lost.
   *
   * Call it FIRST: there is no point warning about a lost character for an edit
   * that is about to be refused.
   */
  readonly checkRejections: (op: PendingKeyEditOperation) => readonly KeyEditRejectionNotice[];
}

const EMPTY_ASSIGNED_CHARS: ReadonlySet<string> = new Set();

/**
 * FR-036f's "at the moment of the edit" guard for the touch key grid, now
 * additionally classified per FR-062/FR-061 via
 * `returnsToWorklist` (`findCharactersLostForGood`). See this module's doc
 * comment for the full contract and why it cannot reuse
 * `keyEditOrphanReport.ts`'s character extraction as-is.
 */
export function useKeyEditGuards({
  layout,
  ruleIndex,
  inventoryChars,
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

  // T119: the inventory half of the watched set. `inventoryKey` is the stable
  // primitive proxy for the array — the same idiom TouchGallery uses for its
  // own `inventory`/`unplacedChars` memos, so a caller that rebuilds the array
  // each render (the normal case: it is a `collate()` result) does not
  // invalidate every downstream callback on every render.
  const inventoryKey = (inventoryChars ?? []).join("\0");
  const inventoryCharSet = useMemo(() => {
    if (inventoryChars === undefined || inventoryChars.length === 0) {
      return EMPTY_ASSIGNED_CHARS;
    }
    return new Set(inventoryChars.map((c) => c.normalize("NFC")));
    // inventoryKey is the stable primitive proxy for inventoryChars.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryKey]);

  // The union (see the module doc's "The second watched set"). Kept as ONE set
  // so the diff below runs once, rather than running it twice and merging two
  // result lists — which would double the `applyKeyEditsToLayout` work and
  // invite the two halves to disagree about ordering.
  const watchedChars = useMemo(() => {
    if (inventoryCharSet.size === 0) return assignedChars;
    if (assignedChars.size === 0) return inventoryCharSet;
    return new Set([...assignedChars, ...inventoryCharSet]);
  }, [assignedChars, inventoryCharSet]);

  const checkOperation = useCallback(
    (op: PendingKeyEditOperation): readonly KeyEditInvalidationWarning[] => {
      const invalidated = findInvalidatedAssignedCharacters(layout, op, ruleIndex, watchedChars);
      if (invalidated.length === 0) return [];
      // Only classify (the extra applyKeyEditsToLayout + touchCoverage pass)
      // when there is something to classify — see findCharactersLostForGood's
      // own doc comment on this short-circuit.
      const lostForGood = new Set(findCharactersLostForGood(layout, op, ruleIndex, watchedChars));
      return invalidated.map((char) => {
        const returnsToWorklist = lostForGood.has(char);
        // T119: only an INVENTORY character can block the FR-008 gate — a
        // by-character assignment for a character outside the confirmed
        // inventory is not in that gate's denominator at all, so claiming it
        // blocks Continue would be a lie the author would then chase.
        const blocksContinue = returnsToWorklist && inventoryCharSet.has(char);
        return {
          char,
          message: blocksContinue
            ? composeBlockingInvalidationMessage(char, i18n)
            : composeInvalidationMessage(char, i18n),
          returnsToWorklist,
          blocksContinue,
        };
      });
    },
    [layout, ruleIndex, watchedChars, inventoryCharSet, i18n],
  );

  const checkRejections = useCallback(
    (op: PendingKeyEditOperation): readonly KeyEditRejectionNotice[] => {
      const verdict = checkKeyEditRejections(layout, op, ruleIndex);
      if (verdict.ok) return [];
      return verdict.rejections.map((rejection) => ({
        reason: rejection.reason,
        blocking: !rejection.confirmable,
        keyId: rejection.keyId,
        message: composeRejectionMessage(rejection, i18n),
      }));
    },
    [layout, ruleIndex, i18n],
  );

  return { checkOperation, checkRejections };
}

/**
 * The author-facing sentence for one rejection. Composed here rather than in the
 * engine for the same reason `findingCopy.ts` exists: the engine returns a
 * structured reason and this side owns the localized wording (FR-044).
 *
 * A confirmable dead-key rejection gets DIFFERENT copy from a hard one, not the
 * same sentence with a different button: "we cannot tell" and "this is wrong"
 * are different claims, and presenting the first as the second is how an author
 * learns to distrust the guard.
 */
function composeRejectionMessage(rejection: KeyEditRejection, i18n?: I18n): string {
  switch (rejection.reason) {
    case "invalid-identifier":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.reject.invalidIdentifier",
          message: `"${{ keyId: rejection.keyId }}" is not a usable key id. Use a letter or underscore first, then letters, digits, or underscores — for example T_MYKEY or U_00E9.`,
        }),
      );
    case "in-layer-id-collision":
      return resolveMessage(
        i18n,
        msg({
          id: "editor.assignLoop.keyGrid.reject.inLayerIdCollision",
          message: `Another key on this layer already uses the id "${{ keyId: rejection.keyId }}". Two keys with one id cannot be told apart, so this change cannot be saved.`,
        }),
      );
    case "would-create-dead-key":
      return rejection.confirmable
        ? resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.keyGrid.reject.wouldCreateDeadKey.confirmable",
              message: `Nothing appears to type "${{ keyId: rejection.keyId }}". This keyboard contains parts we could not read, which may already define it — save anyway?`,
            }),
          )
        : resolveMessage(
            i18n,
            msg({
              id: "editor.assignLoop.keyGrid.reject.wouldCreateDeadKey",
              message: `Nothing types "${{ keyId: rejection.keyId }}", so the key would do nothing when pressed. Choose what it types first, or give it a U_ id that types its character directly.`,
            }),
          );
    default: {
      const exhaustive: never = rejection.reason;
      return String(exhaustive);
    }
  }
}
