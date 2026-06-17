import { KeyCap } from './KeyCap.tsx';

interface KeySeqProps { keys: string[] }

export function KeySeq({ keys }: KeySeqProps) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
      {keys.map((k, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {i > 0 && <span style={{ fontSize: 10, color: 'var(--muted)' }}>+</span>}
          <KeyCap>{k}</KeyCap>
        </span>
      ))}
    </span>
  );
}
