// Helpers to convert raw IR types into display-ready structures for the carve cards.

import type {
  ContextElement,
  OutputElement,
  IRRule,
  IRGroup,
  IRStore,
  KeyboardIR,
  Pattern,
  RemovalCapability,
  StoreItem,
} from '@keyboard-studio/contracts';
import { buildProducedSet } from '@keyboard-studio/contracts';
import { isParallelIndexFanOut, classifyStoreSlotEdit, describeStorePairing, analyzeStores, isCharCoveredForLocale, collectCharContributors, isPlusSeparator, parseSlotId, isCombiningMarkChar } from '@keyboard-studio/engine';
import type { StoreSlotBlockReason, StoreSlotEditMode, StoreAnalysis, CharContributors, CharNormalizationForm } from '@keyboard-studio/engine';
import type { I18n } from '@lingui/core';
import { resolveContentString } from './contentI18n.ts';
export type CardKind = 'pattern' | 'group' | 'store' | 'raw';

// ---------------------------------------------------------------------------
// ModifierLayer — which modifier bucket a rule belongs to
// ---------------------------------------------------------------------------

export type ModifierLayer = 'base' | 'shift' | 'ralt' | 'ctrl' | 'other';

/** Single source of truth for the four visible modifier-layer buckets used by Inspector and Rail. */
export interface ModGroupDef {
  id: string;
  /** Display label used by Inspector (e.g. 'Base', 'Shift'). Rail may derive a short label via .toLowerCase(). */
  label: string;
  layers: ModifierLayer[];
}

export const MOD_GROUP_DEFS: ModGroupDef[] = [
  { id: 'base',  label: 'Base',  layers: ['base'] },
  { id: 'shift', label: 'Shift', layers: ['shift'] },
  { id: 'altgr', label: 'AltGr', layers: ['ralt'] },
  { id: 'other', label: 'Other', layers: ['ctrl', 'other'] },
];

/**
 * Classify the modifier set of an IRRule into a ModifierLayer bucket.
 * // parallels classifyModifiers() in scaffoldTouchLayout.ts — keep buckets in sync
 *
 * DISPLAY-ONLY classification, deliberately NOT routed through
 * `modifierCombos.ts`'s `canonicalizeCombo` (chirality unification: e.g.
 * `CTRL+RALT` and `CTRL+LALT` both demote to generic `[CTRL ALT]`; also no
 * LCTRL handling here). This function — along with `prettyMod` and
 * `modifierLabel` below — feeds only `CarveGlyph.modifierLayer` /
 * `modifierLabel`, render-only inputs to the Carve Rail/Inspector's fixed
 * 4-bucket display (base/shift/altgr/other). Nothing here reaches emitted
 * `.kmn`, the VFS, or the S-08 combo-authoring path (that path canonicalizes
 * via `MechanismGallery.tsx`, which does use `canonicalizeCombo`). This
 * mirrors the same already-documented decision for `scaffoldTouchLayout.ts`'s
 * `classifyModifiers` (see the module doc header of
 * `packages/engine/src/pattern-apply/modifierCombos.ts`).
 *
 * Known cosmetic limitation from the naive per-token check: a bare
 * `[NCAPS K_X]` rule (no other modifiers) buckets to `'other'` here rather
 * than `'base'`, since `canonicalizeCombo`'s NCAPS-collapse isn't applied.
 * Low-severity — left as a future follow-up rather than pulled in now.
 */
export function ruleModifier(rule: IRRule): ModifierLayer {
  const vkeyEl = rule.context.find((el) => el.kind === 'vkey');
  if (!vkeyEl || vkeyEl.kind !== 'vkey') return 'base';

  const mods = new Set(vkeyEl.modifiers.map((m) => m.toUpperCase()));
  if (mods.size === 0) return 'base';

  const hasShift = mods.has('SHIFT') || mods.has('RSHIFT');
  const hasRalt = mods.has('RALT') || mods.has('RIGHTALT');
  const hasCtrl = mods.has('CTRL') || mods.has('LCTRL') || mods.has('RCTRL');
  const hasAlt = mods.has('ALT') || mods.has('LALT');
  const hasCaps = mods.has('CAPS') || mods.has('NCAPS');

  if (hasCaps) return 'other';
  if (hasRalt && !hasShift && !hasCtrl && !hasAlt) return 'ralt';
  if (hasShift && !hasRalt && !hasCtrl && !hasAlt) return 'shift';
  if (hasCtrl && !hasShift && !hasRalt && !hasAlt) return 'ctrl';
  if (!hasShift && !hasRalt && !hasCtrl && !hasAlt && !hasCaps) return 'base';
  return 'other';
}

/** Map a raw modifier token to a friendly display name. */
function prettyMod(token: string): string {
  switch (token.toUpperCase()) {
    case 'SHIFT':
    case 'RSHIFT': return 'Shift';
    case 'RALT':
    case 'RIGHTALT': return 'AltGr';
    case 'CTRL':
    case 'LCTRL':
    case 'RCTRL': return 'Ctrl';
    case 'ALT':
    case 'LALT': return 'Alt';
    case 'CAPS': return 'Caps';
    case 'NCAPS': return 'NCaps';
    default: return token;
  }
}

/**
 * Return the display prefix for a rule's modifier layer.
 * Base rules return '' (no prefix); others return a friendly label like 'Shift', 'AltGr',
 * or a '+'-joined combo for 'other'.
 */
export function modifierLabel(rule: IRRule): string {
  const vkeyEl = rule.context.find((el) => el.kind === 'vkey');
  if (!vkeyEl || vkeyEl.kind !== 'vkey' || vkeyEl.modifiers.length === 0) return '';

  const layer = ruleModifier(rule);
  switch (layer) {
    case 'base': return '';
    case 'shift': return 'Shift';
    case 'ralt': return 'AltGr';
    case 'ctrl': return 'Ctrl';
    case 'other': {
      // Deduplicate friendly names, preserve canonical order from token list
      const seen = new Set<string>();
      const parts: string[] = [];
      for (const tok of vkeyEl.modifiers) {
        const pretty = prettyMod(tok);
        if (!seen.has(pretty)) { seen.add(pretty); parts.push(pretty); }
      }
      return parts.join('+');
    }
  }
}

// ---------------------------------------------------------------------------
// isCombining — true for the full Unicode Mark category (Mn/Mc/Me, all
// scripts). General_Category M is the correct test (km-domain, spec 046
// follow-up): many Mc marks (e.g. Devanagari vowel signs) have canonical
// combining class (ccc) 0, so a ccc-based test under-detects — General_Category
// is required, not ccc. Sk "modifier symbol" characters (U+00B4 ACUTE ACCENT,
// U+02DC SMALL TILDE, etc.) are DELIBERATELY EXCLUDED: they are free-standing
// spacing characters, not marks that attach to a base, and must never get a
// dotted-circle prefix. (U+02CA MODIFIER LETTER ACUTE ACCENT is General_Category
// Lm, not Sk, but is excluded from \p{M} for the same reason: it's a
// free-standing letter, not an attaching mark.)
//
// Thin alias over the engine's isCombiningMarkChar (characterMap.ts) — both
// predicates test the same \p{M} class, so there is no reason to keep a
// separate studio-local regex. Kept as a local name (rather than updating
// every call site to import isCombiningMarkChar directly) to minimize churn.
// ---------------------------------------------------------------------------

export const isCombining = (ch: string) => {
  return isCombiningMarkChar(ch ?? '');
};

// Double-span combining marks (U+0360-0362) visually span TWO base
// characters (e.g. U+0361 COMBINING DOUBLE INVERTED BREVE ties two letters
// together) — a single leading dotted circle misrepresents them, since the
// mark has nothing to "attach to" on its right. Rendered standalone as
// circle + mark + circle instead (km-domain guidance).
const DOUBLE_SPAN_MARKS = new Set(['͠', '͡', '͢']);

// Prefix a combining mark with U+25CC DOTTED CIRCLE so it's visible standalone
// (Unicode's standard convention for showing a combining mark in isolation).
// Double-span marks (see DOUBLE_SPAN_MARKS) get a circle on BOTH sides.
// Parameterized on the caller's own combining-ness test rather than computing
// it internally: displayChar() keys off isCombining() (now a thin alias for
// the engine's isCombiningMarkChar), and the character-map pane keys off its
// cell.isCombiningMark (also isCombiningMarkChar, computed engine-side) — both
// callers agree on the same \p{M} test today; the parameter is kept so a
// caller could still special-case it without touching this helper.
export function prefixCombiningMark(ch: string, isCombiningMark: boolean): string {
  if (!isCombiningMark) return ch;
  return DOUBLE_SPAN_MARKS.has(ch) ? '◌' + ch + '◌' : '◌' + ch;
}

// Render-ready character: prefix combining marks with a dotted circle so they're visible standalone.
export function displayChar(ch: string): string {
  return prefixCombiningMark(ch, isCombining(ch));
}

const INVISIBLE_CHAR_LABELS: Record<string, string> = {
  ' ': 'SPACE',
  '​': 'ZERO WIDTH SPACE',
  '‌': 'ZERO WIDTH NON-JOINER',
  '‍': 'ZERO WIDTH JOINER',
  '﻿': 'ZERO WIDTH NO-BREAK SPACE',
  '­': 'SOFT HYPHEN',
  '͏': 'COMBINING GRAPHEME JOINER',
  '᠎': 'MONGOLIAN VOWEL SEPARATOR',
};

/** Returns a short label if the character is invisible/non-printing, otherwise null. */
export function invisibleCharLabel(ch: string): string | null {
  const known = INVISIBLE_CHAR_LABELS[ch];
  if (known) return known;
  // Any Unicode combining mark not in the explicit map
  if (/^\p{M}/u.test(ch)) {
    const cp = ch.codePointAt(0)!;
    return `COMBINING MARK (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`;
  }
  return null;
}

// A glyph tile the user is hovering/focusing, plus its current removed state — used by the Info View.
export interface HoverGlyph extends Pick<CarveGlyph, 'keys' | 'ch' | 'capability' | 'owners'> {
  off: boolean;
}

/**
 * A studio-only display tag identifying something a glyph's underlying rule
 * is tied to — a named store it reads/writes, or (for pattern-inspector
 * chips) the pattern that owns it. Render-layer only; not part of the
 * KeyboardIR/Pattern contract (see #917).
 */
export interface GlyphOwner {
  kind: 'pattern' | 'store';
  nodeId: string;
  label: string;
}

export interface CarveGlyph {
  gid: string;
  keys: string[];
  ch: string;
  modifierLayer: ModifierLayer;
  modifierLabel: string;
  capability: RemovalCapability;
  owners?: GlyphOwner[];
}

// ---------------------------------------------------------------------------
// contextToKeys — convert LHS context to a human-readable key sequence
// ---------------------------------------------------------------------------

export function contextToKeys(context: ContextElement[]): string[] {
  const keys: string[] = [];
  for (const el of context) {
    switch (el.kind) {
      case 'char':
        keys.push(displayChar(el.value));
        break;
      case 'vkey':
        keys.push(el.name);
        break;
      case 'deadkey':
        keys.push('‹dk›');
        break;
      case 'any':
        // store-based — no single key representation
        break;
      case 'notany':
        break;
      case 'context':
        break;
      case 'index':
        break;
      case 'baselayout':
        break;
      case 'raw':
        break;
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// outputToChar — extract the primary output character from RHS
// ---------------------------------------------------------------------------

export function outputToChar(output: OutputElement[]): string {
  const first = output[0];
  if (!first) return '?';

  switch (first.kind) {
    case 'char': return first.value;
    case 'deadkey': return '‹dk›';
    case 'index':
    case 'outs': return '…';
    case 'beep': return '🔔';
    default: return '?';  // useGroup, raw, or unknown
  }
}

// ---------------------------------------------------------------------------
// Parallel-store index fan-out detection lives in the engine
// (isParallelIndexFanOut, imported above) — the deadkey-agnostic predicate
// covering both the S-02 deadkey body and the Bamum bare-transliteration shape.
// The studio is the consumer; the engine owns the predicate so the classifier
// (which emits the removable:slot-fill alias) and the carve UI never drift.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// expandParallelStoreRule — one CarveGlyph per char-slot in the output store
//
// gid contract (locked): `${outputStore.nodeId}#${i}` where i is the
// 0-based index into outputStore.items (the full items array).
// Non-char slots (beep/nul/raw) are skipped — they represent already-removed
// or reserved positions and must not produce tiles.
// Falls back to a single '...' glyph when the output store cannot be resolved.
// ---------------------------------------------------------------------------

function expandParallelStoreRule(rule: IRRule, ir: KeyboardIR, capabilities: Map<string, RemovalCapability>): CarveGlyph[] {
  const outputEl = rule.output[0];
  if (!outputEl || outputEl.kind !== 'index') return [];

  const outputStore = ir.stores.find((s) => s.name === outputEl.storeRef);
  if (!outputStore) {
    // Fallback: unresolvable store — return a single '...' glyph with bare nodeId
    const keys = contextToKeys(rule.context);
    if (keys.length === 0) return [];
    return [{
      gid: rule.nodeId,
      keys,
      ch: '…',
      modifierLayer: ruleModifier(rule),
      modifierLabel: modifierLabel(rule),
      capability: capabilities.get(rule.nodeId) ?? 'not-removable:unknown',
    }];
  }

  // Resolve the input store for key labels (best-effort; fall back to '?')
  const inputAnyEl = rule.context.find((el) => el.kind === 'any');
  const inputStoreName = inputAnyEl && inputAnyEl.kind === 'any' ? inputAnyEl.storeRef : undefined;
  const inputStore = inputStoreName !== undefined
    ? ir.stores.find((s) => s.name === inputStoreName)
    : undefined;

  // Store owners for this rule — the output store plus the input store (when
  // resolved), deduped by nodeId, skipping system stores. Attached to every
  // slot glyph the rule expands to (they all share the same store pair).
  const slotOwners: GlyphOwner[] = [];
  const slotOwnerNodeIds = new Set<string>();
  for (const s of [outputStore, inputStore]) {
    if (!s || s.isSystem) continue;
    if (slotOwnerNodeIds.has(s.nodeId)) continue;
    slotOwnerNodeIds.add(s.nodeId);
    slotOwners.push({ kind: 'store', nodeId: s.nodeId, label: s.name });
  }

  const modLayer = ruleModifier(rule);
  const modLabel = modifierLabel(rule);
  const hasDeadkey = rule.context.some((el) => el.kind === 'deadkey');

  const glyphs: CarveGlyph[] = [];
  const seen = new Set<string>();

  // Slot tiles look up by output-store nodeId (the alias entry the classifier emits).
  const slotCapability: RemovalCapability =
    capabilities.get(outputStore.nodeId) ?? 'not-removable:unknown';

  for (let i = 0; i < outputStore.items.length; i++) {
    const outputItem = outputStore.items[i];
    if (!outputItem || outputItem.kind !== 'char') continue;  // skip beep/nul/raw slots

    const ch = displayChar(outputItem.value);

    // Build input-side key label for this slot.
    // Input store items may be char (deadkey variant — base letters) or
    // vkey (bare transliteration — physical keys like K_BKQUOTE).
    const inputItem = inputStore ? inputStore.items[i] : undefined;
    let inputLabel: string;
    if (inputItem && inputItem.kind === 'char') {
      inputLabel = displayChar(inputItem.value);
    } else if (inputItem && inputItem.kind === 'vkey') {
      inputLabel = inputItem.name;
    } else {
      inputLabel = '?';
    }
    // Deadkey shape: show the deadkey marker before the input label.
    // Bare shape (Bamum): physical key only, no deadkey marker.
    const keys = hasDeadkey ? ['‹dk›', inputLabel] : [inputLabel];

    const gid = `${outputStore.nodeId}#${i}`;
    if (seen.has(gid)) continue;  // dedup: same store+index appearing in multiple rules
    seen.add(gid);

    glyphs.push({
      gid, keys, ch, modifierLayer: modLayer, modifierLabel: modLabel, capability: slotCapability,
      ...(slotOwners.length > 0 ? { owners: slotOwners } : {}),
    });
  }

  return glyphs;
}

// ---------------------------------------------------------------------------
// storeRefRole — single source of truth for "does this ONE context/output
// element count as a store reference, and in what role." context any/notany
// -> 'source'; context index -> 'output'; output index/outs -> 'output';
// anything else -> null (not a store reference). storeRefsOf (the per-rule
// roll-up over every store), ruleReferencesStore (the non-allocating
// presence check for one named store), and ruleStoreRoles (the
// non-allocating presence+role check for one named store) all iterate this
// single classifier so the element-kind knowledge never forks between the
// three call shapes (#952, following on #923's storeRefsOf consolidation).
// ---------------------------------------------------------------------------

type StoreRefRole = 'source' | 'output';

function storeRefRole(el: ContextElement | OutputElement, inOutput: boolean): { storeName: string; role: StoreRefRole } | null {
  if (!inOutput) {
    if (el.kind === 'any' || el.kind === 'notany') return { storeName: el.storeRef, role: 'source' };
    if (el.kind === 'index') return { storeName: el.storeRef, role: 'output' };
    return null;
  }
  if (el.kind === 'index' || el.kind === 'outs') return { storeName: el.storeRef, role: 'output' };
  return null;
}

// ---------------------------------------------------------------------------
// storeRefsOf — single source of truth for "what counts as a store
// reference in a rule, and its role," rolled up across the whole rule.
// Returns one entry per DISTINCT store name (first-seen order), OR-ing roles
// across multiple refs to the same store. Used by ruleStoreOwners, which
// genuinely needs the full per-store role list (it walks every store the
// rule touches, not one named store), so the "store tag" render layer and
// the store "Used by" panel derive from the same storeRefRole classifier.
// (Positional consumers like describeRuleForStore that need the element
// index keep their own scan — see the comment on that function. Callers
// that only care about a single named store should use ruleReferencesStore
// (presence-only) or ruleStoreRoles (presence + role) instead — see their
// comments; both avoid this function's Map+array allocation over every
// store in the rule.)
// ---------------------------------------------------------------------------

function storeRefsOf(rule: IRRule): { storeName: string; asSource: boolean; asOutput: boolean }[] {
  const byName = new Map<string, { storeName: string; asSource: boolean; asOutput: boolean }>();
  const touch = (name: string, role: StoreRefRole) => {
    let entry = byName.get(name);
    if (!entry) {
      entry = { storeName: name, asSource: false, asOutput: false };
      byName.set(name, entry);
    }
    if (role === 'source') entry.asSource = true;
    else entry.asOutput = true;
  };

  for (const el of rule.context) {
    const ref = storeRefRole(el, false);
    if (ref) touch(ref.storeName, ref.role);
  }
  for (const el of rule.output) {
    const ref = storeRefRole(el, true);
    if (ref) touch(ref.storeName, ref.role);
  }

  return [...byName.values()];
}

// ---------------------------------------------------------------------------
// ruleReferencesStore — non-allocating presence-only check: does `rule`
// reference `storeName` at all (in either role)? Early-exits on the first
// match instead of building storeRefsOf's full Map + array roll-up. Shares
// storeRefRole with storeRefsOf so the element-kind knowledge stays in one
// place (#952). Use this at call sites that only need a boolean — if you
// need the asSource/asOutput roles or the full per-store list, use
// storeRefsOf instead.
// ---------------------------------------------------------------------------

function ruleReferencesStore(rule: IRRule, storeName: string): boolean {
  for (const el of rule.context) {
    const ref = storeRefRole(el, false);
    if (ref && ref.storeName === storeName) return true;
  }
  for (const el of rule.output) {
    const ref = storeRefRole(el, true);
    if (ref && ref.storeName === storeName) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// ruleStoreRoles — non-allocating role lookup for ONE store: does `rule`
// reference `storeName` as a source, an output, or both? Unlike
// ruleReferencesStore this can't early-exit on the first match (both roles
// must be checked), but still avoids storeRefsOf's Map+array roll-up over
// EVERY store the rule references — it only ever tracks two booleans for
// the single store the caller asked about. Shares storeRefRole with
// storeRefsOf/ruleReferencesStore so the element-kind knowledge stays in
// one place (#952). Used by analyzeStoreUsage's main per-rule usage loop,
// which — unlike the patternRefs/groupRefs loops — needs the role, not just
// presence.
// ---------------------------------------------------------------------------

function ruleStoreRoles(rule: IRRule, storeName: string): { asSource: boolean; asOutput: boolean } {
  let asSource = false;
  let asOutput = false;
  for (const el of rule.context) {
    const ref = storeRefRole(el, false);
    if (ref && ref.storeName === storeName) {
      if (ref.role === 'source') asSource = true;
      else asOutput = true;
    }
  }
  for (const el of rule.output) {
    const ref = storeRefRole(el, true);
    if (ref && ref.storeName === storeName) asOutput = true;
  }
  return { asSource, asOutput };
}

// ---------------------------------------------------------------------------
// ruleStoreOwners — distinct named (non-system) stores a rule reads from or
// writes to, as GlyphOwner tags. Shares storeRefsOf with
// analyzeStoreUsage so the "store tag" render layer and the store "Used
// by" panel never drift on which elements count as a store reference.
// Store resolution is by name (ir.stores.find(s => s.name === ...)), so if
// two stores share a name the first one wins — a pre-existing, Keyman-legal
// but rare ambiguity shared with describeRuleForStore/analyzeStoreUsage, not
// introduced here.
// ---------------------------------------------------------------------------

function ruleStoreOwners(rule: IRRule, ir: KeyboardIR): GlyphOwner[] {
  const owners: GlyphOwner[] = [];
  const seenNodeIds = new Set<string>();
  for (const { storeName: name } of storeRefsOf(rule)) {
    const store = ir.stores.find((s) => s.name === name);
    if (!store || store.isSystem) continue;
    if (seenNodeIds.has(store.nodeId)) continue;
    seenNodeIds.add(store.nodeId);
    owners.push({ kind: 'store', nodeId: store.nodeId, label: store.name });
  }
  return owners;
}

// ---------------------------------------------------------------------------
// ruleToGlyphs — single IRRule → CarveGlyph[] (empty if not displayable)
//
// Parallel-store index fan-out rules (deadkey-body and bare transliteration)
// expand into one tile per output-store char slot.
// All other rules produce at most one tile, with gid == rule.nodeId.
// ---------------------------------------------------------------------------

function ruleToGlyphs(rule: IRRule, ir: KeyboardIR, capabilities: Map<string, RemovalCapability>): CarveGlyph[] {
  if (isParallelIndexFanOut(rule)) {
    return expandParallelStoreRule(rule, ir, capabilities);
  }
  // Standard single-output rule (original behavior)
  const keys = contextToKeys(rule.context);
  if (keys.length === 0) return [];
  const ch = outputToChar(rule.output);
  if (ch === '?' || ch === '‹dk›') return [];
  const owners = ruleStoreOwners(rule, ir);
  return [{
    gid: rule.nodeId,
    keys,
    ch,
    modifierLayer: ruleModifier(rule),
    modifierLabel: modifierLabel(rule),
    capability: capabilities.get(rule.nodeId) ?? 'not-removable:unknown',
    ...(owners.length > 0 ? { owners } : {}),
  }];
}

// ---------------------------------------------------------------------------
// groupToGlyphs — all displayable rules in a group
// ---------------------------------------------------------------------------

// The ir parameter is optional for backwards-compatibility with existing tests
// that pass only a group.  When absent, parallel-store expansion is a no-op
// because the fallback path in expandParallelStoreRule still fires (store
// lookup returns undefined → single '…' tile) — and for the simple vkey/char
// rules that tests exercise, isParallelIndexFanOut returns false anyway.
const EMPTY_IR: KeyboardIR = {
  origin: 'scaffolded',
  header: { keyboardId: '', name: '', bcp47: [], copyright: '', version: '', targets: [], storeDirectives: [] },
  stores: [],
  groups: [],
  comments: [],
  raw: [],
  recognizedPatterns: [],
};

// `ownedNodeIds` defaults to the full pattern-owned set (not an empty set) so
// EVERY caller is ghost-proof by default — a bare groupToGlyphs(group, ir) can't
// silently reintroduce the ghost chip by forgetting to pass the owned-set. (#886)
export function groupToGlyphs(group: IRGroup, ir: KeyboardIR = EMPTY_IR, capabilities: Map<string, RemovalCapability> = new Map(), ownedNodeIds: Set<string> = collectOwnedNodeIds(ir)): CarveGlyph[] {
  const glyphs: CarveGlyph[] = [];
  const seen = new Set<string>();
  group.rules.forEach((rule) => {
    if (rule.ownedByPattern !== undefined) return;
    if (ownedNodeIds.has(rule.nodeId)) return;
    for (const g of ruleToGlyphs(rule, ir, capabilities)) {
      if (!seen.has(g.gid)) { seen.add(g.gid); glyphs.push(g); }
    }
  });
  return glyphs;
}

// ---------------------------------------------------------------------------
// collectOwnedNodeIds — union of every nodeId claimed by any recognized
// pattern's ownedNodes (the render-layer hardening for the ghost-chip bug:
// even if ownedByPattern drifts from a pattern's ownedNodes, this set lets
// the group-Inspector rendering fall back to the authoritative ownedNodes
// list rather than trusting only the per-rule stamp).
// ---------------------------------------------------------------------------

export function collectOwnedNodeIds(ir: KeyboardIR): Set<string> {
  const ids = new Set<string>();
  for (const p of ir.recognizedPatterns) {
    if (p.origin !== 'recognized') continue;
    for (const n of p.ownedNodes ?? []) {
      // Rule refs only. Store nodeIds never collide with a rule.nodeId, so
      // including them is currently harmless — but the sole consumer
      // (groupToGlyphs) .has()-tests against IRRule.nodeId, so keep the set
      // homogeneous and mirror assertOwnershipConsistency's kind:'rule' scope.
      if (n.kind !== 'rule') continue;
      ids.add(n.nodeId);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// patternToGlyphs — derive character map from a Pattern's owned IR rules
// ---------------------------------------------------------------------------

export function patternToGlyphs(pattern: Pattern, ir: KeyboardIR, capabilities: Map<string, RemovalCapability> = new Map()): CarveGlyph[] {
  if (!pattern.ownedNodes || pattern.ownedNodes.length === 0) return [];

  const ownedIds = new Set(pattern.ownedNodes.map((n) => n.nodeId));
  const glyphs: CarveGlyph[] = [];
  const seen = new Set<string>();
  // Owning-pattern tag prepended to every produced glyph's owners. Consumed
  // only by the not-removable info message (InfoView "Managed by the
  // [Pattern] pattern") — never rendered as a redundant tag in a
  // pattern-inspector chip (that AC is intentionally not implemented; see
  // #917 scope decision).
  const patternOwner: GlyphOwner = { kind: 'pattern', nodeId: pattern.id, label: pattern.title };

  for (const group of ir.groups) {
    group.rules.forEach((rule) => {
      if (!ownedIds.has(rule.nodeId)) return;
      for (const g of ruleToGlyphs(rule, ir, capabilities)) {
        if (!seen.has(g.gid)) {
          seen.add(g.gid);
          glyphs.push({ ...g, owners: [patternOwner, ...(g.owners ?? [])] });
        }
      }
    });
  }

  return glyphs;
}

// ---------------------------------------------------------------------------
// storeCharChips — per-character toggle chips for a store, one per char item
// (skipping non-char items so display order matches the TRUE items index).
//
// chipId contract (locked, shared with the engine's applyStoreSlotRemovals):
//   "<store.nodeId>#<itemsIndex>" where itemsIndex is the 0-based index into
//   IRStore.items — the FULL items array, not the filtered char-only display
//   list. For output stores this intentionally equals the S-02 fan-out glyph
//   gid, so store chips and pattern/group tiles share toggle state by
//   construction (see the gid-contract comment near expandParallelStoreRule).
//
// Action is derived once per store via classifyStoreSlotEdit (single
// authority — never re-derived here):
//   "drop"     — safe to splice out entirely (no positional contract), or a
//                coordinated drop across a resolved pairing set (see
//                StoreSlotEditMode.coordinatedWith in the engine).
//   "disabled" — classifyStoreSlotEdit returned "blocked"; disabledReason
//                carries an author-facing plain-language explanation.
// ---------------------------------------------------------------------------

/** A single per-character toggle chip for a store, keyed by the locked slot-id contract. */
export interface StoreCharChip {
  /** `${store.nodeId}#${itemsIndex}` — locked slot-id contract (engine <-> studio seam). */
  chipId: string;
  ch: string;
  /** TRUE 0-based index into IRStore.items (not the char-only display index). */
  itemsIndex: number;
  action: 'drop' | 'disabled';
  /** Author-facing plain-language explanation. Present only when action === 'disabled'. */
  disabledReason?: string;
}

/**
 * Map a classifyStoreSlotEdit block reason to an author-facing plain-language
 * explanation (studio-side, UI-copy audience). Sibling: `blockReasonMessage`
 * in the engine's applyStoreSlotRemovals.ts switches over the same
 * `StoreSlotBlockReason` union to produce warning-log text — a new reason
 * must be added to both switches.
 */
function blockReasonToDisabledReason(reason: StoreSlotBlockReason): string {
  switch (reason) {
    case 'notany-widens':
      return "This store is matched negatively (notany) — removing a character would make MORE keys match, not fewer.";
    case 'context-index-aligned':
      return "This store's positions are read directly by a rule's matcher (index() in its context) — removing a character would shift every position after it out of alignment.";
    case 'unresolved-index-pairing':
      return "This store (or one it's paired with) feeds a rule's index() output, but the pairing couldn't be resolved to a matching source — removing a character here isn't safe to prove yet.";
    case 'outs-reference-unanalyzed':
      return "This store is passed to another group's rules via outs() — removing a character here could break a mechanism hidden behind that hand-off, so it isn't safe to prove yet.";
    case 'system-store':
      return "This is a system store the compiler manages directly — it isn't meant to be edited here.";
  }
}

/**
 * Extract per-character toggle chips for a store, classified once via classifyStoreSlotEdit.
 *
 * @param analysis Optional precomputed engine `analyzeStores(ir)` result — pass this
 *                 when classifying many stores against the same `ir` (e.g.
 *                 `toRailNodes`'s per-store loop, or `recommendedRemovalChars`'s
 *                 per-candidate-character loop) so each call doesn't re-scan every
 *                 rule in the IR from scratch.
 */
export function storeCharChips(store: IRStore, ir: KeyboardIR, analysis?: StoreAnalysis): StoreCharChip[] {
  const editMode = analysis !== undefined
    ? classifyStoreSlotEdit(store, ir, analysis)
    : classifyStoreSlotEdit(store, ir);
  const chips: StoreCharChip[] = [];

  store.items.forEach((item, itemsIndex) => {
    if (item.kind !== 'char') return;
    const chipId = `${store.nodeId}#${itemsIndex}`;
    if (editMode.mode === 'blocked') {
      chips.push({
        chipId, ch: item.value, itemsIndex, action: 'disabled',
        disabledReason: blockReasonToDisabledReason(editMode.reason),
      });
    } else {
      chips.push({ chipId, ch: item.value, itemsIndex, action: editMode.mode });
    }
  });

  return chips;
}

// ---------------------------------------------------------------------------
// StoreUsage — how a store is referenced across the keyboard's rules
// ---------------------------------------------------------------------------

/** Structural description of a single rule's relationship to a store. */
export interface StoreRuleDetail {
  nodeId: string;
  /** True when the store reference is the active keystroke (after the + separator); false when it matches already-buffered text. */
  isKeystroke: boolean;
  /** True when character context elements appear before the store reference — rule only fires after specific preceding characters. */
  isContextSensitive: boolean;
  /** Plain-English description of all character elements that must precede the store match (empty string when bare). */
  precedingLabel: string;
  /** True when the store's matched character appears in the output (the rule substitutes it); false when the store is used only as a context trigger with no matching output. */
  producesOutput: boolean;
  /** Platform restriction extracted from platform() guard, e.g. 'touch' or 'hardware'. Null for non-platform-specific rules. */
  platformGuard: string | null;
}

export interface StoreUsage {
  ruleCount: number;      // total rules in any group that reference this store
  asSource: boolean;      // used in any()/notany() context elements
  asOutput: boolean;      // used in index()/outs() output/context elements
  groupNames: string[];   // names of groups containing referencing rules
  /** Recognized patterns that own at least one rule referencing this store. */
  patternRefs: { patternId: string; patternTitle: string; ruleCount: number; rules: StoreRuleDetail[] }[];
  /** Groups whose unowned rules reference this store (parallel to patternRefs for non-pattern rules). */
  groupRefs: { groupId: string; groupName: string; ruleCount: number; rules: StoreRuleDetail[] }[];
}

function precedingContextLabel(elements: ContextElement[]): string {
  const parts: string[] = [];
  for (const el of elements) {
    switch (el.kind) {
      case 'char':       parts.push(`"${displayChar(el.value)}"`); break;
      case 'any':        parts.push(`any char from "${el.storeRef}"`); break;
      case 'notany':     parts.push(`any char not in "${el.storeRef}"`); break;
      case 'vkey':       parts.push(`[${el.name}]`); break;
      case 'deadkey':    parts.push('a dead key'); break;
      case 'index':      parts.push(`indexed char from "${el.storeRef}"`); break;
      case 'context':    parts.push('context'); break;
      case 'baselayout': parts.push('base layout char'); break;
      case 'raw':
        // Skip structural KMN syntax tokens ('+' separator) — they're codec artifacts, not meaningful context
        if (el.text.trim() !== '+') parts.push('specific input');
        break;
    }
  }
  return parts.join(' + ');
}

const PLATFORM_GUARD_RE = /^\s*platform\s*\(\s*'(\w+)'\s*\)/i;

function extractPlatformGuard(elements: ContextElement[]): { guard: string | null; filtered: ContextElement[] } {
  let guard: string | null = null;
  const filtered = elements.filter((el) => {
    if (el.kind !== 'raw') return true;
    const m = PLATFORM_GUARD_RE.exec(el.text);
    if (m) {
      guard = m[1] ?? null;
      return false;
    }
    return true;
  });
  return { guard, filtered };
}

// Stays bespoke rather than consuming storeRefsOf: it needs the element
// INDEX of the store ref (ctxRefIdx/outRefIdx) to compute isKeystroke via
// the '+'/raw separator and to slice the preceding context — a positional
// need storeRefsOf's per-store roll-up can't serve.
function describeRuleForStore(rule: IRRule, storeName: string): StoreRuleDetail {
  const ctxRefIdx = rule.context.findIndex((el) =>
    ((el.kind === 'any' || el.kind === 'notany') && el.storeRef === storeName) ||
    (el.kind === 'index' && el.storeRef === storeName),
  );

  // The raw('+') element marks the keystroke boundary — refs after it are the active keypress
  const plusIdx = rule.context.findIndex(isPlusSeparator);
  // ctxRefIdx === -1 means store is output-only (not a keystroke trigger)
  const isKeystroke = ctxRefIdx !== -1 && (plusIdx === -1 || ctxRefIdx > plusIdx);

  const preceding = ctxRefIdx > 0 ? rule.context.slice(0, ctxRefIdx) : [];

  // Strip platform() guards from preceding — they're rule-level platform restrictions, not character context
  const { guard: platformGuard, filtered: precedingFiltered } = extractPlatformGuard(preceding);

  const outRefIdx = rule.output.findIndex(
    (el) => (el.kind === 'index' || el.kind === 'outs') && el.storeRef === storeName,
  );

  return {
    nodeId: rule.nodeId,
    isKeystroke,
    isContextSensitive: precedingFiltered.length > 0,
    precedingLabel: precedingContextLabel(precedingFiltered),
    producesOutput: outRefIdx !== -1,
    platformGuard,
  };
}

function analyzeStoreUsage(storeName: string, ir: KeyboardIR): StoreUsage {
  let ruleCount = 0;
  let asSource = false;
  let asOutput = false;
  const groupNameSet = new Set<string>();

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const { asSource: ruleAsSource, asOutput: ruleAsOutput } = ruleStoreRoles(rule, storeName);
      if (ruleAsSource || ruleAsOutput) {
        if (ruleAsSource) asSource = true;
        if (ruleAsOutput) asOutput = true;
        ruleCount++;
        groupNameSet.add(group.name);
      }
    }
  }

  // Which recognized patterns own rules that reference this store?
  const patternRefs: { patternId: string; patternTitle: string; ruleCount: number; rules: StoreRuleDetail[] }[] = [];
  for (const pattern of ir.recognizedPatterns) {
    if (pattern.origin !== 'recognized') continue;
    const ownedIds = new Set(pattern.ownedNodes?.map((n) => n.nodeId) ?? []);
    if (ownedIds.size === 0) continue;
    const pRules: StoreRuleDetail[] = [];
    for (const group of ir.groups) {
      for (const rule of group.rules) {
        if (!ownedIds.has(rule.nodeId)) continue;
        const used = ruleReferencesStore(rule, storeName);
        if (used) pRules.push(describeRuleForStore(rule, storeName));
      }
    }
    if (pRules.length > 0) patternRefs.push({ patternId: pattern.id, patternTitle: pattern.title, ruleCount: pRules.length, rules: pRules });
  }

  // Which groups have unowned rules (not claimed by any pattern) that reference this store?
  // Exclude rules claimed via EITHER ownership signal — ownedByPattern (the
  // per-rule stamp) or a pattern's ownedNodes (via collectOwnedNodeIds) — so a
  // rule in the #886 drift shape (ownedNodes-claimed but ownedByPattern unset)
  // is not double-listed under both patternRefs and groupRefs. Mirrors the same
  // fallback groupToGlyphs uses for the glyph-tile path.
  const ownedNodeIds = collectOwnedNodeIds(ir);
  const groupRefs: { groupId: string; groupName: string; ruleCount: number; rules: StoreRuleDetail[] }[] = [];
  for (const group of ir.groups) {
    const gRules: StoreRuleDetail[] = [];
    for (const rule of group.rules) {
      if (rule.ownedByPattern !== undefined || ownedNodeIds.has(rule.nodeId)) continue; // skip — already counted in patternRefs
      const used = ruleReferencesStore(rule, storeName);
      if (used) gRules.push(describeRuleForStore(rule, storeName));
    }
    if (gRules.length > 0) groupRefs.push({ groupId: group.nodeId, groupName: group.name, ruleCount: gRules.length, rules: gRules });
  }

  return { ruleCount, asSource, asOutput, groupNames: [...groupNameSet], patternRefs, groupRefs };
}

// ---------------------------------------------------------------------------
// storeItemsAreKeys — detect key-code vs literal-character store items
// ---------------------------------------------------------------------------

/**
 * Returns true when the store's items are predominantly virtual-key entries
 * (kind === 'vkey') rather than literal characters (kind === 'char').
 * Used to produce the correct input-store role line wording.
 */
export function storeItemsAreKeys(items: StoreItem[]): boolean {
  return items.some((it) => it.kind === 'vkey');
}

// ---------------------------------------------------------------------------
// computeStoreRoleLine — short top-of-panel role description for a store
// ---------------------------------------------------------------------------

/**
 * Returns the short, prominent role line shown at the top of the StoreDetail
 * panel (above the character chips). Generic about the trigger key — says
 * "the trigger" / "when the rule fires", never a specific key name or partner.
 *
 * Returns undefined when the store has no determined role (unused / unknown).
 */
export function computeStoreRoleLine(
  usage: StoreUsage | undefined,
  items: StoreItem[],
): string | undefined {
  if (!usage) return undefined;
  const { asSource, asOutput } = usage;
  if (!asSource && !asOutput) return undefined;
  if (asOutput && !asSource) {
    return 'Output — the characters this rule produces when the trigger is pressed.';
  }
  if (asSource && !asOutput) {
    if (storeItemsAreKeys(items)) {
      return 'Input — the keys you press to produce the paired output character.';
    }
    return 'Input — characters that, once typed, get transformed when the trigger is pressed.';
  }
  // both asSource && asOutput
  return 'Input + output — these characters are matched as input and also produced as output.';
}

// ---------------------------------------------------------------------------
// CarveNode — unified rail node type for the Rail + Inspector layout
// ---------------------------------------------------------------------------

export interface CarveNode {
  nodeId: string;
  kind: CardKind;
  name: string;
  trigger?: string | undefined;
  strategy?: string | undefined;
  loadBearing?: boolean | undefined;
  glyphs?: CarveGlyph[] | undefined;       // patterns + groups
  storeChips?: StoreCharChip[] | undefined; // stores
  rawReason?: string | undefined;          // raw fragments
  referencedByNodeId?: string | undefined; // store: which pattern owns it
  referencedByLabel?: string | undefined;  // store: that pattern's title
  storeUsage?: StoreUsage | undefined;     // store: how it is used in rules
  /** store: nodeIds of peer stores linked via any()/index() pairing (parallel to pairedStoreNames; undefined entry = unresolved peer, e.g. system store) */
  pairedStoreIds?: (string | undefined)[] | undefined;
  /** store: display names of peer stores linked via any()/index() pairing */
  pairedStoreNames?: string[] | undefined;
  /** store: trigger key labels for each paired store (parallel to pairedStoreNames; undefined entry = unknown) */
  pairedStoreTriggers?: (string | undefined)[] | undefined;
  /** store: role of each paired store (parallel to pairedStoreNames; undefined entry = unknown) */
  pairedStoreRoles?: ('input' | 'output' | 'input+output' | undefined)[] | undefined;
  /** store: short top-of-panel role line ("Output — …" / "Input — …"); undefined when role is undetermined */
  storeRoleLine?: string | undefined;
  /**
   * Removal-recommendation confidence, computed by annotateRemovalRecommendations() as a
   * separate pass over toRailNodes() output (see #525 FOUNDATION slice):
   *   - 'high'   — safe-to-remove suggestion; every character this node produces is absent
   *                from the author's confirmed inventory, with no wanted character depending
   *                on it (see the store dependency guard in annotateRemovalRecommendations).
   *   - 'medium' — reserved for softer signals (Unicode-block / Phase-C mechanism-not-enabled).
   *                Not emitted by the slice-1 conservative rule; TODO(#525) once those signals land.
   *   - 'none'   — no suggestion (default; also the value when Phase B inventory is empty).
   * Undefined on nodes produced directly by toRailNodes() before annotation runs.
   */
  recommendation?: 'high' | 'medium' | 'none' | undefined;
}

/**
 * `CarveNode.name` is `pattern.title` verbatim for `kind: 'pattern'` nodes
 * (see toRailNodes below) — a Tier B content string (spec 046 T028). Render
 * sites across the Carve editor (Rail, Inspector header, InfoView hover
 * panel, DepBanner, CarveGallery cascade dialogs) all print `node.name`, so
 * resolve it here once rather than duplicating the
 * `node.kind === 'pattern' ? resolveContentString(...) : node.name` branch at
 * every call site. Group/store/raw names are IR-authoring names, not Pattern
 * content, and pass through unresolved.
 */
export function resolveNodeName(node: CarveNode, i18n?: I18n): string {
  if (node.kind !== 'pattern') return node.name;
  return resolveContentString('patterns', node.nodeId, 'title', node.name, i18n);
}

/**
 * Same resolution as resolveNodeName, for the `{kind, nodeId, label}` shape
 * shared by CharLocation (buildCharWeb's cross-reference web popup, below)
 * and the engine's CharContributors.locations (collectCharContributors) —
 * both carry pattern.title verbatim in `label` for `kind: 'pattern'` entries.
 */
export function resolveLocationLabel(
  loc: { kind: 'group' | 'pattern' | 'store' | 'raw'; nodeId: string; label: string },
  i18n?: I18n,
): string {
  if (loc.kind !== 'pattern') return loc.label;
  return resolveContentString('patterns', loc.nodeId, 'title', loc.label, i18n);
}

/**
 * `CarveNode.referencedByLabel` mirrors the owning pattern's title verbatim
 * for a store node (spec 046 T028) — same Tier B content string as
 * resolveNodeName/resolveLocationLabel above, just carried under a different
 * field name. Resolves it once rather than duplicating the
 * `referencedByNodeId !== undefined ? resolveContentString(...) : referencedByLabel`
 * ternary at each of its two call sites (InfoView.tsx, Inspector.tsx).
 * Returns undefined when the node has no referencing pattern at all.
 */
export function resolveReferencedByLabel(node: CarveNode, i18n?: I18n): string | undefined {
  if (node.referencedByLabel === undefined) return undefined;
  return node.referencedByNodeId !== undefined
    ? resolveContentString('patterns', node.referencedByNodeId, 'title', node.referencedByLabel, i18n)
    : node.referencedByLabel;
}

// ---------------------------------------------------------------------------
// idsTriState — tri-state derived purely from a flat array of item ids.
// Single source shared by glyphsTriState (CarveGlyph.gid) and nodeState's
// store-chip branch (StoreCharChip.chipId) so both derive tri-state the
// same way.
// ---------------------------------------------------------------------------

export function idsTriState(
  ids: string[],
  isItemDeleted: (id: string) => boolean,
): 'on' | 'partial' | 'off' {
  if (ids.length === 0) return 'on';
  const off = ids.filter((id) => isItemDeleted(id)).length;
  if (off === 0) return 'on';
  if (off === ids.length) return 'off';
  return 'partial';
}

// ---------------------------------------------------------------------------
// glyphsTriState — tri-state derived purely from a flat CarveGlyph array
// ---------------------------------------------------------------------------

export function glyphsTriState(
  glyphs: CarveGlyph[],
  isItemDeleted: (id: string) => boolean,
): 'on' | 'partial' | 'off' {
  return idsTriState(glyphs.map((g) => g.gid), isItemDeleted);
}

// ---------------------------------------------------------------------------
// nodeState — tri-state based on individual glyph, store-chip, or node deletion
// ---------------------------------------------------------------------------

export function nodeState(
  node: CarveNode,
  isItemDeleted: (id: string) => boolean,
  isDeleted: (id: string) => boolean,
): 'on' | 'partial' | 'off' {
  if (node.glyphs && node.glyphs.length > 0) {
    return glyphsTriState(node.glyphs, isItemDeleted);
  }
  // Stores with at least one toggleable (non-disabled) chip get tri-state
  // over those chip ids. A whole-deleted store (isDeleted) always reports
  // 'off' regardless of chip state — deleting the whole store node
  // supersedes per-character toggling. Stores with no toggleable chips
  // (all disabled, or no chips at all) fall through to the binary check.
  if (node.storeChips && node.storeChips.length > 0) {
    if (isDeleted(node.nodeId)) return 'off';
    const toggleableIds = node.storeChips
      .filter((c) => c.action !== 'disabled')
      .map((c) => c.chipId);
    if (toggleableIds.length > 0) {
      return idsTriState(toggleableIds, isItemDeleted);
    }
  }
  return isDeleted(node.nodeId) ? 'off' : 'on';
}

// ---------------------------------------------------------------------------
// vkeyLabel — human-readable label for a virtual key name
// ---------------------------------------------------------------------------

/**
 * Maps a KMN virtual-key name (e.g. "K_BKSP") to a short human-readable label
 * (e.g. "Backspace"). Special/control keys get named labels; ordinary letter/
 * digit/symbol keys are derived by stripping the "K_" prefix.
 * Returns undefined when the name is blank or unrecognisable.
 */
export function vkeyLabel(name: string): string | undefined {
  if (!name) return undefined;
  const upper = name.toUpperCase();
  // Named special keys
  const SPECIAL: Record<string, string> = {
    K_BKSP:   'Backspace',
    K_ENTER:  'Enter',
    K_TAB:    'Tab',
    K_ESC:    'Escape',
    K_SPACE:  'Space',
    K_DEL:    'Delete',
    K_INS:    'Insert',
    K_HOME:   'Home',
    K_END:    'End',
    K_PGUP:   'Page Up',
    K_PGDN:   'Page Down',
    K_LEFT:   'Left',
    K_RIGHT:  'Right',
    K_UP:     'Up',
    K_DOWN:   'Down',
    K_SHIFT:  'Shift',
    K_CTRL:   'Ctrl',
    K_ALT:    'Alt',
    K_CAPS:   'Caps Lock',
    K_LBRKT:  '[',
    K_RBRKT:  ']',
    K_BKQUOTE: '`',
    K_COLON:  ';',
    K_QUOTE:  "'",
    K_SLASH:  '/',
    K_BKSLASH: '\\',
    K_COMMA:  ',',
    K_PERIOD: '.',
    K_HYPHEN: '-',
    K_EQUAL:  '=',
  };
  if (upper in SPECIAL) return SPECIAL[upper];
  // Function keys F1–F24
  const fMatch = /^K_F(\d+)$/.exec(upper);
  if (fMatch) return `F${fMatch[1]}`;
  // Ordinary letter/digit: K_A → A, K_0 → 0, K_NP0 → Numpad 0
  const npMatch = /^K_NP(\d+)$/.exec(upper);
  if (npMatch) return `Numpad ${npMatch[1]}`;
  const simpleMatch = /^K_([A-Z0-9])$/.exec(upper);
  if (simpleMatch) return simpleMatch[1];
  // Unknown: strip the K_ prefix and return the bare name as-is
  const stripped = upper.startsWith('K_') ? upper.slice(2) : upper;
  return stripped || undefined;
}

// ---------------------------------------------------------------------------
// triggerKeyLabel — extract the human-readable trigger from a rule's context
// ---------------------------------------------------------------------------

/**
 * In a KMN rule, the trigger key is the element on the RIGHT of the `+`
 * separator (the raw('+') codec token). For a rule like:
 *   any(storeA) + [K_BKSP] > index(storeB, 1)
 * the trigger is the vkey element after raw('+').
 *
 * Returns a human-readable string or undefined when no trigger is present.
 */
export function triggerKeyLabel(context: ContextElement[]): string | undefined {
  const plusIdx = context.findIndex(isPlusSeparator);
  if (plusIdx === -1) return undefined;
  const triggerEl = context[plusIdx + 1];
  if (!triggerEl) return undefined;
  switch (triggerEl.kind) {
    case 'vkey':    return vkeyLabel(triggerEl.name) ?? triggerEl.name;
    case 'char':    return `"${displayChar(triggerEl.value)}"`;
    case 'deadkey': return `deadkey ${triggerEl.id}`;
    default:        return undefined;
  }
}

// ---------------------------------------------------------------------------
// crossPairTrigger — display-only trigger-key lookup for a CONFIRMED
// describeStorePairing "cross" partner.
//
// describeStorePairing (engine) is the single source of truth for WHICH
// stores are paired — it resolves the pairing graph precisely (an
// index(target, offset) whose (offset-1)-th non-'+' context element is
// any(source), unioned through the same offset-alignment the engine's
// applyStoreSlotRemovals dispatch uses). detectStorePairs used to
// cross-product every any() against every index() in a rule instead, which
// over-pairs a rule with 2+ any() and 2+ index() elements (e.g. Cameroon's
// `word`/`final`, each independently self-paired at its own offset — see
// the engine's describeStorePairing regression test).
//
// This function reimplements ONLY the same offset-resolution rule, locally,
// to find a trigger key for a partner name describeStorePairing already
// confirmed — it never introduces a partner describeStorePairing didn't
// name. If no rule resolves this exact edge (shouldn't happen for a
// confirmed partner, but display code stays defensive), returns undefined
// rather than guessing.
// ---------------------------------------------------------------------------

export function crossPairTrigger(storeName: string, partnerName: string, ir: KeyboardIR): string | undefined {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const effectiveContext = rule.context.filter((el) => !isPlusSeparator(el));
      for (const el of rule.output) {
        if (el.kind !== 'index') continue;
        const target = effectiveContext[el.offset - 1];
        if (target === undefined || target.kind !== 'any') continue;
        const a = el.storeRef;
        const b = target.storeRef;
        const matchesEdge = (a === storeName && b === partnerName) || (a === partnerName && b === storeName);
        if (!matchesEdge) continue;
        const trigger = triggerKeyLabel(rule.context);
        if (trigger !== undefined) return trigger;
      }
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// toRailNodes — build the full node list for the Rail from a KeyboardIR
// ---------------------------------------------------------------------------

/**
 * One node in a character's cross-reference "web" — a group, pattern, or store
 * where that character also appears. Render-layer only (not a contract type).
 */
export interface CharLocation {
  kind: CardKind; // 'group' | 'pattern' | 'store'
  nodeId: string;
  label: string;
}

/**
 * Build the character → locations web ONCE from the already-assembled rail nodes.
 *
 * Keys are the exact glyph `ch` values on screen, so a card's lookup can never
 * mismatch the character it displays. Cost is O(total glyphs), NOT O(chips ×
 * rules) — do not rebuild this per glyph (that path hangs on huge keyboards).
 * The Inspector filters out the currently-viewed card per glyph before display.
 */
export function buildCharWeb(nodes: CarveNode[]): Map<string, CharLocation[]> {
  const web = new Map<string, CharLocation[]>();
  const seen = new Map<string, Set<string>>(); // ch → nodeIds already recorded

  const add = (ch: string, loc: CharLocation) => {
    if (!ch) return;
    let ids = seen.get(ch);
    if (ids === undefined) { ids = new Set(); seen.set(ch, ids); }
    if (ids.has(loc.nodeId)) return;
    ids.add(loc.nodeId);
    const arr = web.get(ch);
    if (arr) arr.push(loc); else web.set(ch, [loc]);
  };

  for (const node of nodes) {
    if (node.kind === 'group' || node.kind === 'pattern') {
      for (const g of node.glyphs ?? []) add(g.ch, { kind: node.kind, nodeId: node.nodeId, label: node.name });
    } else if (node.kind === 'store') {
      for (const c of node.storeChips ?? []) add(c.ch, { kind: 'store', nodeId: node.nodeId, label: node.name });
    }
  }
  return web;
}

export function toRailNodes(ir: KeyboardIR, capabilities: Map<string, RemovalCapability> = new Map()): CarveNode[] {
  const nodes: CarveNode[] = [];
  const recognized = ir.recognizedPatterns.filter((p) => p.origin === 'recognized');
  const ownedNodeIds = collectOwnedNodeIds(ir);

  for (const pattern of recognized) {
    const glyphs = patternToGlyphs(pattern, ir, capabilities);
    nodes.push({
      nodeId: pattern.id,
      kind: 'pattern',
      name: pattern.title,
      ...(glyphs[0]?.ch !== undefined ? { trigger: glyphs[0].ch } : {}),
      ...(pattern.strategyId !== undefined ? { strategy: pattern.strategyId } : {}),
      glyphs,
    });
  }

  for (const group of ir.groups) {
    if (!group.rules.some((r) => r.ownedByPattern === undefined && !ownedNodeIds.has(r.nodeId))) continue;
    const glyphs = groupToGlyphs(group, ir, capabilities, ownedNodeIds);
    nodes.push({
      nodeId: group.nodeId,
      kind: 'group',
      name: group.name,
      ...(glyphs[0]?.ch !== undefined ? { trigger: glyphs[0].ch } : {}),
      glyphs,
    });
  }

  // Build a name→nodeId lookup for resolving paired store names to nodeIds
  const storeNameToNodeId = new Map<string, string>(
    ir.stores.filter((s) => !s.isSystem).map((s) => [s.name, s.nodeId]),
  );

  // Precomputed ONCE per IR and reused for every store below — classifyStoreSlotEdit
  // and describeStorePairing both scan every rule in the IR, so calling analyzeStores
  // per-store here (rather than letting each call recompute it) keeps this loop
  // O(stores + rules) instead of O(stores * rules). (#931 perf)
  const analysis = analyzeStores(ir);

  for (const store of ir.stores) {
    if (store.isSystem) continue;
    const refPattern = recognized.find((p) =>
      p.ownedNodes?.some((n) => n.nodeId === store.nodeId),
    );
    const usage = analyzeStoreUsage(store.name, ir);

    // Single source of truth for "is this store paired, and with whom?" —
    // the engine's describeStorePairing, resolved via the pairing graph.
    // Only the "cross" kind names OTHER stores; "none"/"self"/"unresolved"
    // never populate the Linked-pair panel (accuracy over completeness —
    // see the #931 review: the old detectStorePairs cross-produced every
    // any() against every index() in a rule and could over-pair, e.g.
    // Cameroon's word/final, which are each independently self-paired).
    const pairing = describeStorePairing(store, ir, analysis);
    const partners = pairing.kind === 'cross' ? pairing.partners : undefined;
    const hasPairs = partners !== undefined && partners.length > 0;
    const pairedStoreNames = hasPairs ? partners : undefined;
    // Keep index-aligned with pairedStoreNames/Triggers/Roles: an unresolved
    // peer (e.g. a system store, absent from storeNameToNodeId) stays as an
    // undefined slot rather than being filtered out, which would shift every
    // later pair's id/trigger/role by one. Inspector guards undefined per-slot.
    const pairedStoreIds = hasPairs
      ? partners.map((name) => storeNameToNodeId.get(name))
      : undefined;
    const pairedStoreTriggers = hasPairs
      ? partners.map((name) => crossPairTrigger(store.name, name, ir))
      : undefined;
    const pairedStoreRoles: ('input' | 'output' | 'input+output' | undefined)[] | undefined = hasPairs
      ? partners.map((name) => {
          const u = analyzeStoreUsage(name, ir);
          if (u.asSource && u.asOutput) return 'input+output';
          if (u.asSource) return 'input';
          if (u.asOutput) return 'output';
          return undefined;
        })
      : undefined;

    const roleLine = computeStoreRoleLine(usage.ruleCount > 0 ? usage : undefined, store.items);

    nodes.push({
      nodeId: store.nodeId,
      kind: 'store',
      name: store.name,
      storeChips: storeCharChips(store, ir, analysis),
      loadBearing: refPattern !== undefined,
      storeUsage: usage.ruleCount > 0 ? usage : undefined,
      ...(refPattern !== undefined ? { referencedByNodeId: refPattern.id, referencedByLabel: refPattern.title } : {}),
      ...(pairedStoreIds !== undefined ? { pairedStoreIds } : {}),
      ...(pairedStoreNames !== undefined ? { pairedStoreNames } : {}),
      ...(pairedStoreTriggers !== undefined ? { pairedStoreTriggers } : {}),
      ...(pairedStoreRoles !== undefined ? { pairedStoreRoles } : {}),
      ...(roleLine !== undefined ? { storeRoleLine: roleLine } : {}),
    });
  }

  for (const frag of ir.raw) {
    nodes.push({
      nodeId: frag.nodeId,
      kind: 'raw',
      name: frag.reason,
      rawReason: frag.reason,
      loadBearing: true,
    });
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// annotateRemovalRecommendations — #525 FOUNDATION slice
//
// Separate, pure pass over an already-built CarveNode[] (from toRailNodes()).
// Kept out of toRailNodes() itself so the node-building pass stays free of the
// confirmed-inventory signal — callers that don't have a confirmed inventory
// yet (or don't want recommendations) can use toRailNodes() output unannotated.
//
// Slice-1 scope is deliberately narrow: the ONLY signal is "does this node
// produce any character the author confirmed they want?" No Unicode-block
// signal, no Phase-C mechanism-not-enabled signal, no Track-1 default
// filtering — see the TODO(#525) markers below for each deferred signal's
// natural hook point.
// ---------------------------------------------------------------------------

// Non-literal markers outputToChar()/displayChar() can emit — a placeholder
// means "production unknown", not "produces an unwanted character", so these
// must never be treated as produced chars (they'd otherwise leak into the
// removal-recommendation signal as false "unwanted" output — see #525 P1).
const PLACEHOLDER_CHARS = new Set(['…', '‹dk›', '🔔', '?']);

/**
 * Categorical never-remove guard (#525): a character is never recommended
 * for removal if its Unicode General_Category is a Number (`\p{N}`),
 * Punctuation (`\p{P}`), or Symbol (`\p{S}`) — regardless of target
 * language. CLDR's punctuation/number exemplar tiers are language-specific
 * and often sparse (e.g. Greek `el` doesn't list ASCII `.`/`,`/`0-9`), so
 * these fall outside `needed` and would otherwise look surplus even though
 * they're wanted on essentially every keyboard. Shared by both
 * annotateRemovalRecommendations (node-level) and recommendedRemovalChars
 * (character-level) so the two signals agree.
 *
 * A combining/letter grapheme (base letter + mark) normalizes to category
 * L/M, not N/P/S, so it does NOT match here — surplus letters/marks are
 * still eligible for removal recommendations. Only bare number/punctuation/
 * symbol codepoints are shielded.
 */
function isAlwaysKeepCategory(ch: string): boolean {
  return /^[\p{N}\p{P}\p{S}]$/u.test(ch);
}

/**
 * Produced output characters for a single node — the `.ch` of every glyph
 * (group/pattern) or every store chip (store). Raw fragments produce nothing
 * displayable, so they always resolve to an empty set (→ 'none').
 *
 * Two normalizations vs. the raw `.ch`:
 * - Strips a leading dotted-circle (U+25CC) that displayChar() prefixes onto
 *   combining-mark glyphs for standalone visibility, so a combining mark the
 *   author confirmed (e.g. in confirmedInventory as raw `̀`) still
 *   matches a fan-out glyph whose `.ch` is `◌̀`.
 * - Drops placeholder chars (PLACEHOLDER_CHARS) entirely rather than adding
 *   them to the set — an unresolved index()/outs()/deadkey/beep output is
 *   "don't know what this produces," not "produces an unwanted character."
 */
function producedCharsOf(node: CarveNode, form: CharNormalizationForm = 'NFC'): Set<string> {
  const chars = new Set<string>();
  const add = (raw: string) => {
    const stripped = raw.startsWith('◌') ? raw.slice(1) : raw;
    const normalized = stripped.normalize(form);
    // Placeholder-detection uses NFC regardless of `form`: PLACEHOLDER_CHARS
    // are ASCII/invariant tokens ('…', '‹dk›', '🔔', '?'), identical under
    // every normalization form, so this check is unaffected by `form`.
    if (PLACEHOLDER_CHARS.has(stripped.normalize('NFC'))) return;
    chars.add(normalized);
  };
  for (const g of node.glyphs ?? []) add(g.ch);
  for (const c of node.storeChips ?? []) add(c.ch);
  return chars;
}

// ---------------------------------------------------------------------------
// resolveCoordinatedPartnerItems — SHARED coordinated-partner resolution
// (#525/#931 follow-up review fix — refactor).
//
// Both coordinatedDropHitsNeededChar (boolean short-circuit) and
// coordinatedCollateralForSlots (display-list builder) independently walked
// classifyStoreSlotEdit's `coordinatedWith` and looked up each partner
// store's item at the same `itemsIndex` — this is that walk, written once.
// Pure and read-only: it never re-derives or changes the engine's
// coordinated-drop algorithm (classifyStoreSlotEdit/applyStoreSlotRemovals
// remain the single source of truth for WHICH stores pair and how), it only
// projects what the engine will do.
//
// Takes an ALREADY-CLASSIFIED `mode` rather than (store, ir, analysis) so a
// caller looping over multiple itemsIndex values for the SAME store can
// hoist the classifyStoreSlotEdit call once outside that loop (mode never
// changes across itemsIndex — see the #931-perf fix in
// annotateRemovalRecommendations below).
// ---------------------------------------------------------------------------

/** A coordinated partner store's item at a given slot, resolved from a StoreSlotEditMode. */
interface CoordinatedPartnerItem {
  partnerStore: IRStore;
  /** The partner's char item at the same itemsIndex (never a non-char item — those are skipped). */
  item: Extract<StoreItem, { kind: 'char' }>;
  /** "<partnerStore.nodeId>#<itemsIndex>" — the locked slot-id contract. */
  slotId: string;
}

/**
 * Resolve every coordinated PARTNER store's item at `itemsIndex`, given an
 * already-classified `mode` for the store being edited. Returns `[]` when
 * `mode` is 'blocked' (not this helper's concern — the caller already treats
 * `mode.mode === 'blocked'` as "not simple" separately), has no coordinated
 * partners (`coordinatedWith: []` — e.g. a self-paired or unpaired store),
 * or when a named partner can't be resolved (unknown name, or no char item
 * at that index — a shorter/non-char partner store slot).
 */
function resolveCoordinatedPartnerItems(
  mode: StoreSlotEditMode,
  itemsIndex: number,
  storesByName: ReadonlyMap<string, IRStore>,
): CoordinatedPartnerItem[] {
  if (mode.mode === 'blocked' || mode.coordinatedWith.length === 0) return [];

  const results: CoordinatedPartnerItem[] = [];
  for (const partnerName of mode.coordinatedWith) {
    const partnerStore = storesByName.get(partnerName);
    if (partnerStore === undefined) continue;
    const item = partnerStore.items[itemsIndex];
    if (item === undefined || item.kind !== 'char') continue;
    results.push({ partnerStore, item, slotId: `${partnerStore.nodeId}#${itemsIndex}` });
  }
  return results;
}

/**
 * Coordinated-removal collateral guard ("remove everywhere", #525 v2) —
 * replaces the old store-LEVEL `storeFeedsConfirmedChar` shield, which
 * conflated "some rule referencing this store produces a needed char
 * SOMEWHERE" (store-level, and — via the Cameroon `word` idiom, where a
 * self-referencing index() output resolves back to the WHOLE store's own
 * items — trivially true for almost every store) with the actual question
 * that matters for a specific slot: "would dropping THIS item, via
 * applyStoreSlotRemovals' coordinated pairing graph, also drop a needed
 * character from a PAIRED store at the same position?"
 *
 * `classifyStoreSlotEdit`'s `coordinatedWith` names the store(s) that a drop
 * on `store` splices at the SAME `itemsIndex` (see applyStoreSlotRemovals).
 * A self-paired or unpaired store (`coordinatedWith: []` — e.g. Cameroon's
 * `word`, self-paired with itself in the SAME rule) has no partner, so it can
 * never trip this guard: removing one of its own surplus chars never touches
 * another store's item. A blocked store is not this guard's concern — the
 * caller already treats `mode.mode === 'blocked'` as "not simple" separately.
 *
 * Takes an already-classified `mode` (see resolveCoordinatedPartnerItems)
 * rather than (store, ir, analysis) — callers looping over itemsIndex for
 * the same store hoist classifyStoreSlotEdit once outside the loop.
 */
function coordinatedDropHitsNeededChar(
  mode: StoreSlotEditMode,
  itemsIndex: number,
  needed: ReadonlySet<string>,
  bcp47: string | null | undefined,
  storesByName: ReadonlyMap<string, IRStore>,
  form: CharNormalizationForm = 'NFC',
): boolean {
  const partners = resolveCoordinatedPartnerItems(mode, itemsIndex, storesByName);
  return partners.some(({ item }) =>
    isCharCoveredForLocale(item.value, needed, bcp47 ?? '', form),
  );
}

// ---------------------------------------------------------------------------
// coordinatedCollateralForSlots — manual-carve safety helper (#525/#931
// follow-up, MANUAL-carve gap).
//
// collectCharContributors names the store slots a manual chip/cascade click
// targets DIRECTLY. applyStoreSlotRemovals' coordinated-drop pairing graph
// (classifyStoreSlotEdit's `coordinatedWith`) then ALSO splices every PAIRED
// partner store at the SAME itemsIndex — e.g. removing an input char from a
// deadkey INPUT store silently drops the aligned composed character from the
// OUTPUT store too. That collateral is otherwise invisible to the confirm
// dialog. This pass resolves it explicitly for display: for every slot that
// will actually be dropped (mode 'drop'), it names each coordinated
// partner's character at the same index, flagging whether it's a needed
// character (isNeeded) — reusing resolveCoordinatedPartnerItems, the exact
// same walk coordinatedDropHitsNeededChar above uses for the
// recommendation-signal guard, never a separate heuristic. Does NOT change
// or re-derive the engine's coordinated-drop algorithm itself — purely a
// read-only projection of what applyStoreSlotRemovals will do.
// ---------------------------------------------------------------------------

/** One character collaterally dropped from a PAIRED store by a coordinated removal. */
export interface CoordinatedCollateralChar {
  ch: string;
  storeName: string;
  isNeeded: boolean;
  /**
   * "<partnerStore.nodeId>#<itemsIndex>" — the locked slot-id contract (same
   * convention as CharContributors.storeSlotIds / StoreCharChip.chipId).
   * Lets a caller (e.g. CarveGallery's handleCascadePrimary) fold this
   * partner slot into cascadeDelete's storeSlotIds argument so a confirmed
   * "remove everywhere" persists the collateral drop in deletedItemIds —
   * without this, the Gallery kept showing the collateral char as KEPT even
   * though export-time applyStoreSlotRemovals had already dropped it.
   */
  slotId: string;
}

/**
 * Resolve the coordinated-drop collateral for a set of store-slot ids about
 * to be removed (typically `CharContributors.storeSlotIds` from
 * collectCharContributors). A partner slot already present in `storeSlotIds`
 * itself (i.e. already an explicit removal target, not a hidden surprise) is
 * excluded — this surfaces only the collateral the author did NOT already
 * ask to remove. Deduped by partner slot id (a partner can only be hit once
 * per index, but two different requested slots could in principle name the
 * same partner+index).
 *
 * @param storeSlotIds Slot ids ("<storeNodeId>#<itemsIndex>") targeted for removal.
 * @param ir           The full IR.
 * @param needed       Confirmed-inventory ∪ CLDR needed-set — the same union the
 *                      caller already threads into annotateRemovalRecommendations /
 *                      recommendedRemovalChars.
 * @param bcp47        Target language, for the Turkic-aware case fold in isCharCoveredForLocale.
 * @param analysis     Optional precomputed analyzeStores(ir) result (see StoreAnalysis doc) —
 *                      pass this when calling for many removals against the same ir.
 * @param form         Normalization form both `needed` and the resolved collateral
 *                      character are compared under (default "NFC", preserving
 *                      pre-existing behavior) — see isCharCoveredForLocale's `form` doc.
 */
export function coordinatedCollateralForSlots(
  storeSlotIds: readonly string[],
  ir: KeyboardIR,
  needed: ReadonlySet<string>,
  bcp47?: string | null,
  analysis: StoreAnalysis = analyzeStores(ir),
  form: CharNormalizationForm = 'NFC',
): CoordinatedCollateralChar[] {
  if (storeSlotIds.length === 0) return [];

  // storesByNodeId resolves the TARGETED slot's own store (keyed by nodeId,
  // as parseSlotId yields) — not carried by StoreAnalysis, which keys by
  // name. storesByName (partner-name resolution) IS carried by StoreAnalysis
  // (analysis.storeByName), so it is reused rather than rebuilt (#931 perf).
  const storesByNodeId = new Map(ir.stores.map((s) => [s.nodeId, s]));
  const targetSlotIds = new Set(storeSlotIds);
  const seenPartnerSlotIds = new Set<string>();
  const collateral: CoordinatedCollateralChar[] = [];

  for (const slotId of storeSlotIds) {
    const parsed = parseSlotId(slotId);
    if (parsed === null) continue;
    const store = storesByNodeId.get(parsed.storeNodeId);
    if (store === undefined) continue;

    const mode = classifyStoreSlotEdit(store, ir, analysis);
    const partners = resolveCoordinatedPartnerItems(mode, parsed.itemsIndex, analysis.storeByName);

    for (const { partnerStore, item, slotId: partnerSlotId } of partners) {
      if (targetSlotIds.has(partnerSlotId) || seenPartnerSlotIds.has(partnerSlotId)) continue;

      seenPartnerSlotIds.add(partnerSlotId);
      const ch = item.value.normalize(form);
      collateral.push({
        ch,
        storeName: partnerStore.name,
        isNeeded: isCharCoveredForLocale(ch, needed, bcp47 ?? '', form),
        slotId: partnerSlotId,
      });
    }
  }

  return collateral;
}

/**
 * Guardrail (#525 items 2/4 — language-driven surplus, confirmed with the
 * user): recognized patterns, opaque/raw fragments, and deadkey/fan-out
 * mechanisms are structural, not simple character producers, so neither
 * signal (inventory-only or language-surplus) may ever recommend removing
 * them, however "surplus" their output looks in isolation.
 *
 * - 'pattern' nodes — owned by a recognized pattern; a rule-level version of
 *   this exclusion already keeps pattern-owned rules out of 'group' nodes
 *   (see ownedByPattern / collectOwnedNodeIds in groupToGlyphs), so excluding
 *   the 'pattern' CardKind here covers "recognized-pattern rules" too.
 * - 'raw' nodes — opaque RawKmnFragment; never produce glyphs anyway
 *   (produced.size === 0 already resolves to 'none'), excluded explicitly
 *   for clarity rather than relying on that side effect.
 * - 'group' nodes containing a deadkey-context rule, a deadkey-*registration*
 *   rule (output `dk(...)`, e.g. `+ [K_COLON] > dk(003b)`), or a
 *   parallel-store fan-out rule (isParallelIndexFanOut — the same predicate
 *   the S-02 deadkey-body/Bamum-transliteration classifier uses) — a deadkey
 *   mechanism's characters are locked together structurally; recommending
 *   removal from the character signal alone could break the composition
 *   without the author realizing it's part of a deadkey chain. Registration
 *   rules commonly live in a different group than the deadkey's consuming
 *   context rules (e.g. `group(main)` registers via output, `group(deadkeys)`
 *   consumes via context) — checking output as well as context catches that
 *   split idiom.
 *
 * Only plain letter/glyph producers (ordinary 'group' rules with no deadkey
 * involvement) and store-char producers ('store' nodes) are eligible.
 *
 * @param ownedNodeIds Precomputed collectOwnedNodeIds(ir) — hoisted by the
 *                      caller (annotateRemovalRecommendations) so this
 *                      O(rules) scan isn't repeated for every group node.
 */
function isStructuralExclusion(node: CarveNode, ir: KeyboardIR, ownedNodeIds: Set<string>): boolean {
  if (node.kind === 'pattern' || node.kind === 'raw') return true;
  if (node.kind !== 'group') return false;

  const group = ir.groups.find((g) => g.nodeId === node.nodeId);
  if (!group) return false;

  return group.rules.some((rule) => {
    if (rule.ownedByPattern !== undefined || ownedNodeIds.has(rule.nodeId)) return false; // owned by a pattern — not this group's concern
    return (
      rule.context.some((el) => el.kind === 'deadkey') ||
      rule.output.some((el) => el.kind === 'deadkey') ||
      isParallelIndexFanOut(rule)
    );
  });
}

/**
 * Annotates each node's `recommendation` field. See CarveNode.recommendation
 * for the meaning of each value; slice-1/2 only ever emit 'high' or 'none'.
 *
 * Conservative by design — "when in doubt, return 'none'": a node is 'high'
 * iff it is not structurally excluded (isStructuralExclusion above), produces
 * at least one character, and every character it produces is absent from
 * `needed` AND (for stores) no rule that references it produces a needed
 * character (the dependency guard above).
 *
 * `needed` (#525 items 2/4 — language-driven surplus) is the union of
 * `neededChars` (a target language's CLDR exemplar set, resolved upstream —
 * see neededCharsForLanguage) and `confirmedInventory` (the author's Phase B
 * choices). Passing `neededChars` as null/undefined (CLDR unavailable for
 * this language, or not yet resolved) falls back to the original
 * inventory-only behavior — `needed` degrades to `confirmedInventory` alone,
 * so this is backward-compatible with 3-argument callers. If BOTH sets are
 * empty, there is no signal at all — every node gets 'none' rather than a
 * spurious "everything is unwanted" result.
 *
 * Membership against `needed` is case-folded via `isCharCoveredForLocale`
 * (reusing suggestMissing.ts's `isCovered` exception-aware fold, incl. the
 * Turkic dotted-I exception) rather than exact-match: CLDR exemplars are
 * lowercase-only, so a keyboard producing an uppercase accented letter (e.g.
 * French "É") must still count as needed. `bcp47` is required for the Turkic
 * exception check; when omitted (no target language resolved yet), a plain
 * non-Turkic fold is used.
 *
 * `form` (default "NFC", preserving pre-046-carve behavior) is the
 * normalization form the marks series' output-form decision resolves to
 * (see `normalizationFormForOutputForm` — "ready-made" => "NFC",
 * "base-plus-mark" => "NFD"). BOTH the produced-character set (via
 * `producedCharsOf`) and `needed` are normalized to this SAME form before
 * comparison, so the chosen output form actually drives which combo
 * grapheme (precomposed vs. decomposed) counts as a match — the "apples to
 * apples" carve-gallery comparison. `needed`'s members are re-normalized
 * here rather than trusted as already-`form`-normalized, since callers may
 * pass sets built against the default NFC assumption.
 */
export function annotateRemovalRecommendations(
  nodes: CarveNode[],
  ir: KeyboardIR,
  confirmedInventory: ReadonlySet<string>,
  neededChars?: ReadonlySet<string> | null,
  bcp47?: string | null,
  form: CharNormalizationForm = 'NFC',
): CarveNode[] {
  const renormalize = (set: ReadonlySet<string>): Set<string> => new Set([...set].map((ch) => ch.normalize(form)));
  const needed: ReadonlySet<string> = neededChars
    ? renormalize(new Set([...neededChars, ...confirmedInventory]))
    : renormalize(confirmedInventory);

  if (needed.size === 0) {
    return nodes.map((node) => ({ ...node, recommendation: 'none' }));
  }

  const ownedNodeIds = collectOwnedNodeIds(ir);
  // '' is a safe "no locale known" default: primarySubtag('') is '' which is
  // never in TURKIC_LOCALES, so isCharCoveredForLocale falls back to a plain
  // (non-Turkic) case fold — matching pre-fix exact-match behavior's intent
  // as closely as possible when the target language hasn't resolved yet.
  const isNeeded = (ch: string): boolean => isCharCoveredForLocale(ch, needed, bcp47 ?? '', form);

  // Precomputed ONCE per IR (not per store node) — classifyStoreSlotEdit scans
  // every rule in the IR, mirroring recommendedRemovalChars' perf note below.
  // storesByName is NOT rebuilt here — analysis.storeByName already carries
  // an identical name-keyed map (#931 perf).
  const analysis = analyzeStores(ir);
  const storesByNodeId = new Map(ir.stores.map((s) => [s.nodeId, s]));

  return nodes.map((node) => {
    if (isStructuralExclusion(node, ir, ownedNodeIds)) return { ...node, recommendation: 'none' };

    const produced = producedCharsOf(node, form);
    if (produced.size === 0) return { ...node, recommendation: 'none' };

    for (const ch of produced) {
      if (isNeeded(ch) || isAlwaysKeepCategory(ch)) return { ...node, recommendation: 'none' };
    }

    if (node.kind === 'store') {
      const store = storesByNodeId.get(node.nodeId);
      if (store !== undefined) {
        // classifyStoreSlotEdit is index-INDEPENDENT (it classifies the whole
        // store, not a single slot) — hoisted out of the itemsIndex loop below
        // so it runs ONCE per store instead of once per item (#931 perf).
        const mode = classifyStoreSlotEdit(store, ir, analysis);
        for (let i = 0; i < store.items.length; i++) {
          if (coordinatedDropHitsNeededChar(mode, i, needed, bcp47, analysis.storeByName, form)) {
            return { ...node, recommendation: 'none' };
          }
        }
      }
    }

    // TODO(#525): fold in the Unicode-block signal here (a node whose produced
    // chars all fall in a block the author's script routing never touches is a
    // softer 'medium' signal, not 'high') once §9 routing exposes block ranges.
    // TODO(#525): fold in the Phase-C mechanism-not-enabled signal here (a node
    // that exists only to support a mechanism the author didn't select in
    // Phase C survey answers) once that mechanism-selection data is threaded
    // through to the carve step.
    return { ...node, recommendation: 'high' };
  });
}

// ---------------------------------------------------------------------------
// recommendedRemovalChars — #525 BANNER slice
//
// Character-level removal-recommendation signal, sibling to
// annotateRemovalRecommendations's node-level 'high'/'none' pass above. The
// banner's flat checklist operates at CHARACTER granularity, not node
// granularity — a node can mix simple and structural producers of the SAME
// character (e.g. a plain group rule AND a deadkey fan-out both happen to
// produce the same surplus letter), so the node-level signal alone can't
// drive a per-character checklist safely. This pass re-derives its own
// producer-simplicity check per character via collectCharContributors,
// rather than reusing isStructuralExclusion (which is node-scoped).
// ---------------------------------------------------------------------------

/**
 * Allowlist predicate (NOT a blocklist): true iff `rule` is a provably-simple,
 * single-character producer — safe to fold into the character-level removal
 * banner without risking a structural mechanism.
 *
 * A simple rule has EXACTLY:
 *   - one context element, of kind 'char' or 'vkey' — a bare key press or a
 *     literal preceding character. Any deadkey/any/notany/context/index/
 *     baselayout/raw context element fails this (wrong kind, or the extra
 *     element pushes context.length past 1 — which is also how an if()/
 *     set()/platform() guard is rejected, since the codec represents those
 *     as additional context elements).
 *   - one output element, of kind 'char'. Any deadkey/index()/outs()/beep/
 *     useGroup/raw output element fails this. A base+combining-mark pair
 *     that NFC-composes to one visible glyph is still two IR elements and
 *     is rejected here too, even though collectCharContributors treats it
 *     as a whole-rule producer (see the ruleNodeIds loop below).
 *   - NOT owned by a recognized pattern (ownedByPattern === undefined) — a
 *     pattern-owned rule is part of a structural mechanism the recognizer
 *     already identified, mirroring isStructuralExclusion's 'pattern'
 *     exclusion at the node level.
 *
 * Default-safe: any shape this predicate doesn't explicitly recognize as
 * simple returns false.
 *
 * Deliberately NOT the same predicate as `isS01` in
 * `packages/engine/src/recognizer/rules/s01-simple-swap.ts` (the "Simple
 * swap" pattern recognizer) or the `'removable:simple'` capability from
 * `classifyRemovalCapabilities` — this is a narrower, character-signal-only
 * allowlist, so the two differences are intentional, not drift:
 *   - this predicate accepts a bare `char`-kind context element (one literal
 *     preceding character), which isS01 does not (isS01 requires a `vkey`
 *     context); isS01/removable:simple would reject such a rule.
 *   - this predicate does NOT exclude group "deadkeys" the way isS01 does —
 *     structural deadkey exclusion for the banner checklist is handled
 *     separately, upstream, via the per-producer `blocked`/store-mode checks
 *     in `recommendedRemovalChars` below.
 * If either isS01 or classifyRemovalCapabilities's simple-shape check
 * changes, re-check whether this predicate should follow — they are not
 * mechanically linked.
 */
export function isSimpleRemovableRule(rule: IRRule): boolean {
  if (rule.ownedByPattern !== undefined) return false;
  if (rule.context.length !== 1) return false;
  const ctx = rule.context[0];
  if (ctx === undefined || (ctx.kind !== 'char' && ctx.kind !== 'vkey')) return false;
  if (rule.output.length !== 1) return false;
  const out = rule.output[0];
  if (out === undefined || out.kind !== 'char') return false;
  return true;
}

/** A single recommended-removal character for the CarveGallery banner checklist. */
export interface RecommendedRemovalChar {
  ch: string;
  /** Contributor info for removal — pass straight to cascadeDelete(contributors.ruleNodeIds, contributors.storeSlotIds). */
  contributors: CharContributors;
}

/**
 * Character-level removal-recommendation signal for the CarveGallery banner
 * (#525 BANNER slice). A produced character `ch` is recommended iff ALL hold:
 *
 *   1. Surplus — `ch` is absent from `needed` (case-folded via
 *      isCharCoveredForLocale, same fold annotateRemovalRecommendations
 *      uses). The caller pre-unions neededChars ∪ confirmedInventory into
 *      `needed` — this function does no signal-merging of its own. `ch` is
 *      also never surplus if it falls in the categorical never-remove guard
 *      (isAlwaysKeepCategory — Unicode Number/Punctuation/Symbol), which
 *      overrides any language-specific CLDR exemplar-tier gap.
 *   2. Allowlist rule-shielding — EVERY producer of `ch` (resolved via
 *      collectCharContributors) is provably simple:
 *        - any collectCharContributors `blocked` entry (opaque fragment, or
 *          a multi-char/partial literal run) shields immediately.
 *        - a character with NO producers found at all (an unrecognized
 *          shape collectCharContributors can't classify) shields —
 *          default-safe.
 *        - each ruleNodeIds entry must resolve to a real rule and pass
 *          isSimpleRemovableRule.
 *        - each storeSlotIds entry (`<storeNodeId>#<i>`) must resolve to a
 *          real store whose classifyStoreSlotEdit mode is 'drop' — never
 *          'blocked' (notany-widens/context-index-aligned/system-store/
 *          unresolved-index-pairing/outs-reference-unanalyzed).
 *   3. Coordinated-removal collateral guard ("remove everywhere", #525 v2) —
 *      for each contributing store slot `store#i`, resolving
 *      `classifyStoreSlotEdit`'s `coordinatedWith` partners and checking
 *      whether any partner store's item AT THE SAME INDEX `i` is itself a
 *      needed character (`coordinatedDropHitsNeededChar`, shared with the
 *      node-level pass above). A self-paired or unpaired store
 *      (`coordinatedWith: []`) has no partner and can never shield on this
 *      account — this is deliberately narrower than the old store-level
 *      `storeFeedsConfirmedChar` shield it replaces, which treated "some
 *      rule referencing this store produces ANY needed char anywhere" as
 *      grounds to shield EVERY character the store contributes to (the
 *      Cameroon `word`-store over-coarse-guard bug — `word` self-feeds the
 *      whole Latin alphabet AND a needed Greek letter, so the old guard
 *      shielded every Latin letter).
 *
 * Returns [] when `needed` is empty — no signal at all yet (mirrors
 * annotateRemovalRecommendations's "no default is a defect until we're
 * sure" stance), so the banner never shows before Phase B/CLDR resolves.
 *
 * `form` (default "NFC", preserving pre-046-carve behavior) — see
 * annotateRemovalRecommendations's matching doc. `buildProducedSet` (from
 * contracts) always returns NFC; rather than touching that shared helper
 * (used well beyond carve), its output is re-normalized to `form` here at
 * this comparison seam, alongside `needed`, so both sides of the
 * surplus-detection match under the SAME form.
 */
export function recommendedRemovalChars(args: {
  ir: KeyboardIR;
  needed: ReadonlySet<string>;
  bcp47?: string | null | undefined;
  form?: CharNormalizationForm;
}): RecommendedRemovalChar[] {
  const { ir, needed: rawNeeded, bcp47, form = 'NFC' } = args;
  if (rawNeeded.size === 0) return [];
  const needed = new Set([...rawNeeded].map((ch) => ch.normalize(form)));

  const produced = new Set([...buildProducedSet(ir)].map((ch) => ch.normalize(form)));
  const storesById = new Map(ir.stores.map((s) => [s.nodeId, s]));
  const rulesById = new Map<string, IRRule>();
  for (const group of ir.groups) {
    for (const rule of group.rules) rulesById.set(rule.nodeId, rule);
  }
  // Precomputed ONCE per IR, not per candidate character — classifyStoreSlotEdit
  // scans every rule in the IR, and this loop can call it once per contributing
  // store of EVERY candidate character, so without this it's O(chars * rules)
  // rather than O(chars + rules). (#931 perf)
  const analysis = analyzeStores(ir);

  const results: RecommendedRemovalChar[] = [];

  for (const ch of produced) {
    if (isCharCoveredForLocale(ch, needed, bcp47 ?? '', form)) continue; // needed — not a candidate
    if (isAlwaysKeepCategory(ch)) continue; // digit/punctuation/symbol — never a removal candidate

    const contributors = collectCharContributors(ir, ch);

    // Any blocked producer (opaque fragment, multi-char/partial literal run)
    // shields immediately; so does finding NO producer at all (unrecognized
    // shape — default-safe).
    if (contributors.blocked.length > 0) continue;
    if (contributors.ruleNodeIds.length === 0 && contributors.storeSlotIds.length === 0) continue;

    let allSimple = true;
    for (const ruleId of contributors.ruleNodeIds) {
      const rule = rulesById.get(ruleId);
      if (rule === undefined || !isSimpleRemovableRule(rule)) { allSimple = false; break; }
    }

    let dependsOnNeeded = false;
    if (allSimple) {
      for (const slotId of contributors.storeSlotIds) {
        const parsed = parseSlotId(slotId);
        if (parsed === null) { allSimple = false; break; }
        const store = storesById.get(parsed.storeNodeId);
        if (store === undefined) { allSimple = false; break; }
        const mode = classifyStoreSlotEdit(store, ir, analysis);
        if (mode.mode === 'blocked') { allSimple = false; break; }
        // Reuses the `mode` just computed above — coordinatedDropHitsNeededChar
        // takes an already-classified mode rather than re-deriving it (#931 perf).
        if (coordinatedDropHitsNeededChar(mode, parsed.itemsIndex, needed, bcp47, analysis.storeByName, form)) {
          dependsOnNeeded = true;
          break;
        }
      }
    }

    if (!allSimple || dependsOnNeeded) continue;

    results.push({ ch, contributors });
  }

  return results;
}
