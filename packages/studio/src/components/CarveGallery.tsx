import { useState, useMemo, useCallback } from 'react';
import { useWorkingCopyStore } from '../stores/workingCopyStore.ts';
import { toRailNodes, nodeState } from '../lib/irToCarveNodes.ts';
import type { CarveNode } from '../lib/irToCarveNodes.ts';
import { StatusBar } from './carve/StatusBar.tsx';
import type { RemovedItem } from './carve/StatusBar.tsx';
import { DepBanner } from './carve/DepBanner.tsx';
import { Rail } from './carve/Rail.tsx';
import { Inspector } from './carve/Inspector.tsx';

interface CarveGalleryProps {
  onComplete: () => void;
  onBack?: (() => void) | undefined;
}

export function CarveGallery({ onComplete, onBack }: CarveGalleryProps) {
  const ir = useWorkingCopyStore((s) => s.ir);
  const deletedNodeIds = useWorkingCopyStore((s) => s.deletedNodeIds);
  const deletedItemIds = useWorkingCopyStore((s) => s.deletedItemIds);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted);
  const isItemDeleted = useWorkingCopyStore((s) => s.isItemDeleted);
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);
  const deleteItem = useWorkingCopyStore((s) => s.deleteItem);
  const restoreItem = useWorkingCopyStore((s) => s.restoreItem);
  const restoreAll = useWorkingCopyStore((s) => s.restoreAll);
  const keepAll = useWorkingCopyStore((s) => s.keepAll);

  const nodes = useMemo(() => (ir ? toRailNodes(ir) : []), [ir]);

  // Gate: show the "all clear" screen when the keyboard has no patterns, stores, or raw —
  // only a single plain group (the common "main" group case). User can force-open the full carver.
  const isSimple = useMemo(
    () => nodes.filter((n) => n.kind === 'pattern' || n.kind === 'store' || n.kind === 'raw').length === 0
      && nodes.filter((n) => n.kind === 'group').length <= 1,
    [nodes],
  );
  const [forceOpen, setForceOpen] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(() => null);
  const selectedNode = useMemo<CarveNode | undefined>(
    () => nodes.find((n) => n.nodeId === selectedId) ?? nodes[0],
    [nodes, selectedId],
  );

  // Handlers for Rail/Inspector callbacks
  const handleSetManyGlyphs = useCallback((gids: string[], off: boolean) => {
    gids.forEach((gid) => { off ? deleteItem(gid) : restoreItem(gid); });
  }, [deleteItem, restoreItem]);

  const handleToggleNode = useCallback((nodeId: string, off: boolean) => {
    off ? deleteNode(nodeId) : restoreNode(nodeId);
  }, [deleteNode, restoreNode]);

  const handleToggleGlyph = useCallback((gid: string) => {
    isItemDeleted(gid) ? restoreItem(gid) : deleteItem(gid);
  }, [isItemDeleted, restoreItem, deleteItem]);

  // Kept / total counts
  const { kept, total } = useMemo(() => {
    let t = 0, k = 0;
    nodes.forEach((node) => {
      if (node.glyphs) {
        t += node.glyphs.length;
        k += node.glyphs.filter((g) => !isItemDeleted(g.gid)).length;
      }
    });
    return { kept: k, total: t };
  }, [nodes, deletedItemIds, isItemDeleted]);

  // Removed list for StatusBar
  const removedList = useMemo<RemovedItem[]>(() => {
    const list: RemovedItem[] = [];
    const fullOffIds = new Set<string>();

    nodes.forEach((node) => {
      if (node.kind !== 'pattern' && node.kind !== 'group') return;
      if (nodeState(node, isItemDeleted, isDeleted) === 'off') {
        fullOffIds.add(node.nodeId);
        list.push({ type: 'node', id: node.nodeId, kind: node.kind, label: node.name, count: node.glyphs?.length ?? 0, glyphIds: node.glyphs?.map((g) => g.gid) });
      }
    });
    nodes.forEach((node) => {
      if (node.kind !== 'store' && node.kind !== 'raw') return;
      if (isDeleted(node.nodeId)) {
        list.push({ type: 'node', id: node.nodeId, kind: node.kind, label: node.name, count: 1 });
      }
    });
    deletedItemIds.forEach((gid) => {
      const nodeId = gid.split('#', 1)[0] ?? gid;
      if (fullOffIds.has(nodeId)) return;
      const node = nodes.find((n) => n.nodeId === nodeId);
      const glyph = node?.glyphs?.find((g) => g.gid === gid);
      if (!glyph) return;
      list.push({ type: 'item', id: gid, ch: glyph.ch, keys: glyph.keys, nodeName: node?.name });
    });
    return list;
  }, [nodes, deletedItemIds, deletedNodeIds, isItemDeleted, isDeleted]);

  const handleRestore = useCallback((item: RemovedItem) => {
    if (item.type === 'item') { restoreItem(item.id); return; }
    if (item.glyphIds) { item.glyphIds.forEach((gid) => restoreItem(gid)); }
    else { restoreNode(item.id); }
  }, [restoreItem, restoreNode]);

  // DepBanner — orphaned patterns + newly-unused stores
  const { orphanedNames, unusedStoreNames } = useMemo(() => {
    const orphaned: string[] = [];
    const unusedStores: string[] = [];
    nodes.forEach((node) => {
      if ((node.kind === 'pattern' || node.kind === 'group') && nodeState(node, isItemDeleted, isDeleted) === 'off') {
        orphaned.push(node.name);
      }
      if (node.kind === 'store' && node.referencedByNodeId !== undefined && !isDeleted(node.nodeId)) {
        const refNode = nodes.find((n) => n.nodeId === node.referencedByNodeId);
        if (refNode && nodeState(refNode, isItemDeleted, isDeleted) === 'off') {
          unusedStores.push(node.name);
        }
      }
    });
    return { orphanedNames: orphaned, unusedStoreNames: unusedStores };
  }, [nodes, deletedItemIds, deletedNodeIds, isItemDeleted, isDeleted]);

  if (!ir) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
        <p style={{ fontSize: 14, color: 'var(--app-text-muted)' }}>Loading keyboard…</p>
      </div>
    );
  }

  // Gate screen — shown for simple keyboards with nothing complex to carve
  if (isSimple && !forceOpen) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--app-bg)', color: 'var(--app-text)', gap: 24, padding: '0 32px', textAlign: 'center' }}>
        <svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={12} r={10} />
          <path d="M9 12l2 2 4-4" />
        </svg>
        <div>
          <h2 style={{ margin: '0 0 8px', font: "500 22px/1.15 'Playfair Display', serif", color: 'var(--app-text)' }}>
            Your rules look good
          </h2>
          <p style={{ margin: 0, fontSize: 14.5, color: 'var(--app-text-muted)', maxWidth: 400, lineHeight: 1.6 }}>
            This keyboard uses standard rules in a single group — there's nothing complex to review or remove.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={() => setForceOpen(true)}
            style={{ font: '600 13.5px var(--app-font)', cursor: 'pointer', color: 'var(--app-accent-text)', background: 'var(--app-surface-2)', border: '1px solid var(--app-border-strong)', borderRadius: 9, padding: '10px 20px' }}
          >
            Open rule carver anyway
          </button>
          <button
            onClick={() => { keepAll(); onComplete(); }}
            style={{ font: '600 13.5px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 9, padding: '10px 22px' }}
          >
            Skip Rule Carver →
          </button>
        </div>
        {onBack !== undefined && (
          <button onClick={onBack} style={{ font: '13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-subtle)', background: 'transparent', border: 'none', marginTop: 4 }}>
            ← Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', color: 'var(--app-text)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 22px', borderBottom: '1px solid var(--app-border)', flexShrink: 0 }}>
        {onBack !== undefined && (
          <button onClick={onBack} style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: 'none', padding: '4px 0', whiteSpace: 'nowrap' }}>
            ← Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ font: '600 10.5px/1 var(--app-font)', letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--app-text-subtle)' }}>
            Phase D · Carve
          </div>
          <h1 style={{ margin: '6px 0 0', font: "500 23px/1.1 'Playfair Display', serif", color: 'var(--app-text)' }}>
            Review your keyboard's rules
          </h1>
        </div>
        <button
          onClick={() => { keepAll(); onComplete(); }}
          title="Skip removal — keep all rules"
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: 'var(--app-text-muted)', background: 'transparent', border: '1px solid var(--app-border-strong)', borderRadius: 8, padding: '7px 13px', whiteSpace: 'nowrap', marginRight: 6 }}
        >
          Skip
        </button>
        <button
          onClick={onComplete}
          style={{ font: '600 13px var(--app-font)', cursor: 'pointer', color: '#fff', background: 'var(--app-accent)', border: 'none', borderRadius: 8, padding: '9px 18px' }}
        >
          Continue →
        </button>
      </div>

      {/* Status bar */}
      <StatusBar
        kept={kept}
        total={total}
        removedList={removedList}
        onRestore={handleRestore}
        onRestoreAll={restoreAll}
      />

      {/* Dependency banner */}
      <DepBanner orphanedNames={orphanedNames} unusedStoreNames={unusedStoreNames} />

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Rail
          nodes={nodes}
          selectedId={selectedNode?.nodeId ?? null}
          onSelect={setSelectedId}
          isItemDeleted={isItemDeleted}
          isDeleted={isDeleted}
          onSetManyGlyphs={handleSetManyGlyphs}
          onToggleNode={handleToggleNode}
        />
        <Inspector
          node={selectedNode}
          nodes={nodes}
          isItemDeleted={isItemDeleted}
          onToggleGlyph={handleToggleGlyph}
          onSetManyGlyphs={handleSetManyGlyphs}
          isDeleted={isDeleted}
          onToggleNode={handleToggleNode}
        />
      </div>
    </div>
  );
}
