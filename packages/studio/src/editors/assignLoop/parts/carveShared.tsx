import type React from 'react';
import type { I18n, MessageDescriptor } from '@lingui/core';

/**
 * Resolve a Lingui MessageDescriptor (built via the `msg` macro) to a display
 * string, with a working fallback when no `I18n` instance is available.
 *
 * Several helpers under assignLoop/parts/ are plain (non-component) functions
 * that are called BOTH from real components (which have an `i18n` instance,
 * from `useLingui()`, bound to the active locale) AND directly from unit
 * tests (which call them with no `i18n` argument at all, asserting on the
 * English source text). `msg()` only DEFINES a descriptor — resolving it
 * still needs either a real `i18n.t()` call (component path) or, for the
 * argument-less test-call path, this same-shape interpolation performed
 * locally against the English `message` text baked into the descriptor by
 * the macro (so behavior matches what the plain string literal did before
 * i18n was introduced).
 */
export function resolveMessage(i18n: I18n | undefined, descriptor: MessageDescriptor): string {
  if (i18n !== undefined) return i18n.t(descriptor);
  let out = descriptor.message ?? '';
  const values = descriptor.values as Record<string, unknown> | undefined;
  if (values !== undefined) {
    for (const [k, v] of Object.entries(values)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}

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
