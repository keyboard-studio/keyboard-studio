// Metadata-only picker — dropdown over BaseBrowserService.listAll().
// No filter; CJK/Ethiopic guard lives in OSKFrame, not here.

import { useEffect, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { mockBaseBrowser } from "@keyboard-studio/contracts/mocks";
// mockPatternLibrary (also from @keyboard-studio/contracts/mocks) serves the
// gallery and survey routes once those land.
import { localBaseBrowser } from "../lib/localBaseBrowser.ts";

export interface BaseKeyboardPickerProps {
  value: BaseKeyboard | null;
  onChange: (kb: BaseKeyboard | null) => void;
}

export function BaseKeyboardPicker({ value, onChange }: BaseKeyboardPickerProps) {
  const [keyboards, setKeyboards] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Try the Vite dev-plugin backed browser first; fall back to mock fixtures
    // when the local API endpoint is unavailable (air-gapped runs, tests, CI).
    localBaseBrowser.listAll().then(
      (list) => {
        if (cancelled) return;
        setKeyboards(list);
        setLoading(false);
      },
      (err: unknown) => {
        console.warn('[BaseKeyboardPicker] localBaseBrowser unavailable, falling back to mock:', err);
        if (cancelled) return;
        mockBaseBrowser.listAll().then(
          (list) => {
            if (cancelled) return;
            setKeyboards(list);
            setLoading(false);
          },
          (err: unknown) => {
            if (cancelled) return;
            const message = err instanceof Error ? err.message : String(err);
            console.error("[BaseKeyboardPicker] listAll() failed:", err);
            setError(message);
            setLoading(false);
          },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedId = value?.id ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor="kbd-picker"
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9aa7b8",
          fontWeight: 600,
        }}
      >
        Base keyboard
      </label>
      <select
        id="kbd-picker"
        value={selectedId}
        disabled={loading || error !== null}
        onChange={(e) => {
          const id = e.currentTarget.value;
          const kb = keyboards.find((k) => k.id === id) ?? null;
          onChange(kb);
        }}
        style={{
          background: "#161b22",
          color: "#e6edf3",
          border: `1px solid ${error ? "#7a2a2a" : "#283040"}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        <option value="" disabled>
          {loading
            ? "loading..."
            : error
              ? "failed to load keyboards"
              : "-- choose a base keyboard --"}
        </option>
        {keyboards.map((k) => (
          <option key={k.id} value={k.id}>
            {k.displayName} ({k.id} · {k.script})
          </option>
        ))}
      </select>
      {error !== null && (
        <div
          role="alert"
          style={{
            fontSize: 12,
            color: "#f0a0a0",
            lineHeight: 1.4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
