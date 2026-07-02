import { useMemo } from 'react';
import type { CarveNode } from '../../../lib/irToCarveNodes.ts';
import { nodeState, MOD_GROUP_DEFS } from '../../../lib/irToCarveNodes.ts';
import { KIND_COLOR } from './KindBadge.tsx';
import { ToggleBox } from './ToggleBox.tsx';
import { WarnIcon } from './carveShared.tsx';
import type { MouseEvent } from 'react';
import { useHoverInfoStore } from '../../../stores/hoverInfoStore.ts';

interface RailSection {
  label: string;
  kind: CarveNode['kind'];
}

const SECTIONS: RailSection[] = [
  { label: 'Patterns', kind: 'pattern' },
  { label: 'Groups',   kind: 'group' },
  { label: 'Stores',   kind: 'store' },
  { label: 'Advanced', kind: 'raw' },
];

type StoreSubGroup = 'input' | 'output' | 'both' | 'pattern' | 'unused';

function storeSubGroup(node: CarveNode): StoreSubGroup {
  if (node.referencedByNodeId !== undefined) return 'pattern';
  const u = node.storeUsage;
  if (!u) return 'unused';
  if (u.asSource && u.asOutput) return 'both';
  if (u.asSource) return 'input';
  if (u.asOutput) return 'output';
  return 'unused';
}

const STORE_SUBS: { key: StoreSubGroup; label: string; chip: string; color: string }[] = [
  { key: 'input',   label: 'Input',          chip: 'in',     color: 'var(--app-accent-text)' },
  { key: 'output',  label: 'Output',         chip: 'out',    color: '#7dbf8e' },
  { key: 'both',    label: 'Input + Output', chip: 'in+out', color: '#c8b0e8' },
  { key: 'pattern', label: 'Pattern',        chip: '',       color: KIND_COLOR.pattern },
  { key: 'unused',  label: 'Unused',         chip: '',       color: 'var(--app-text-subtle)' },
];

interface RailProps {
  nodes: CarveNode[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  isItemDeleted: (id: string) => boolean;
  isDeleted: (nodeId: string) => boolean;
  onSetManyGlyphs: (gids: string[], off: boolean) => void;
  onToggleNode: (nodeId: string, off: boolean) => void;
}

export function Rail({ nodes, selectedId, onSelect, isItemDeleted, isDeleted, onSetManyGlyphs, onToggleNode }: RailProps) {
  const setInfo = useHoverInfoStore((s) => s.setInfo);
  const clearInfo = useHoverInfoStore((s) => s.clearInfo);

  // Pre-compute per-node modifier breakdown once per render cycle (O(nodes × glyphs)).
  // Keyed on nodes identity; isItemDeleted is a stable function ref from the store.
  const nodeBreakdownMap = useMemo(() => {
    const map = new Map<string, { label: string; kept: number }[]>();
    for (const node of nodes) {
      if (!node.glyphs || node.glyphs.length === 0) continue;
      const breakdown: { label: string; kept: number }[] = [];
      for (const grp of MOD_GROUP_DEFS) {
        const kept = node.glyphs
          .filter((g) => grp.layers.includes(g.modifierLayer) && !isItemDeleted(g.gid))
          .length;
        if (kept > 0) breakdown.push({ label: grp.id, kept });
      }
      map.set(node.nodeId, breakdown);
    }
    return map;
  }, [nodes, isItemDeleted]);

  return (
    <div style={{ width: 308, flex: '0 0 auto', borderRight: '1px solid var(--app-border)', background: 'var(--app-surface)', overflowY: 'auto' }}>
      {SECTIONS.map((sec) => {
        const items = nodes.filter((n) => n.kind === sec.kind);
        if (items.length === 0) return null;
        const tone = KIND_COLOR[sec.kind];

        const renderNode = (node: CarveNode, chipLabel?: string, chipColor?: string) => {
          const st = nodeState(node, isItemDeleted, isDeleted);
          const active = node.nodeId === selectedId;
          const total = node.glyphs?.length ?? null;
          const keptN = total !== null ? (node.glyphs?.filter((g) => !isItemDeleted(g.gid)).length ?? 0) : null;

          const modBreakdown = nodeBreakdownMap.get(node.nodeId) ?? [];
          const showBreakdown = modBreakdown.length > 1;

          const handleToggle = (e: MouseEvent) => {
            e.stopPropagation();
            if (node.glyphs && node.glyphs.length > 0) {
              onSetManyGlyphs(node.glyphs.map((g) => g.gid), st !== 'off');
            } else {
              onToggleNode(node.nodeId, st !== 'off');
            }
          };

          return (
            <div
              key={node.nodeId}
              data-testid={`carve-card-${node.nodeId}`}
              data-kind={node.kind}
              onClick={() => onSelect(node.nodeId)}
              onMouseEnter={() => setInfo({ kind: 'node', node })}
              onFocus={() => setInfo({ kind: 'node', node })}
              onMouseLeave={clearInfo}
              onBlur={clearInfo}
              tabIndex={0}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer',
                background: active ? 'var(--app-accent-subtle)' : 'transparent',
                boxShadow: active ? 'inset 3px 0 0 var(--app-accent)' : 'none',
              }}
            >
              <ToggleBox glyph={node.trigger} state={st} size={26} onClick={handleToggle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: active ? 600 : 500,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  color: st === 'off' ? 'var(--app-text-subtle)' : 'var(--app-text)',
                  textDecoration: st === 'off' ? 'line-through' : 'none',
                }}>
                  {node.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 2 }}>
                  {total !== null && !showBreakdown && (
                    <span style={{ fontSize: 11, color: 'var(--app-text-subtle)' }}>{keptN}/{total}</span>
                  )}
                  {showBreakdown && (
                    <span style={{ fontSize: 11, color: 'var(--app-text-subtle)' }}>
                      {modBreakdown.map((g, i) => (
                        <span key={g.label}>
                          {i > 0 && <span style={{ margin: '0 2px' }}>·</span>}
                          {g.kept} {g.label}
                        </span>
                      ))}
                    </span>
                  )}
                  {node.strategy !== undefined && (
                    <span style={{ font: '600 10px/1 var(--app-font-mono)', color: 'var(--app-text-subtle)' }}>{node.strategy}</span>
                  )}
                  {chipLabel !== undefined && chipLabel !== '' && (
                    <span style={{ font: '600 9px/1 var(--app-font-mono)', color: chipColor, border: '1px solid currentColor', borderRadius: 3, padding: '1px 4px', opacity: 0.85 }}>{chipLabel}</span>
                  )}
                  {node.loadBearing === true && (
                    <span aria-label="load-bearing" style={{ color: 'var(--sil-orange)', display: 'inline-flex' }}>
                      <WarnIcon size={11} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        };

        if (sec.kind === 'store') {
          // Group stores into sub-sections by role
          const grouped = new Map<StoreSubGroup, CarveNode[]>(
            STORE_SUBS.map((s) => [s.key, []])
          );
          items.forEach((node) => grouped.get(storeSubGroup(node))!.push(node));

          return (
            <div key={sec.label}>
              <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 7, font: '600 10.5px/1 var(--app-font)', letterSpacing: '.13em', textTransform: 'uppercase', color: tone, padding: '13px 16px 7px', background: 'var(--app-surface)' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2.5, background: tone, flex: '0 0 auto' }} />
                {sec.label} <span style={{ color: 'var(--app-text-subtle)' }}>· {items.length}</span>
              </div>
              {STORE_SUBS.map((sub) => {
                const subItems = grouped.get(sub.key)!;
                if (subItems.length === 0) return null;
                return (
                  <div key={sub.key}>
                    <div style={{ padding: '7px 16px 3px', font: '600 9.5px/1 var(--app-font)', letterSpacing: '.1em', textTransform: 'uppercase', color: sub.color, opacity: 0.8 }}>
                      {sub.label}
                    </div>
                    {subItems.map((node) => renderNode(node, sub.chip, sub.color))}
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <div key={sec.label}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 7, font: '600 10.5px/1 var(--app-font)', letterSpacing: '.13em', textTransform: 'uppercase', color: tone, padding: '13px 16px 7px', background: 'var(--app-surface)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2.5, background: tone, flex: '0 0 auto' }} />
              {sec.label} <span style={{ color: 'var(--app-text-subtle)' }}>· {items.length}</span>
            </div>
            {items.map((node) => renderNode(node))}
          </div>
        );
      })}
    </div>
  );
}
