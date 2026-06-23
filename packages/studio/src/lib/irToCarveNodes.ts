// Helpers to convert raw IR types into display-ready structures for the carve cards.

import type {
  ContextElement,
  OutputElement,
  IRRule,
  IRGroup,
  KeyboardIR,
  Pattern,
  StoreItem,
} from '@keyboard-studio/contracts';
export type CardKind = 'pattern' | 'group' | 'store' | 'raw';

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

// A glyph tile the user is hovering/focusing, plus its current removed state — used by the Info View.
export interface HoverGlyph extends Pick<CarveGlyph, 'keys' | 'ch'> {
  off: boolean;
}

export interface CarveGlyph {
  gid: string;
  keys: string[];
  ch: string;
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
// ruleToGlyph — single IRRule → CarveGlyph (null if not displayable)
// ---------------------------------------------------------------------------

// gid == rule.nodeId so deletedItemIds can be forwarded directly to applyCarveToVfs
function ruleToGlyph(rule: IRRule): CarveGlyph | null {
  const keys = contextToKeys(rule.context);
  if (keys.length === 0) return null;
  const ch = outputToChar(rule.output);
  if (ch === '?' || ch === '‹dk›') return null;
  return { gid: rule.nodeId, keys, ch };
}

// ---------------------------------------------------------------------------
// groupToGlyphs — all displayable rules in a group
// ---------------------------------------------------------------------------

export function groupToGlyphs(group: IRGroup): CarveGlyph[] {
  const glyphs: CarveGlyph[] = [];
  group.rules.forEach((rule) => {
    if (rule.ownedByPattern !== undefined) return;
    const g = ruleToGlyph(rule);
    if (g) glyphs.push(g);
  });
  return glyphs;
}

// ---------------------------------------------------------------------------
// patternToGlyphs — derive character map from a Pattern's owned IR rules
// ---------------------------------------------------------------------------

export function patternToGlyphs(pattern: Pattern, ir: KeyboardIR): CarveGlyph[] {
  if (!pattern.ownedNodes || pattern.ownedNodes.length === 0) return [];

  const ownedIds = new Set(pattern.ownedNodes.map((n) => n.nodeId));
  const glyphs: CarveGlyph[] = [];

  for (const group of ir.groups) {
    group.rules.forEach((rule) => {
      if (!ownedIds.has(rule.nodeId)) return;
      const g = ruleToGlyph(rule);
      if (g) glyphs.push(g);
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

export interface StoreUsage {
  ruleCount: number;      // total rules in any group that reference this store
  asSource: boolean;      // used in any()/notany() context elements
  asOutput: boolean;      // used in index()/outs() output/context elements
  groupNames: string[];   // names of groups containing referencing rules
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

  return { ruleCount, asSource, asOutput, groupNames: [...groupNameSet] };
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
// nodeState — tri-state based on individual glyph or node deletion
// ---------------------------------------------------------------------------

export function nodeState(
  node: CarveNode,
  isItemDeleted: (id: string) => boolean,
  isDeleted: (id: string) => boolean,
): 'on' | 'partial' | 'off' {
  if (node.glyphs && node.glyphs.length > 0) {
    const off = node.glyphs.filter((g) => isItemDeleted(g.gid)).length;
    if (off === 0) return 'on';
    if (off === node.glyphs.length) return 'off';
    return 'partial';
  }
  return isDeleted(node.nodeId) ? 'off' : 'on';
}

// ---------------------------------------------------------------------------
// toRailNodes — build the full node list for the Rail from a KeyboardIR
// ---------------------------------------------------------------------------

export function toRailNodes(ir: KeyboardIR): CarveNode[] {
  const nodes: CarveNode[] = [];
  const recognized = ir.recognizedPatterns.filter((p) => p.origin === 'recognized');

  for (const pattern of recognized) {
    const glyphs = patternToGlyphs(pattern, ir);
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
    const glyphs = groupToGlyphs(group);
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

