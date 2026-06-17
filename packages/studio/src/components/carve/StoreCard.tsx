import { useState } from 'react';
import type { IRStore, KeyboardIR } from '@keyboard-studio/contracts';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { CardShell } from './CardShell.tsx';
import { KindBadge } from './KindBadge.tsx';
import { storeChars } from '../../lib/irToCarveNodes.ts';

interface StoreCardProps {
  store: IRStore;
  ir: KeyboardIR;
  flag?: string | undefined;
}

const isCombining = (ch: string) => {
  const c = ch?.codePointAt(0) ?? 0;
  return c >= 0x0300 && c <= 0x036f;
};

export function StoreCard({ store, ir, flag }: StoreCardProps) {
  const [open, setOpen] = useState(false);
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted(store.nodeId));
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);

  const chars = storeChars(store);

  const referencingPatterns = ir.recognizedPatterns.filter(
    (p) => p.ownedNodes?.some((n) => n.nodeId === store.nodeId),
  );
  const referencedLabel = referencingPatterns.length > 0
    ? referencingPatterns.map((p) => p.title).join(', ')
    : 'unrecognized rules';

  const node = { nodeId: store.nodeId, flag, desc: 'A named character list other rules draw from.' };

  return (
    <CardShell
      node={node}
      deleted={isDeleted}
      onDelete={() => deleteNode(store.nodeId)}
      onUndo={() => restoreNode(store.nodeId)}
      title={<span style={{ fontFamily: 'var(--mono)', fontSize: 15 }}>{store.name}</span>}
      badge={<KindBadge kind="store" />}
    >
      {chars.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chars.map((ch, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 38, height: 40, padding: '0 8px',
              background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 7,
              font: '400 19px/1 var(--serif)',
            }}>
              {isCombining(ch) ? '◌' + ch : ch}
            </span>
          ))}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} style={discloseBtn}>
        <ChevronIcon open={open} />
        {open ? 'Hide usage' : 'Where is this used?'}
      </button>
      {open && (
        <div style={{
          marginTop: 4, padding: '9px 11px',
          background: 'var(--card-2)', border: '1px solid var(--border)', borderRadius: 8,
          fontSize: 13.5, color: 'var(--muted)',
        }}>
          Referenced by <b style={{ color: 'var(--text)' }}>{referencedLabel}</b> via{' '}
          <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>any()</code> /{' '}
          <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>index()</code>.
          Removing this store will break that pattern.
        </div>
      )}
    </CardShell>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

const discloseBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  marginTop: 10, padding: 0,
  background: 'none', border: 'none',
  color: 'var(--accent)', font: '600 13.5px var(--ui)', cursor: 'pointer',
};
