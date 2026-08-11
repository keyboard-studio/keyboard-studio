import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from "@lingui/react/macro";
import type { CardKind } from '../../../lib/irToCarveNodes.ts';
import { resolveMessage } from './carveShared.tsx';
export type { CardKind } from '../../../lib/irToCarveNodes.ts';

// Categorical (not status/severity) taxonomy palette — one decorative hue per
// CardKind, deliberately distinct from the --app-danger/warning/success/
// accent semantic tokens (a "kind" is not a severity). No dedicated
// categorical CSS tokens exist yet (epic #533 scoped the --app-* set to
// status/surface roles), so this maps each kind onto the closest existing
// SIL brand token (brand.css) rather than inventing a fifth palette —
// visual hue drifts slightly from the pre-token literals, which is the
// expected/disclosed trade-off of standardizing on the brand ramp.
export const KIND_COLOR: Record<CardKind, string> = {
  pattern: 'var(--sil-light-blue-60)',
  group:   'var(--sil-orange)',
  store:   'var(--sil-violet)',
  raw:     'var(--sil-red-dark)',
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
