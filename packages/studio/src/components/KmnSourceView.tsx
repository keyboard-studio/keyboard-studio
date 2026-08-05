// KmnSourceView — read-only `.kmn` source, for the Compare tab (spec 057 US2).
//
// The Compare tab's counterpart to `KmnEditor`. FR-024 puts reading a foreign
// keyboard's source in scope; FR-023 puts editing anything on this tab out of
// it. A `<textarea readOnly>` would still look and feel like an editor, so
// this renders a `<pre>` — the affordance itself says "read", and there is no
// write-back path to forget to disable.
//
// Deliberately NOT a variant of KmnEditor behind a flag: that hook writes back
// to the VFS and drives the 300 ms recompile cycle, and the guarantee this tab
// needs is that no such path exists here at all.

import { Trans, useLingui } from "@lingui/react/macro";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { BG_CARD, CARD_BORDER, FONT_MONO, TEXT_DIM, TEXT_MAIN } from "../ui/theme.ts";

export interface KmnSourceViewProps {
  /** The compiled keyboard's VFS, from the ready stage. */
  vfs: VirtualFS;
}

export function KmnSourceView({ vfs }: KmnSourceViewProps) {
  const { t } = useLingui();
  const path = findKmnPath(vfs);
  const source = path !== undefined ? (readVfsText(vfs, path) ?? "") : "";

  if (source === "") {
    return (
      <p style={{ margin: 0, fontSize: 13, color: TEXT_DIM }}>
        <Trans id="compare.source.unavailable">
          This keyboard&rsquo;s source could not be read.
        </Trans>
      </p>
    );
  }

  return (
    <section
      aria-label={t({ id: "compare.source.label", message: "Keyboard source" })}
      style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 0 }}
    >
      <h3 style={{ margin: 0, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", color: TEXT_DIM }}>
        {path}
      </h3>
      {/* role="region" + tabIndex=0: the source is a SCROLLABLE region, and a
          scroll container that only a mouse can reach fails WCAG 2.1.1 (axe's
          `scrollable-region-focusable`). Giving it a landmark role is what
          makes the tabIndex legitimate rather than a stray tab stop on a
          presentational element — it is a named region a keyboard user
          deliberately enters to scroll. */}
      {/*
        WCAG 2.1.1: a SCROLL CONTAINER only a pointer can reach is unusable by
        keyboard — exactly what axe's `scrollable-region-focusable` rule flags.
        `jsx-a11y/no-noninteractive-tabindex` is a heuristic about interactive
        WIDGETS and has no notion of scroll containers, so it and the WCAG
        requirement genuinely disagree here. `role="region"` plus an accessible
        name makes this a named landmark a keyboard user deliberately enters,
        not a stray tab stop.
      */}
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
      <pre
        role="region"
        aria-label={t({ id: "compare.source.regionLabel", message: "Keyboard source, scrollable" })}
        tabIndex={0}
        data-testid="compare-source"
        style={{
          margin: 0,
          padding: 12,
          maxHeight: 320,
          overflow: "auto",
          background: BG_CARD,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 6,
          color: TEXT_MAIN,
          fontFamily: FONT_MONO,
          fontSize: 12,
          lineHeight: 1.5,
          whiteSpace: "pre",
        }}
      >
        {source}
      </pre>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
    </section>
  );
}
