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
export interface HoverGlyph extends Pick<CarveGlyph, 'keys' | 'ch' | 'capability'> {
  off: boolean;
}

export interface CarveGlyph {
  gid: string;
  keys: string[];
  ch: string;
  modifierLayer: ModifierLayer;
  modifierLabel: string;
  capability: RemovalCapability;
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

    glyphs.push({ gid, keys, ch, modifierLayer: modLayer, modifierLabel: modLabel, capability: slotCapability });
  }

  return glyphs;
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
  return [{
    gid: rule.nodeId,
    keys,
    ch,
    modifierLayer: ruleModifier(rule),
    modifierLabel: modifierLabel(rule),
    capability: capabilities.get(rule.nodeId) ?? 'not-removable:unknown',
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

export function groupToGlyphs(group: IRGroup, ir: KeyboardIR = EMPTY_IR, capabilities: Map<string, RemovalCapability> = new Map()): CarveGlyph[] {
  const glyphs: CarveGlyph[] = [];
  const seen = new Set<string>();
  group.rules.forEach((rule) => {
    if (rule.ownedByPattern !== undefined) return;
    for (const g of ruleToGlyphs(rule, ir, capabilities)) {
      if (!seen.has(g.gid)) { seen.add(g.gid); glyphs.push(g); }
    }
  });
  return glyphs;
}

// ---------------------------------------------------------------------------
// patternToGlyphs — derive character map from a Pattern's owned IR rules
// ---------------------------------------------------------------------------

export function patternToGlyphs(pattern: Pattern, ir: KeyboardIR, capabilities: Map<string, RemovalCapability> = new Map()): CarveGlyph[] {
  if (!pattern.ownedNodes || pattern.ownedNodes.length === 0) return [];

  const ownedIds = new Set(pattern.ownedNodes.map((n) => n.nodeId));
  const glyphs: CarveGlyph[] = [];
  const seen = new Set<string>();

  for (const group of ir.groups) {
    group.rules.forEach((rule) => {
      if (!ownedIds.has(rule.nodeId)) return;
      for (const g of ruleToGlyphs(rule, ir, capabilities)) {
        if (!seen.has(g.gid)) { seen.add(g.gid); glyphs.push(g); }
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
  const groupRefs: { groupId: string; groupName: string; ruleCount: number; rules: StoreRuleDetail[] }[] = [];
  for (const group of ir.groups) {
    const gRules: StoreRuleDetail[] = [];
    for (const rule of group.rules) {
      if (rule.ownedByPattern !== undefined) continue; // skip — already counted in patternRefs
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
  displayChars?: string[] | undefined;     // stores
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
  const plusIdx = context.findIndex((el) => el.kind === 'raw' && el.text.trim() === '+');
  if (plusIdx === -1) return undefined;
  const triggerEl = context[plusIdx + 1];
  if (!triggerEl) return undefined;
  switch (triggerEl.kind) {
    case 'vkey':    return vkeyLabel(triggerEl.name) ?? triggerEl.name;
    case 'char':    return `"${triggerEl.value}"`;
    case 'deadkey': return `deadkey ${triggerEl.id}`;
    default:        return undefined;
  }
}

// ---------------------------------------------------------------------------
// detectStorePairs — find any(storeA)/index(storeB) peer relationships
// ---------------------------------------------------------------------------

/** A single entry in the detectStorePairs result: a peer store plus the trigger key that fires the swap. */
export interface StorePairEntry {
  pairedName: string;
  /** Human-readable trigger key label (e.g. "Backspace", "A"); undefined when not determinable. */
  trigger: string | undefined;
}

/**
 * For each rule that has both an any(storeA) element in its context AND an
 * index(storeB, …) element in its output, record storeA → storeB and
 * storeB → storeA as paired peers, capturing the trigger key for each pair.
 *
 * Returns a map of storeName → StorePairEntry[] (deduplicated by pairedName,
 * trigger taken from the first matching rule). Sorted by pairedName.
 * Only `any()`/`index()` pairing is in scope (no deadkey elements).
 */
export function detectStorePairs(ir: KeyboardIR): Map<string, StorePairEntry[]> {
  // Inner map: storeName → Map<pairedName, trigger>
  const pairsMap = new Map<string, Map<string, string | undefined>>();

  const addPair = (a: string, b: string, trigger: string | undefined) => {
    if (a === b) return;
    if (!pairsMap.has(a)) pairsMap.set(a, new Map());
    if (!pairsMap.has(b)) pairsMap.set(b, new Map());
    // Only record trigger on first observation (first matching rule wins)
    if (!pairsMap.get(a)!.has(b)) pairsMap.get(a)!.set(b, trigger);
    if (!pairsMap.get(b)!.has(a)) pairsMap.get(b)!.set(a, trigger);
  };

  for (const group of ir.groups) {
    for (const rule of group.rules) {
      // Collect all any() store names from context
      const anyStores: string[] = [];
      for (const el of rule.context) {
        if (el.kind === 'any' && el.storeRef !== undefined) {
          anyStores.push(el.storeRef);
        }
      }
      if (anyStores.length === 0) continue;

      // Collect all index() store names from output
      const indexStores: string[] = [];
      for (const el of rule.output) {
        if (el.kind === 'index' && el.storeRef !== undefined) {
          indexStores.push(el.storeRef);
        }
      }
      if (indexStores.length === 0) continue;

      const trigger = triggerKeyLabel(rule.context);

      // Cross-pair: every any() store is paired with every index() store in this rule
      for (const a of anyStores) {
        for (const b of indexStores) {
          addPair(a, b, trigger);
        }
      }
    }
  }

  // Convert to StorePairEntry[] sorted by pairedName
  const result = new Map<string, StorePairEntry[]>();
  for (const [name, peers] of pairsMap) {
    const entries: StorePairEntry[] = [...peers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pairedName, trigger]) => ({ pairedName, trigger }));
    result.set(name, entries);
  }
  return result;
}

// ---------------------------------------------------------------------------
// toRailNodes — build the full node list for the Rail from a KeyboardIR
// ---------------------------------------------------------------------------

export function toRailNodes(ir: KeyboardIR, capabilities: Map<string, RemovalCapability> = new Map()): CarveNode[] {
  const nodes: CarveNode[] = [];
  const recognized = ir.recognizedPatterns.filter((p) => p.origin === 'recognized');

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
    if (!group.rules.some((r) => r.ownedByPattern === undefined)) continue;
    const glyphs = groupToGlyphs(group, ir, capabilities);
    nodes.push({
      nodeId: group.nodeId,
      kind: 'group',
      name: group.name,
      ...(glyphs[0]?.ch !== undefined ? { trigger: glyphs[0].ch } : {}),
      glyphs,
    });
  }

  const storePairs = detectStorePairs(ir);

  // Build a name→nodeId lookup for resolving paired store names to nodeIds
  const storeNameToNodeId = new Map<string, string>(
    ir.stores.filter((s) => !s.isSystem).map((s) => [s.name, s.nodeId]),
  );

  for (const store of ir.stores) {
    if (store.isSystem) continue;
    const refPattern = recognized.find((p) =>
      p.ownedNodes?.some((n) => n.nodeId === store.nodeId),
    );
    const usage = analyzeStoreUsage(store.name, ir);

    const pairedEntries = storePairs.get(store.name);
    const hasPairs = pairedEntries !== undefined && pairedEntries.length > 0;
    const pairedStoreNames = hasPairs ? pairedEntries.map((e) => e.pairedName) : undefined;
    // Keep index-aligned with pairedStoreNames/Triggers/Roles: an unresolved
    // peer (e.g. a system store, absent from storeNameToNodeId) stays as an
    // undefined slot rather than being filtered out, which would shift every
    // later pair's id/trigger/role by one. Inspector guards undefined per-slot.
    const pairedStoreIds = hasPairs
      ? pairedEntries.map((e) => storeNameToNodeId.get(e.pairedName))
      : undefined;
    const pairedStoreTriggers = hasPairs ? pairedEntries.map((e) => e.trigger) : undefined;
    const pairedStoreRoles: ('input' | 'output' | 'input+output' | undefined)[] | undefined = hasPairs
      ? pairedEntries.map((e) => {
          const u = analyzeStoreUsage(e.pairedName, ir);
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
      displayChars: storeChars(store),
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
