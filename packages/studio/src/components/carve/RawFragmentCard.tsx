import type { RawKmnFragment } from '@keyboard-studio/contracts';
import { useWorkingCopyStore } from '../../stores/workingCopyStore.ts';
import { KindBadge } from './KindBadge.tsx';
import { WarnIcon } from './carveShared.tsx';

interface RawFragmentCardProps {
  fragment: RawKmnFragment;
  flag?: string | undefined;
  loadBearing?: boolean | undefined;
}

export function RawFragmentCard({ fragment, flag, loadBearing }: RawFragmentCardProps) {
  const isDeleted = useWorkingCopyStore((s) => s.isDeleted(fragment.nodeId));
  const deleteNode = useWorkingCopyStore((s) => s.deleteNode);
  const restoreNode = useWorkingCopyStore((s) => s.restoreNode);

  return (
    <div style={{
      background: isDeleted ? 'var(--card)' : 'var(--amber-bg)',
      borderRadius: 12, marginBottom: 12,
      border: '1px solid var(--amber-border)',
      opacity: isDeleted ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 15px' }}>
        <span style={{
          flex: '0 0 auto', width: 34, height: 34, borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--amber)', background: 'rgba(210,153,34,.16)',
          border: '1px solid var(--amber-border)',
        }}>
          <WarnIcon size={18} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{
              font: '600 16px var(--ui)',
              color: isDeleted ? 'var(--muted)' : 'var(--text)',
              textDecoration: isDeleted ? 'line-through' : 'none',
            }}>
              Advanced rule — kept verbatim
            </span>
            <KindBadge kind="raw" />
            {!isDeleted && loadBearing && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, font: '600 11.5px var(--ui)', color: 'var(--amber)' }}>
                <WarnIcon size={12} /> load-bearing
              </span>
            )}
          </div>
          <div style={{ marginTop: 4, fontSize: 14, color: isDeleted ? 'var(--muted)' : 'var(--amber-text)' }}>
            {fragment.reason}
          </div>
          {flag && !isDeleted && (
            <div style={{ marginTop: 7, fontSize: 13.5, color: 'var(--muted)' }}>
              <b style={{ color: 'var(--amber-text)' }}>Suggested removal · </b>{flag}
            </div>
          )}
        </div>

        {!isDeleted ? (
          <button
            onClick={() => deleteNode(fragment.nodeId)}
            title="Remove this rule"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, flex: '0 0 auto',
              background: 'var(--danger-bg)',
              border: '1px solid color-mix(in srgb, var(--danger) 45%, transparent)',
              borderRadius: 7, color: 'var(--danger)', cursor: 'pointer',
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => restoreNode(fragment.nodeId)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px',
              background: 'var(--card-2)', border: '1px solid var(--border-strong)',
              borderRadius: 7, color: 'var(--accent)', font: '600 13px var(--ui)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
            </svg>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

