import type { CarveNode } from '../../lib/irToCarveNodes.ts';
import { nodeState } from '../../lib/irToCarveNodes.ts';
import { KIND_COLOR } from './KindBadge.tsx';
import { ToggleBox } from './ToggleBox.tsx';
import { WarnIcon } from './carveShared.tsx';
import type { MouseEvent } from 'react';

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
  return (
    <div style={{ width: 308, flex: '0 0 auto', borderRight: '1px solid var(--app-border)', background: 'var(--app-surface)', overflowY: 'auto' }}>
      {SECTIONS.map((sec) => {
        const items = nodes.filter((n) => n.kind === sec.kind);
        if (items.length === 0) return null;
        const tone = KIND_COLOR[sec.kind];
        return (
          <div key={sec.label}>
            <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', gap: 7, font: '600 10.5px/1 var(--app-font)', letterSpacing: '.13em', textTransform: 'uppercase', color: tone, padding: '13px 16px 7px', background: 'var(--app-surface)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2.5, background: tone, flex: '0 0 auto' }} />
              {sec.label} <span style={{ color: 'var(--app-text-subtle)' }}>· {items.length}</span>
            </div>
            {items.map((node) => {
              const st = nodeState(node, isItemDeleted, isDeleted);
              const active = node.nodeId === selectedId;
              const total = node.glyphs?.length ?? null;
              const keptN = total !== null ? (node.glyphs?.filter((g) => !isItemDeleted(g.gid)).length ?? 0) : null;

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
                  onClick={() => onSelect(node.nodeId)}
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
                      {total !== null && (
                        <span style={{ fontSize: 11, color: 'var(--app-text-subtle)' }}>{keptN}/{total}</span>
                      )}
                      {node.strategy !== undefined && (
                        <span style={{ font: '600 10px/1 var(--app-font-mono)', color: 'var(--app-text-subtle)' }}>{node.strategy}</span>
                      )}
                      {node.loadBearing === true && (
                        <span title="load-bearing" style={{ color: 'var(--sil-orange)', display: 'inline-flex' }}>
                          <WarnIcon size={11} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
