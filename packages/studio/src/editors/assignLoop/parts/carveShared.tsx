import type React from 'react';

export { resolveMessage } from '../../../lib/i18nResolve.ts';

interface IconProps { size?: number | undefined }

function Icon({ size = 14, strokeWidth = 2.2, style, children }: IconProps & { strokeWidth?: number; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}

export function ChevronIcon({ open, size = 14 }: { open: boolean; size?: number | undefined }) {
  return (
    <Icon size={size} strokeWidth={2.4} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

// A filled disclosure triangle — deliberately NOT built on the shared `Icon`
// wrapper above: `Icon` is hardwired to `fill="none" stroke="currentColor"`,
// which renders a hollow outline rather than a solid glyph. Rather than add
// a fill/stroke override prop to `Icon` (which every other consumer would
// need to keep ignoring), this renders its own small `<svg>` following the
// same viewBox/size/style conventions as `Icon` — same size handling, same
// rotate-on-toggle idiom as ChevronIcon (which rotates 180deg between two
// chevron orientations; this rotates 90deg between "pointing right" and
// "pointing down", matching a disclosure triangle rather than a chevron).
export function TriangleIcon({ open, size = 14 }: { open: boolean; size?: number | undefined }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}
    >
      <path d="M8 5l11 7-11 7z" />
    </svg>
  );
}

export function WarnIcon({ size = 13 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </Icon>
  );
}

export function CheckIcon({ size = 13 }: IconProps) {
  return (
    <Icon size={size} strokeWidth={2.6}>
      <path d="M20 6 9 17l-5-5" />
    </Icon>
  );
}

export function UndoIcon({ size = 13 }: IconProps) {
  return (
    <Icon size={size}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </Icon>
  );
}

export function InfoIcon({ size = 14 }: IconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </Icon>
  );
}
