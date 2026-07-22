// MetadataCard — displays selected base keyboard metadata and try-it hints.

import { Trans } from "@lingui/react/macro";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { BG_CARD, CARD_BORDER, FONT_MONO, SUCCESS_ACCENT, TEXT_MAIN } from "../ui/theme.ts";

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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8, fontSize: 13 }}>
      <span style={{ color: "#9aa7b8", minWidth: 90 }}>{k}</span>
      <span style={{ color: TEXT_MAIN, fontFamily: FONT_MONO }}>{v}</span>
    </div>
  );
}

export function MetadataCard({ kb }: { kb: BaseKeyboard }) {
  const hint = TRY_HINTS[kb.id];
  return (
    <>
      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: BG_CARD,
          border: `1px solid ${CARD_BORDER}`,
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
            color: SUCCESS_ACCENT,
            fontWeight: 700,
            marginBottom: 4,
          }}
        >
          <Trans id="metadata.selectedKeyboard.heading">Selected keyboard</Trans>
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
            background: BG_CARD,
            border: `1px solid ${CARD_BORDER}`,
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
            <Trans id="metadata.tryTyping.heading">Try typing</Trans>
          </div>
          <div style={{ fontSize: 13, color: "#9aa7b8", marginBottom: 8 }}>
            {hint.intro}
          </div>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              color: TEXT_MAIN,
              fontSize: 13,
              lineHeight: 1.7,
              fontFamily: FONT_MONO,
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
