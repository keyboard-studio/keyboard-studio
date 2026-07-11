// Minimal .kmn editor — textarea seeded from the session VFS.
// Edits are written back to the VFS and trigger recompile via the 300 ms
// debounce cycle (spec Decision D3).

import { useState, useEffect, useRef } from "react";
import type { VirtualFS } from "@keyboard-studio/contracts";
import { useDebounce, DEBOUNCE_MS } from "../hooks/useDebounce.ts";
import { findKmnPath } from "../lib/findKmnPath.ts";
import { BG_CARD, CARD_BORDER, FONT_MONO, TEXT_MAIN } from "../ui/theme.ts";

export interface KmnEditorProps {
  /** The live session VFS from the ready stage. */
  vfs: VirtualFS;
  /** Call after writing the edited text back to the VFS to trigger recompile. */
  onRecompile: () => void;
}

export function KmnEditor({ vfs, onRecompile }: KmnEditorProps) {
  // Find the primary .kmn file once per render — exclude the tests/ directory.
  const kmnPath = findKmnPath(vfs);
  const initialContent = kmnPath !== undefined
    ? (vfs.get(kmnPath)?.content as string | undefined) ?? ""
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
      ? (vfs.get(path)?.content as string | undefined) ?? ""
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
          color: "#9aa7b8",
          fontFamily: FONT_MONO,
        }}
      >
        No .kmn file found in the session VFS.
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
          color: "#9aa7b8",
          fontWeight: 700,
        }}
      >
        Editor — {kmnPath}
      </div>
      <textarea
        aria-label={`Edit ${kmnPath}`}
        value={text}
        onChange={(e) => { dirtyRef.current = true; setText(e.currentTarget.value); }}
        spellCheck={false}
        rows={12}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: "#0d1117",
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
      <div
        style={{
          fontSize: 11,
          color: "#484f58",
          fontFamily: FONT_MONO,
        }}
        aria-live="polite"
      >
        Changes compile after {DEBOUNCE_MS} ms pause.
      </div>
    </div>
  );
}
