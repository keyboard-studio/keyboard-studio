// Metadata-only picker — dropdown over BaseBrowserService.listAll().
// No filter; CJK/Ethiopic guard lives in OSKFrame, not here.
//
// [SCAFFOLD] Uses localBaseBrowser (Vite dev plugin backed) as the
// BaseBrowserService. Swap the import below to switch backends:
//   import { mockBaseBrowser } from "@keyboard-studio/contracts/mocks";
// or replace with the real engine service once it lands.

import { useEffect, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { localBaseBrowser } from "../lib/localBaseBrowser.ts";

const baseBrowser = localBaseBrowser;

export interface BaseKeyboardPickerProps {
  value: BaseKeyboard | null;
  onChange: (kb: BaseKeyboard | null) => void;
}

export function BaseKeyboardPicker({ value, onChange }: BaseKeyboardPickerProps) {
  const [keyboards, setKeyboards] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void baseBrowser.listAll().then((list) => {
      if (cancelled) return;
      setKeyboards(list);
      setLoading(false);
    });
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
        disabled={loading}
        onChange={(e) => {
          const id = e.currentTarget.value;
          const kb = keyboards.find((k) => k.id === id) ?? null;
          onChange(kb);
        }}
        style={{
          background: "#161b22",
          color: "#e6edf3",
          border: "1px solid #283040",
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        <option value="" disabled>
          {loading ? "loading..." : "-- choose a base keyboard --"}
        </option>
        {keyboards.map((k) => (
          <option key={k.id} value={k.id}>
            {k.displayName} ({k.id} · {k.script})
          </option>
        ))}
      </select>
    </div>
  );
}
