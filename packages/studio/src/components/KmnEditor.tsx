// Minimal .kmn editor — textarea seeded from the session VFS.
// Edits are written back to the VFS and trigger recompile via the 300 ms
// debounce cycle (spec Decision D3).

import { useState, useEffect, useRef } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { useDebounce, DEBOUNCE_MS } from "../hooks/useDebounce.ts";
import { findKmnPath } from "../lib/findKmnPath.ts";
import { readVfsText } from "../lib/vfsText.ts";
import { BG_CARD, CARD_BORDER, FONT_MONO, TEXT_MAIN } from "../ui/theme.ts";

export interface KmnEditorProps {
  /** The live session VFS from the ready stage. */
  vfs: VirtualFS;
  /** Call after writing the edited text back to the VFS to trigger recompile. */
  onRecompile: () => void;
}

export function KmnEditor({ vfs, onRecompile }: KmnEditorProps) {
  const { t } = useLingui();
  // Find the primary .kmn file once per render — exclude the tests/ directory.
  const kmnPath = findKmnPath(vfs);
  const initialContent = kmnPath !== undefined
    ? readVfsText(vfs, kmnPath) ?? ""
    : "";

  const [text, setText] = useState(initialContent);
  // Track whether the user has made a real edit in this session. Prevents a
  // spurious recompile on initial mount when debouncedText === VFS content.
  const dirtyRef = useRef(false);

  // Re-seed the editor when the VFS is replaced (new base selection / scaffold).
  // We compare by object identity — each new session's VFS is a new object.
  useEffect(() => {
    const path = findKmnPath(vfs);
    const content = path !== undefined
      ? readVfsText(vfs, path) ?? ""
      : "";
    setText(content);
    // Reset dirty flag so the fresh VFS seed doesn't trigger a recompile.
    dirtyRef.current = false;
  }, [vfs]);

  // Single 300 ms debounce — spec Decision D3. No second timer elsewhere.
  const debouncedText = useDebounce(text, DEBOUNCE_MS);

  // Write the debounced text back to the VFS and signal recompile — only when
  // the user has actually edited (dirtyRef guards the initial-mount no-op).
  useEffect(() => {
    if (kmnPath === undefined || !dirtyRef.current) return;
    vfs.set(kmnPath, debouncedText);
    onRecompile();
  }, [debouncedText, vfs, onRecompile, kmnPath]);

  if (kmnPath === undefined) {
    return (
      <div
        style={{
          padding: "10px 14px",
          background: BG_CARD,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 8,
          fontSize: 12,
          color: "var(--app-text-subtle)",
          fontFamily: FONT_MONO,
        }}
      >
        <Trans id="kmnEditor.noFile">No .kmn file found in the session VFS.</Trans>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--app-text-subtle)",
          fontWeight: 700,
        }}
      >
        <Trans id="kmnEditor.heading">Editor — {kmnPath}</Trans>
      </div>
      <textarea
        aria-label={t({ id: "kmnEditor.textarea.ariaLabel", message: `Edit ${kmnPath}` })}
        value={text}
        onChange={(e) => { dirtyRef.current = true; setText(e.currentTarget.value); }}
        spellCheck={false}
        rows={12}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "var(--app-bg)",
          color: TEXT_MAIN,
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 12,
          fontFamily: FONT_MONO,
          lineHeight: 1.6,
          resize: "vertical",
          outline: "none",
        }}
      />
      {/* --app-text-subtle, NOT --app-text-disabled. This is a live hint, not
          a disabled control, so it gets no WCAG 1.4.3 exemption. The disabled
          token (35% alpha) measured 2.92:1 here on navy's --app-bg, well under
          the 4.5:1 that 11px text needs. --app-text-subtle is the token for
          quiet caption/hint text: 4.56:1 on light --app-bg and 5.01:1 on
          navy's (see colors.css). axe reported this only some of the time
          because it skips text that is scrolled out of its overflow
          container's visible area. This hint sits at the foot of the
          Output screen's scrolling left pane, below the fold at scrollTop 0,
          and mounts only once the compile reaches "ready". So a scan
          flagged it only when it happened to be scrolled into view. */}
      <div
        style={{
          fontSize: 11,
          color: "var(--app-text-subtle)",
          fontFamily: FONT_MONO,
        }}
        aria-live="polite"
      >
        <Trans id="kmnEditor.debounceHint">
          Changes compile after {DEBOUNCE_MS} ms pause.
        </Trans>
      </div>
    </div>
  );
}
