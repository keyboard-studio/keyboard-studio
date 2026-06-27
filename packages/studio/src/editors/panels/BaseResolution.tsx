// Base-resolution step of the hybrid flow (spec §8 "Base resolution"). Given the
// (language, script) target from identity-lite, lists the available bases via
// BaseBrowserService, ranks them with suggestBases() (language+script >
// script > language-cross-script > US-QWERTY fallback), and lets the author
// accept a suggestion or pick any base.
// The chosen base then back-fills the prefill confirmations. refs #369.

import { useEffect, useMemo, useState } from "react";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { getBaseBrowserService } from "../../lib/services.ts";
import {
  suggestBases,
  type SuggestReason,
  type SuggestTarget,
} from "../../lib/suggestBase.ts";
import { BaseKeyboardPicker } from "../../components/BaseKeyboardPicker.tsx";
import { Badge, Button } from "../../ui/index.ts";
import type { BadgeTone } from "../../ui/Badge.tsx";

const REASON_LABEL: Record<SuggestReason, string> = {
  "language-match": "Already supports your language",
  "script-match": "Matches your script",
  "language-cross-script": "Supports your language, different script",
  "us-qwerty-fallback": "Start blank (US QWERTY)",
};

// Token-mapped reason tones for Badge (exact CSS-var match verified):
//   language-match       → Badge "success"  (var(--sil-green))
//   script-match         → Badge "accent"   (var(--app-accent))
//   language-cross-script→ Badge "warn"     (var(--sil-orange-dark))
//   us-qwerty-fallback   → Badge "subtle"   (var(--app-text-subtle))
const REASON_TONE: Record<SuggestReason, BadgeTone> = {
  "language-match": "success",
  "script-match": "accent",
  "language-cross-script": "warn",
  "us-qwerty-fallback": "subtle",
};

export interface BaseResolutionProps {
  /** The chosen (language, script) target from identity-lite. */
  target: SuggestTarget;
  onResolved: (base: BaseKeyboard) => void;
  onBack?: () => void;
}

export function BaseResolution({
  target,
  onResolved,
  onBack,
}: BaseResolutionProps) {
  const [bases, setBases] = useState<BaseKeyboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<BaseKeyboard | null>(null);

  useEffect(() => {
    let live = true;
    getBaseBrowserService()
      .listAll()
      .then(
        (kbs) => {
          if (!live) return;
          setBases(kbs);
          setLoading(false);
        },
        (err) => {
          if (!live) return;
          console.error("[BaseResolution] listAll() failed:", err);
          setError("Could not load base keyboards.");
          setLoading(false);
        },
      );
    return () => {
      live = false;
    };
  }, []);

  // Build the phonebook from the loaded bases' .languages arrays so the caller
  // need not thread a separate map. Each base's languages field (populated from
  // its .kps <Languages> block) is used as-is; bases without languages degrade
  // to script-match ranking via the empty-array default in suggestBases().
  const languagesById = useMemo(
    () =>
      Object.fromEntries(
        bases.map((b) => [b.id, b.languages ?? []] as const),
      ),
    [bases],
  );

  const suggestions = useMemo(
    () => suggestBases(bases, target, { languagesById }),
    [bases, target, languagesById],
  );

  const heading: React.CSSProperties = {
    margin: "0 0 8px 0",
    fontSize: "1.1rem",
    color: "var(--app-accent)",
    fontWeight: 600,
    fontFamily: "var(--app-font)",
  };
  const subtle: React.CSSProperties = {
    margin: "0 0 20px 0",
    fontSize: 13,
    color: "var(--app-text-muted)",
    fontFamily: "var(--app-font)",
  };

  if (loading) return <div role="status" style={{ color: "var(--app-text-muted)", fontFamily: "var(--app-font)" }}>Loading base keyboards...</div>;
  if (error !== null) return <div style={{ color: "var(--danger)", fontFamily: "var(--app-font)" }}>{error}</div>;
  if (bases.length === 0)
    return (
      <div role="status" style={{ color: "var(--app-text-muted)", fontSize: 13, fontFamily: "var(--app-font)" }}>
        No base keyboards found. Check your connection and try again.
      </div>
    );

  return (
    <div style={{ color: "var(--app-text)", fontFamily: "var(--app-font)" }}>
      <h2 style={heading}>Choose a starting keyboard</h2>
      <p style={subtle}>
        Based on your language and chosen script, here are the closest starting
        points. Pick one, or choose another below.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {suggestions.map(({ base, reason }) => (
          <Button
            key={base.id}
            variant="secondary"
            onClick={() => onResolved(base)}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              background: "var(--app-surface)",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              color: "var(--app-text)",
              fontSize: 14,
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "var(--app-font)",
            }}
          >
            <span>
              <strong>{base.displayName}</strong>{" "}
              <span style={{ color: "var(--app-text-muted)", fontSize: 12 }}>({base.id})</span>
            </span>
            <Badge tone={REASON_TONE[reason]}>{REASON_LABEL[reason]}</Badge>
          </Button>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--app-border)", paddingTop: 16 }}>
        <p style={{ ...subtle, marginBottom: 8 }}>Or pick any base keyboard:</p>
        <BaseKeyboardPicker value={picked} onChange={setPicked} target={target} />
        <Button
          variant="secondary"
          disabled={picked === null}
          onClick={() => picked !== null && onResolved(picked)}
          style={{
            marginTop: 10,
            padding: "8px 18px",
            background: picked === null ? "transparent" : "var(--app-accent)",
            border: "1px solid var(--app-border)",
            borderRadius: 6,
            color: picked === null ? "var(--app-text-subtle)" : "var(--app-text)",
            fontSize: 13,
            cursor: picked === null ? "not-allowed" : "pointer",
            fontFamily: "var(--app-font)",
          }}
        >
          Use this keyboard
        </Button>
      </div>

      {onBack !== undefined && (
        <Button
          variant="secondary"
          onClick={onBack}
          style={{
            marginTop: 20,
            padding: "6px 14px",
            background: "transparent",
            border: "1px solid var(--app-border)",
            borderRadius: 6,
            color: "var(--app-text-muted)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "var(--app-font)",
          }}
        >
          &larr; Back
        </Button>
      )}
    </div>
  );
}
