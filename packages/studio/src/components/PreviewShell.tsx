// Two-pane preview shell — picker left, live OSK right.
//
// [SCAFFOLD] Left pane: currently a base-keyboard picker only. The full
// survey UI (spec §4 / §8 Phase B) lands in issues #48–#49 and replaces
// this pane. The right pane (compile + KMW iframe preview) is the working
// deliverable ported from studio-poc.

import { useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { BaseKeyboardPicker } from "./BaseKeyboardPicker.tsx";
import { OskModeToggle, type OskMode } from "./OskModeToggle.tsx";
import { OSKFrame } from "./OSKFrame.tsx";

// [TEMP] Per-fixture typing hints. Hardcoded until the Pattern schema's
// `tests` field (spec §5) is wired into the UI to drive these automatically.
const TRY_HINTS: Record<string, { intro: string; examples: string[] }> = {
  basic_kbdus: {
    intro: "US-English layout — types the same as your physical keyboard.",
    examples: ["a -> a", "Shift+a -> A", "1 -> 1"],
  },
  sil_euro_latin: {
    intro: "Diacritics via a leading punctuation deadkey.",
    examples: [
      "' then a -> a-acute",
      "` then e -> e-grave",
      "~ then n -> n-tilde",
      "^ then o -> o-circumflex",
      "\" then u -> u-umlaut",
    ],
  },
  sil_devanagari_phonetic: {
    intro: "Romanised phonetic input for Devanagari.",
    examples: ["a -> base vowel", "k -> ka consonant", "i -> i vowel"],
  },
};

function MetadataCard({ kb }: { kb: BaseKeyboard }) {
  const Row = ({ k, v }: { k: string; v: string }) => (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <span style={{ color: "#9aa7b8", minWidth: 90 }}>{k}</span>
      <span
        style={{
          color: "#e6edf3",
          fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
        }}
      >
        {v}
      </span>
    </div>
  );
  const hint = TRY_HINTS[kb.id];
  return (
    <>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: "#161b22",
          border: "1px solid #283040",
          borderRadius: 12,
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
            color: "#7ee787",
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          Selected keyboard
        </div>
        <Row k="id" v={kb.id} />
        <Row k="name" v={kb.displayName} />
        <Row k="path" v={kb.path} />
        <Row k="script" v={kb.script} />
        <Row k="version" v={kb.version} />
        <Row k="targets" v={kb.targets.join(", ")} />
        {kb.packageId !== undefined ? <Row k="packageId" v={kb.packageId} /> : null}
      </div>

      {hint && (
        <div
          style={{
            marginTop: 12,
            padding: 16,
            background: "#161b22",
            border: "1px solid #283040",
            borderRadius: 12,
          }}
        >
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#d2a8ff",
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            Try typing
          </div>
          <div style={{ fontSize: 13, color: "#9aa7b8", marginBottom: 8 }}>
            {hint.intro}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: "#e6edf3",
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: "ui-monospace, 'Cascadia Code', Consolas, monospace",
            }}
          >
            {hint.examples.map((ex) => (
              <li key={ex}>{ex}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function PreviewShell() {
  const [baseKeyboard, setBaseKeyboard] = useState<BaseKeyboard | null>(null);
  const [oskMode, setOskMode] = useState<OskMode>("desktop");

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(320px, 1fr) minmax(520px, 1.4fr)",
        gap: 24,
        height: "100vh",
        width: "100vw",
        padding: 24,
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        boxSizing: "border-box",
      }}
    >
      {/* [SCAFFOLD] Left pane: picker-only until survey UI (#48-#49) */}
      <section
        aria-label="Picker pane"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.4rem", letterSpacing: "-0.01em" }}>
          Keyboard Studio
        </h1>
        <p style={{ margin: 0, color: "#9aa7b8", fontSize: 13 }}>
          Pick a base keyboard; the right pane compiles its source and renders
          the live preview.
        </p>
        <div style={{ marginTop: 8 }}>
          <BaseKeyboardPicker value={baseKeyboard} onChange={setBaseKeyboard} />
        </div>
        {baseKeyboard !== null ? <MetadataCard kb={baseKeyboard} /> : null}
      </section>

      <section
        aria-label="Preview pane"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe" }}>
            Live preview
          </h2>
          <OskModeToggle value={oskMode} onChange={setOskMode} />
        </div>
        <OSKFrame baseKeyboard={baseKeyboard} oskMode={oskMode} />
      </section>
    </div>
  );
}
