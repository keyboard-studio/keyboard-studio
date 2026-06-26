// Phase B survey wrapper — Character inventory discovery (spec §8 step 4).
//
// Two discovery methods are offered:
//   build-list  — unified: tick CLDR suggestions, type characters, see grid placeholder (DEFAULT)
//   manual      — step-by-step questions via SurveyRunner
//
// On completion, extractInventory() scans the Phase B answers for the question
// ids that carry character data, splits them into NFC graphemes, and populates
// SurveyPhaseResult.confirmedInventory (additive contract field). The gallery
// reads this via session.confirmedInventory (mergePhaseResults union).

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding, PlacementMap } from "@keyboard-studio/contracts";
import { toUPlusNotation } from "@keyboard-studio/contracts";
import { SurveyRunner } from "./SurveyRunner.tsx";
import { loadModularFlow } from "./loadModularFlow.ts";
import type { SurveyContext, FlowDef } from "./types.ts";
import { buildPlacementSeeds } from "./placementSeeds.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { nfcDedup } from "./charNormUtils.ts";
import { suggestMissingChars } from "../lib/services.ts";
import type { MissingCharSuggestions } from "../lib/services.ts";

// Vite ?raw import — typed via the `*.yaml?raw` declaration in src/vite-env.d.ts.
import phaseBModularRaw from "../../../../content/flows/phase_b_characters.modular.yaml?raw";

// Question id that begins the manual step-by-step path.
// makeManualOnlyFlow routes pb_discovery_intro straight here.
const PHASE_B_MANUAL_ENTRY = "pb_routing_branch";

// ---------------------------------------------------------------------------
// Character extraction — populates confirmedInventory on the phase result
// ---------------------------------------------------------------------------

// Question ids whose answers contain character data (spec §8 step 4).
// Text answers are split on whitespace; multi_select values are individual entries.
const CHAR_TEXT_IDS = new Set<string>([
  "pb_special_letters_list",    // "ŋ Ŋ ɛ Ɛ ɔ Ɔ" etc.
  "pb_latin_digraphs_list",     // "sh ts ny ng"
  "pb_indic_nukta_detail",      // consonant letters taking dot-below
  "pb_indic_vowels_onset_list", // independent vowel letters
  "pb_syllabic_finals_detail",  // final-consonant marks
  "pb_other_free_entry",        // free-entry characters
  "pb_rtl_special_letters",     // RTL language-specific letters
]);

// pb_picker_confirm is multi_select — each value is a single grapheme or token.
const CHAR_MULTI_SELECT_ID = "pb_picker_confirm";

/**
 * Extract NFC graphemes from the character-bearing Phase B answers.
 * Text answers are whitespace-split; picker multi_select entries are taken as-is.
 * Empties and whitespace-only tokens are dropped. Deduplicated, first-appearance order.
 */
function extractInventory(answers: SurveyAnswer[]): string[] {
  let result: string[] = [];

  for (const answer of answers) {
    if (CHAR_TEXT_IDS.has(answer.questionId) && answer.answerType === "text") {
      const tokens = (answer.value as string).split(/\s+/);
      result = nfcDedup(result, tokens);
    } else if (
      answer.questionId === CHAR_MULTI_SELECT_ID &&
      answer.answerType === "char-list"
    ) {
      result = nfcDedup(result, answer.value as string[]);
    }
  }

  return result;
}

/**
 * Parse a space-delimited character string into a deduplicated NFC array.
 * Exported for unit testing.
 *
 * "a b c ŋ ŋ" → ["a", "b", "c", "ŋ"]
 */
export function parseSpacedChars(input: string): string[] {
  return nfcDedup([], input.split(/\s+/));
}

// ---------------------------------------------------------------------------
// PhaseB state — intercept non-manual discovery choices
// ---------------------------------------------------------------------------

type DiscoveryMethod = "manual" | "build-list" | null;

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: MissingCharSuggestions | null }
  | { status: "error" };

// Return a modified FlowDef that starts at pb_routing_branch, skipping the
// discovery-intro question, so the runner goes straight into manual questions.
function makeManualOnlyFlow(flow: FlowDef): FlowDef {
  return {
    ...flow,
    questions: flow.questions.map((q) =>
      q.id === "pb_discovery_intro"
        ? { ...q, required: false, engine_resolved: true, next: PHASE_B_MANUAL_ENTRY }
        : q,
    ),
  };
}

// ---------------------------------------------------------------------------
// getFirstGrapheme — module-level helper, not exported
// ---------------------------------------------------------------------------

function getFirstGrapheme(s: string): string {
  if (!s) return "";
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const seg = new Intl.Segmenter();
    const [first] = seg.segment(s);
    return first?.segment ?? "";
  }
  return [...s][0] ?? "";
}

// ---------------------------------------------------------------------------
// addChars — pure helper: NFC-dedup-merge newChars into existing set
// ---------------------------------------------------------------------------

function addChars(prev: string[], incoming: string[]): string[] {
  return nfcDedup(prev, incoming);
}

// ---------------------------------------------------------------------------
// CharChipEditor — reusable type-in input + chip list (no state of its own)
// ---------------------------------------------------------------------------

/**
 * Presentational component: a text input that adds characters (first grapheme
 * per space-separated token) and a chip grid that shows accumulated chars with
 * remove buttons. State is owned by the parent.
 */
interface CharChipEditorProps {
  chars: string[];
  onChange: (next: string[]) => void;
  /** When true, auto-focus the input on mount. */
  autoFocus?: boolean;
}

function CharChipEditor({ chars, onChange, autoFocus = false }: CharChipEditorProps) {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function add(): void {
    const trimmed = inputVal.trim().normalize("NFC");
    if (!trimmed) return;
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const newChars = tokens.map(getFirstGrapheme).filter(Boolean);
    if (newChars.length === 0) return;
    onChange(addChars(chars, newChars));
    setInputVal("");
    inputRef.current?.focus();
  }

  const addDisabled = inputVal.trim() === "";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Input row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type characters (space-separated)…"
          aria-label="Character to add"
          style={{
            flex: 1,
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 16,
            fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
            padding: "8px 12px",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          disabled={addDisabled}
          onClick={add}
          style={{
            padding: "8px 18px",
            background: addDisabled ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: addDisabled ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: addDisabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            whiteSpace: "nowrap",
          }}
        >
          + Add
        </button>
      </div>

      {/* Chip grid */}
      <div>
        <p
          style={{
            margin: "0 0 8px 0",
            fontSize: 13,
            fontWeight: 600,
            color: "#e6edf3",
          }}
        >
          Your alphabet ({chars.length})
        </p>
        {chars.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
            No characters yet — add your first one above.
          </p>
        ) : (
          <div
            role="group"
            aria-label="Accumulated characters — click to remove"
            style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}
          >
            {chars.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onChange(chars.filter((x) => x !== c))}
                aria-label={`Remove ${c} (${toUPlusNotation(c)})`}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: "6px 10px",
                  border: "1px solid #30363d",
                  borderRadius: 8,
                  background: "#161b22",
                  cursor: "pointer",
                  gap: 2,
                  minWidth: 44,
                }}
              >
                <span
                  style={{
                    fontSize: 22,
                    fontFamily: "system-ui, sans-serif",
                    lineHeight: 1,
                    color: "#58a6ff",
                  }}
                >
                  {c}
                </span>
                <span
                  style={{
                    fontSize: 9,
                    color: "#8b949e",
                    fontFamily: "monospace",
                  }}
                >
                  {toUPlusNotation(c)}
                </span>
                <span style={{ fontSize: 10, color: "#f85149" }}>x</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SuggestionChip — a single CLDR suggestion chip (toggleable)
// ---------------------------------------------------------------------------

interface SuggestionChipProps {
  char: string;
  checked: boolean;
  onToggle: (c: string) => void;
}

function SuggestionChip({ char, checked, onToggle }: SuggestionChipProps) {
  const cp = toUPlusNotation(char);
  return (
    <button
      type="button"
      onClick={() => onToggle(char)}
      aria-label={`${checked ? "Remove" : "Add"} ${char} (${cp})`}
      aria-pressed={checked}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "6px 10px",
        border: `1px solid ${checked ? "#1f6feb" : "#30363d"}`,
        borderRadius: 8,
        background: checked ? "#0d2044" : "#161b22",
        cursor: "pointer",
        gap: 2,
        minWidth: 44,
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontFamily: "system-ui, sans-serif",
          lineHeight: 1,
          color: checked ? "#58a6ff" : "#8b949e",
        }}
      >
        {char}
      </span>
      <span style={{ fontSize: 9, color: "#8b949e", fontFamily: "monospace" }}>{cp}</span>
      <span style={{ fontSize: 10, color: checked ? "#58a6ff" : "#8b949e" }}>
        {checked ? "[x]" : "+"}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// SuggestionPanel — CLDR-grounded suggestions panel
// ---------------------------------------------------------------------------

interface SuggestionPanelProps {
  context: SurveyContext;
  chars: string[];
  onChange: (next: string[]) => void;
}

function SuggestionPanel({ context, chars, onChange }: SuggestionPanelProps) {
  const baseIr = useWorkingCopyStore((s) => s.baseIr);
  const bcp47 = context.bcp47_tag;
  const languageName = context.language_name;

  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [auxExpanded, setAuxExpanded] = useState(false);

  // Fetch suggestions whenever bcp47 or baseIr changes.
  useEffect(() => {
    if (!bcp47 || baseIr === null) {
      return;
    }
    let cancelled = false;
    setLoadState({ status: "loading" });
    suggestMissingChars(bcp47, baseIr, languageName)
      .then((result) => {
        if (!cancelled) setLoadState({ status: "done", data: result });
      })
      .catch(() => {
        if (!cancelled) setLoadState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [bcp47, baseIr, languageName]);

  function handleToggle(c: string): void {
    const nfc = c.normalize("NFC");
    if (chars.includes(nfc)) {
      onChange(chars.filter((x) => x !== nfc));
    } else {
      onChange(addChars(chars, [nfc]));
    }
  }

  const displayName = languageName ?? bcp47 ?? "this language";

  // Neutral note when no BCP47 or no baseIr yet
  if (!bcp47 || baseIr === null) {
    return (
      <div style={{ fontSize: 13, color: "#8b949e" }}>
        No verified character list for {displayName}. Add characters below.
      </div>
    );
  }

  if (loadState.status === "idle" || loadState.status === "loading") {
    return (
      <div style={{ fontSize: 13, color: "#8b949e" }}>
        Checking for a verified character list…
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div style={{ fontSize: 13, color: "#8b949e" }}>
        Could not load character suggestions. Add characters below.
      </div>
    );
  }

  const { data } = loadState;

  // null = no CLDR data
  if (data === null) {
    return (
      <div style={{ fontSize: 13, color: "#8b949e" }}>
        No verified character list for {displayName}. Add characters below.
      </div>
    );
  }

  // Empty main + auxiliary = base already covers the alphabet
  if (data.main.length === 0 && data.auxiliary.length === 0) {
    return (
      <div style={{ fontSize: 13, color: "#8b949e" }}>
        Your base keyboard already covers this language's alphabet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <p style={{ margin: "0 0 4px 0", fontSize: 13, fontWeight: 600, color: "#e6edf3" }}>
          Suggested for {data.languageName ?? displayName}
        </p>
        <p style={{ margin: "0 0 10px 0", fontSize: 11, color: "#8b949e" }}>
          from CLDR exemplars — tick to add
        </p>
        {data.main.length > 0 ? (
          <div
            role="group"
            aria-label="Suggested main characters — tick to add"
            style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
          >
            {data.main.map((c) => (
              <SuggestionChip
                key={c}
                char={c}
                checked={chars.includes(c.normalize("NFC"))}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
            No additional main characters needed.
          </p>
        )}
      </div>

      {data.auxiliary.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setAuxExpanded((v) => !v)}
            aria-expanded={auxExpanded}
            style={{
              background: "transparent",
              border: "none",
              color: "#8b949e",
              fontSize: 12,
              cursor: "pointer",
              padding: "4px 0",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>{auxExpanded ? "▼" : "▶"}</span>
            Also used in loanwords ({data.auxiliary.length})
          </button>
          {auxExpanded && (
            <div
              role="group"
              aria-label="Suggested auxiliary characters for loanwords — tick to add"
              style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}
            >
              {data.auxiliary.map((c) => (
                <SuggestionChip
                  key={c}
                  char={c}
                  checked={chars.includes(c.normalize("NFC"))}
                  onToggle={handleToggle}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GridPlaceholder — coming-soon grid section
// ---------------------------------------------------------------------------

function GridPlaceholder() {
  return (
    <div
      style={{
        padding: 16,
        border: "1px solid #30363d",
        borderRadius: 6,
        color: "#8b949e",
      }}
    >
      <strong style={{ color: "#e6edf3" }}>Browse a character grid</strong>
      <p style={{ margin: "8px 0 0 0", fontSize: 13 }}>
        Visual character grid — coming soon.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BuildListView — unified "build my character list" method
// ---------------------------------------------------------------------------

interface BuildListViewProps {
  context: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack: () => void;
}

function BuildListView({ context, onComplete, onBack }: BuildListViewProps) {
  const [chars, setChars] = useState<string[]>([]);
  const doneDisabled = chars.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        maxWidth: 640,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      {/* Back */}
      <button
        type="button"
        onClick={onBack}
        style={{
          alignSelf: "flex-start",
          padding: "8px 18px",
          background: "transparent",
          border: "1px solid #30363d",
          borderRadius: 6,
          color: "#8b949e",
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        Back
      </button>

      {/* Heading */}
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Phase B — Build your character list
      </h2>

      {/* Section 1: Suggestions from CLDR */}
      <section aria-label="Suggested characters from CLDR">
        <h3 style={{ margin: "0 0 10px 0", fontSize: "0.95rem", color: "#e6edf3", fontWeight: 600 }}>
          Suggested characters
        </h3>
        <SuggestionPanel context={context} chars={chars} onChange={setChars} />
      </section>

      {/* Divider */}
      <hr style={{ border: "none", borderTop: "1px solid #21262d", margin: 0 }} />

      {/* Section 2: Type-in characters */}
      <section aria-label="Add characters by typing">
        <h3 style={{ margin: "0 0 10px 0", fontSize: "0.95rem", color: "#e6edf3", fontWeight: 600 }}>
          Add a character
        </h3>
        <CharChipEditor chars={chars} onChange={setChars} autoFocus={false} />
      </section>

      {/* Divider */}
      <hr style={{ border: "none", borderTop: "1px solid #21262d", margin: 0 }} />

      {/* Section 3: Grid placeholder */}
      <section aria-label="Character grid (coming soon)">
        <GridPlaceholder />
      </section>

      {/* Footer: Done */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          disabled={doneDisabled}
          onClick={() => {
            onComplete({
              phase: "B",
              answers: [],
              confirmedInventory: chars,
            });
          }}
          style={{
            padding: "8px 18px",
            background: doneDisabled ? "#21262d" : "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: doneDisabled ? "#8b949e" : "#e6edf3",
            fontSize: 13,
            cursor: doneDisabled ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          Done ({chars.length} character{chars.length === 1 ? "" : "s"})
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PhaseB component
// ---------------------------------------------------------------------------

export interface PhaseBProps {
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
  /**
   * Optional placement map from the kbgen seeder (spec §7.6 / §8 Phase B).
   * When present, PlacementMap codepoints above the confidence threshold are
   * used to pre-fill pb_special_letters_list with the characters the seeder
   * knows the language needs.
   *
   * The placement data (vkey, modifiers) is NOT wired to any Phase B question —
   * Phase B has no question asking which key a character should go on.  The
   * seeder's key-assignment proposals belong to a future Phase C placement
   * confirmation step (out of scope for v1).
   *
   * Providing this prop does NOT affect the §7.2 StrategyRecommendation path
   * (D3 scope guard): the seeded value populates the question input as a plain
   * pre-fill; the user confirms or overrides it before it enters SurveyPhaseResult.
   */
  placementMap?: PlacementMap;
}

export function PhaseB({ context = {}, onComplete, onBack, findingsByQuestionId, placementMap }: PhaseBProps) {
  const flow = useMemo(() => loadModularFlow(phaseBModularRaw as string), []);
  const [discoveryMethod, setDiscoveryMethod] = useState<DiscoveryMethod>(null);
  // manualFlow is memoized here (before any early returns) to satisfy React's
  // rules of hooks — useMemo must not be called after a conditional return.
  const manualFlow = useMemo(() => makeManualOnlyFlow(flow), [flow]);

  // Build the placement seed lookup from the PlacementMap (if provided).
  // Recompute only when placementMap changes (reference equality).
  const placementSeeds = useMemo(
    () => (placementMap !== undefined ? buildPlacementSeeds(placementMap) : new Map<string, string>()),
    [placementMap],
  );

  // getSeedValue: called by SurveyRunner before pushing each question.
  // Returns the seeded default for pb_special_letters_list when the placement
  // map provided characters above the threshold; undefined otherwise.
  const getSeedValue = useCallback(
    (questionId: string): string | string[] | undefined => placementSeeds.get(questionId),
    [placementSeeds],
  );

  if (discoveryMethod === null) {
    return (
      <IntroChooser
        context={context}
        onChoose={setDiscoveryMethod}
        {...(onBack !== undefined ? { onBack } : {})}
      />
    );
  }

  if (discoveryMethod === "build-list") {
    return (
      <BuildListView
        context={context}
        onComplete={onComplete}
        onBack={() => setDiscoveryMethod(null)}
      />
    );
  }

  // Wrap onComplete to inject confirmedInventory before forwarding the result.
  // Not wrapped in useCallback intentionally — mirrors the IdentityLite.tsx neighbor pattern;
  // SurveyRunner captures onComplete via an internal ref (SurveyRunner.tsx:260), so a fresh
  // reference per render is harmless.
  function handleComplete(result: SurveyPhaseResult): void {
    onComplete({
      ...result,
      confirmedInventory: extractInventory(result.answers),
    });
  }

  // Manual path — use a patched flow that skips the intro question
  return (
    <div
      style={{
        background: "#0d1117",
        color: "#e6edf3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <h2
        style={{
          margin: "0 0 20px 0",
          fontSize: "1.1rem",
          color: "#6ea8fe",
          fontWeight: 600,
        }}
      >
        Phase B — Character inventory
      </h2>
      <SurveyRunner
        key={manualFlow.flow_id}
        flow={manualFlow}
        context={context}
        onComplete={handleComplete}
        onBack={() => setDiscoveryMethod(null)}
        getSeedValue={getSeedValue}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// IntroChooser — the discovery method selection card
// ---------------------------------------------------------------------------

interface IntroChooserProps {
  context: SurveyContext;
  onChoose: (method: DiscoveryMethod) => void;
  onBack?: () => void;
}

const METHODS: Array<{ value: Exclude<DiscoveryMethod, null>; label: string }> = [
  { value: "build-list", label: "Build my character list — type what you know and add suggested characters" },
  { value: "manual", label: "Step by step — I will answer the questions below" },
];

function IntroChooser({ context, onChoose, onBack }: IntroChooserProps) {
  const [selected, setSelected] = useState<Exclude<DiscoveryMethod, null>>("build-list");

  const languageName = context["language_name"] ?? context["detected_group"] ?? "your language";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
        Phase B — Character discovery
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
        How would you like to tell us which characters {languageName} uses?
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "#8b949e", lineHeight: 1.5 }}>
        Both methods feed the same final character list.
        The Build method starts with verified suggestions and lets you type additional characters.
      </p>

      <div role="radiogroup" aria-label="Discovery method">
        {METHODS.map(({ value, label }) => {
          const inputId = `discovery-method-${value}`;
          return (
            <label
              key={value}
              htmlFor={inputId}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginBottom: 10,
                cursor: "pointer",
                fontSize: 13,
                color: "#e6edf3",
              }}
            >
              <input
                type="radio"
                id={inputId}
                name="discovery_method"
                value={value}
                checked={selected === value}
                onChange={() => setSelected(value)}
                style={{ marginTop: 2, accentColor: "#6ea8fe" }}
              />
              <span style={{ lineHeight: 1.5 }}>{label}</span>
            </label>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {onBack !== undefined && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={() => onChoose(selected)}
          style={{
            padding: "8px 18px",
            background: "#1f6feb",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: "#e6edf3",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
