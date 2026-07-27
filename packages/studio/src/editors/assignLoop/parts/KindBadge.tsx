import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from "@lingui/react/macro";
import type { CardKind } from '../../../lib/irToCarveNodes.ts';
import { resolveMessage } from './carveShared.tsx';
export type { CardKind } from '../../../lib/irToCarveNodes.ts';

export const KIND_COLOR: Record<CardKind, string> = {
  pattern: '#6fbbd4',
  group:   '#f18407',
  store:   '#8b5cc4',
  raw:     '#b90529',
};

// Chrome (human-readable category labels) — built per-render via the
// optional-i18n + msg()/resolveMessage() pattern (see Inspector.tsx's
// storeBlurb/ruleDetailLabel) rather than taking `t` as a bare function
// parameter — Lingui's macro tracks the specific binding introduced by
// useLingui(), so a re-bound `t` parameter is a distinct binding the
// extractor does not follow and its ids never make it into the catalog.
function buildKindLabel(kind: CardKind, i18n?: I18n): string {
  switch (kind) {
    case 'pattern': return resolveMessage(i18n, msg({ id: "editor.assignLoop.kindBadge.pattern", message: "Pattern" }));
    case 'group': return resolveMessage(i18n, msg({ id: "editor.assignLoop.kindBadge.group", message: "Group" }));
    case 'store': return resolveMessage(i18n, msg({ id: "editor.assignLoop.kindBadge.store", message: "Store" }));
    case 'raw': return resolveMessage(i18n, msg({ id: "editor.assignLoop.kindBadge.raw", message: "Advanced" }));
    default: return kind;
  }
}

interface KindBadgeProps { kind: CardKind }

export function KindBadge({ kind }: KindBadgeProps) {
  const { i18n } = useLingui();
  const color = KIND_COLOR[kind];
  const label = buildKindLabel(kind, i18n);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 999,
      font: '600 10px/1.4 var(--app-font)', letterSpacing: '.08em', textTransform: 'uppercase',
      color,
      background: `color-mix(in srgb, ${color} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 38%, transparent)`,
    }}>
      {label}
    </span>
  );
}
