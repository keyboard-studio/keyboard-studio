// Helpers to convert raw IR types into display-ready structures for the carve cards.

import type {
  ContextElement,
  OutputElement,
  IRRule,
  IRGroup,
  KeyboardIR,
  Pattern,
  RemovalCapability,
  StoreItem,
} from '@keyboard-studio/contracts';
import { isParallelIndexFanOut } from '@keyboard-studio/engine';
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
// isCombining — true for Unicode non-spacing marks (Mn category, all scripts)
// ---------------------------------------------------------------------------

export const isCombining = (ch: string) => {
  return /^\p{Mn}$/u.test(ch ?? '');
};

// Render-ready character: prefix combining marks with a dotted circle so they're visible standalone.
export function displayChar(ch: string): string {
  return isCombining(ch) ? '◌' + ch : ch;
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
  '̀': 'COMBINING GRAVE ACCENT',
  '́': 'COMBINING ACUTE ACCENT',
  '̂': 'COMBINING CIRCUMFLEX ACCENT',
  '̃': 'COMBINING TILDE',
  '̄': 'COMBINING MACRON',
  '̅': 'COMBINING OVERLINE',
  '̆': 'COMBINING BREVE',
  '̇': 'COMBINING DOT ABOVE',
  '̈': 'COMBINING DIAERESIS',
  '̉': 'COMBINING HOOK ABOVE',
  '̊': 'COMBINING RING ABOVE',
  '̋': 'COMBINING DOUBLE ACUTE ACCENT',
  '̌': 'COMBINING CARON',
  '̍': 'COMBINING VERTICAL LINE ABOVE',
  '̏': 'COMBINING DOUBLE GRAVE ACCENT',
  '̣': 'COMBINING DOT BELOW',
  '̤': 'COMBINING DIAERESIS BELOW',
  '̥': 'COMBINING RING BELOW',
  '̧': 'COMBINING CEDILLA',
  '̨': 'COMBINING OGONEK',
  '̰': 'COMBINING TILDE BELOW',
  '̱': 'COMBINING MACRON BELOW',
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
        keys.push(el.value);
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
  for (const el of output) {
    switch (el.kind) {
      case 'char':
        return el.value;
      case 'deadkey':
        return '‹dk›';
      case 'index':
        return '…';
      case 'outs':
        return '…';
      case 'beep':
        return '🔔';
      case 'raw':
        return '?';
    }
  }
  return '?';
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
// ruleStoreOwners — distinct named (non-system) stores a rule reads from or
// writes to, as GlyphOwner tags. Mirrors the element-kind checks already
// used by describeRuleForStore/analyzeStoreUsage (context: any/notany/index;
// output: index/outs) so the "store tag" render layer and the store "Used
// by" panel never drift on which elements count as a store reference.
// Store resolution is by name (ir.stores.find(s => s.name === ...)), so if
// two stores share a name the first one wins — a pre-existing, Keyman-legal
// but rare ambiguity shared with describeRuleForStore/analyzeStoreUsage, not
// introduced here.
// ---------------------------------------------------------------------------

function ruleStoreOwners(rule: IRRule, ir: KeyboardIR): GlyphOwner[] {
  const storeNames: string[] = [];
  const seenNames = new Set<string>();
  const addName = (name: string) => {
    if (!seenNames.has(name)) { seenNames.add(name); storeNames.push(name); }
  };

  for (const el of rule.context) {
    if (el.kind === 'any' || el.kind === 'notany' || el.kind === 'index') addName(el.storeRef);
  }
  for (const el of rule.output) {
    if (el.kind === 'index' || el.kind === 'outs') addName(el.storeRef);
  }

  const owners: GlyphOwner[] = [];
  const seenNodeIds = new Set<string>();
  for (const name of storeNames) {
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

export function groupToGlyphs(group: IRGroup, ir: KeyboardIR = EMPTY_IR, capabilities: Map<string, RemovalCapability> = new Map(), ownedNodeIds: Set<string> = new Set()): CarveGlyph[] {
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
// storeChars — extract displayable characters from a store's items
// ---------------------------------------------------------------------------

export function storeChars(store: { items: StoreItem[] }): string[] {
  return store.items
    .filter((item) => item.kind === 'char')
    .map((item) => (item as { kind: 'char'; value: string }).value);
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
      case 'char':       parts.push(`"${el.value}"`); break;
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

function describeRuleForStore(rule: IRRule, storeName: string): StoreRuleDetail {
  const ctxRefIdx = rule.context.findIndex((el) =>
    ((el.kind === 'any' || el.kind === 'notany') && el.storeRef === storeName) ||
    (el.kind === 'index' && el.storeRef === storeName),
  );

  // The raw('+') element marks the keystroke boundary — refs after it are the active keypress
  const plusIdx = rule.context.findIndex((el) => el.kind === 'raw' && el.text.trim() === '+');
  // ctxRefIdx === -1 means store is output-only (not a keystroke trigger)
  const isKeystroke = ctxRefIdx !== -1 && (plusIdx === -1 || ctxRefIdx > plusIdx);

  const preceding = ctxRefIdx > 0 ? rule.context.slice(0, ctxRefIdx) : [];

  // Strip platform() guards from preceding — they're rule-level platform restrictions, not character context
  let platformGuard: string | null = null;
  const precedingFiltered = preceding.filter((el) => {
    if (el.kind !== 'raw') return true;
    const m = PLATFORM_GUARD_RE.exec(el.text);
    if (m) { platformGuard = m[1] ?? null; return false; }
    return true;
  });

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
      let used = false;
      for (const el of rule.context) {
        if ((el.kind === 'any' || el.kind === 'notany') && el.storeRef === storeName) {
          used = true; asSource = true;
        } else if (el.kind === 'index' && el.storeRef === storeName) {
          used = true; asOutput = true;
        }
      }
      for (const el of rule.output) {
        if ((el.kind === 'index' || el.kind === 'outs') && el.storeRef === storeName) {
          used = true; asOutput = true;
        }
      }
      if (used) {
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
        let used = false;
        for (const el of rule.context) {
          if ((el.kind === 'any' || el.kind === 'notany') && el.storeRef === storeName) used = true;
          if (el.kind === 'index' && el.storeRef === storeName) used = true;
        }
        for (const el of rule.output) {
          if ((el.kind === 'index' || el.kind === 'outs') && el.storeRef === storeName) used = true;
        }
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
      let used = false;
      for (const el of rule.context) {
        if ((el.kind === 'any' || el.kind === 'notany') && el.storeRef === storeName) used = true;
        if (el.kind === 'index' && el.storeRef === storeName) used = true;
      }
      for (const el of rule.output) {
        if ((el.kind === 'index' || el.kind === 'outs') && el.storeRef === storeName) used = true;
      }
      if (used) gRules.push(describeRuleForStore(rule, storeName));
    }
    if (gRules.length > 0) groupRefs.push({ groupId: group.nodeId, groupName: group.name, ruleCount: gRules.length, rules: gRules });
  }

  return { ruleCount, asSource, asOutput, groupNames: [...groupNameSet], patternRefs, groupRefs };
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
  displayChars?: string[] | undefined;     // stores
  rawReason?: string | undefined;          // raw fragments
  referencedByNodeId?: string | undefined; // store: which pattern owns it
  referencedByLabel?: string | undefined;  // store: that pattern's title
  storeUsage?: StoreUsage | undefined;     // store: how it is used in rules
}

// ---------------------------------------------------------------------------
// glyphsTriState — tri-state derived purely from a flat CarveGlyph array
// ---------------------------------------------------------------------------

export function glyphsTriState(
  glyphs: CarveGlyph[],
  isItemDeleted: (id: string) => boolean,
): 'on' | 'partial' | 'off' {
  const off = glyphs.filter((g) => isItemDeleted(g.gid)).length;
  if (off === 0) return 'on';
  if (off === glyphs.length) return 'off';
  return 'partial';
}

// ---------------------------------------------------------------------------
// nodeState — tri-state based on individual glyph or node deletion
// ---------------------------------------------------------------------------

export function nodeState(
  node: CarveNode,
  isItemDeleted: (id: string) => boolean,
  isDeleted: (id: string) => boolean,
): 'on' | 'partial' | 'off' {
  if (node.glyphs && node.glyphs.length > 0) {
    return glyphsTriState(node.glyphs, isItemDeleted);
  }
  return isDeleted(node.nodeId) ? 'off' : 'on';
}

// ---------------------------------------------------------------------------
// toRailNodes — build the full node list for the Rail from a KeyboardIR
// ---------------------------------------------------------------------------

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

  for (const store of ir.stores) {
    if (store.isSystem) continue;
    const refPattern = recognized.find((p) =>
      p.ownedNodes?.some((n) => n.nodeId === store.nodeId),
    );
    const usage = analyzeStoreUsage(store.name, ir);
    nodes.push({
      nodeId: store.nodeId,
      kind: 'store',
      name: store.name,
      displayChars: storeChars(store),
      loadBearing: refPattern !== undefined,
      storeUsage: usage.ruleCount > 0 ? usage : undefined,
      ...(refPattern !== undefined ? { referencedByNodeId: refPattern.id, referencedByLabel: refPattern.title } : {}),
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

