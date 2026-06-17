// Shared UI atoms used across multiple carve card components.

export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export const discloseBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  marginTop: 10, padding: 0,
  background: 'none', border: 'none',
  color: 'var(--accent)', font: '600 13.5px var(--ui)', cursor: 'pointer',
};

export function WarnIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}
