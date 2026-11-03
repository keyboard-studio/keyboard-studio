// buildReadmeFacts (spec 110): the one set of facts README.md and readme.htm
// are rendered from. Characters and keystrokes come from the working IR by the
// same rules the welcome page's typing guide uses (docContent.ts), so the two
// never disagree; everything else is a recorded answer, passed in. Pure,
// synchronous and deterministic — gatherReadmeFactsInput does the store reads.

import {
  DOC_FORMS,
  fillDocPhrase,
  type FallbackPolicy,
  type KeyboardIR,
  type TouchLayoutIR,
} from "@keyboard-studio/contracts";
import { getCategory } from "@keyboard-studio/contracts/unicode";
import type { ReadmeCharacterGroup, ReadmeFacts, ReadmeTypingRow } from "@keyboard-studio/engine";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  compareCodePoints,
  groupOf,
  isBaseCharacter,
  producedChars,
  shortestKeySteps,
  type CharGroup,
} from "./docContent.ts";
import { displayChar } from "./irToCarveNodes.ts";
import type { LayoutFamilyValue } from "./layoutFamily.ts";

/** At most this many example rows in the README's How to type table (spec 110 FR-004). */
export const README_TYPING_ROW_CAP = 8;
/** At most this many design notes (spec 110 FR-008). */
export const README_DESIGN_NOTE_CAP = 6;

export interface ReadmeFactsInput {
  /** The working-copy IR; null before a keyboard is loaded. */
  ir: KeyboardIR | null;
  touchLayout: TouchLayoutIR | null;
  /** Primary first. Only languages with a known English name are listed. */
  languages: ReadonlyArray<{ tag: string; name: string; autonym?: string }>;
  /** The starting keyboard's ISO 15924 script, used when no tag names one. */
  script?: string;
  isAdaptation: boolean;
  startKeyboard: { displayName: string } | null;
  layoutFamily?: LayoutFamilyValue;
  /** The `use-case` answer. */
  useCase?: string;
  /** The `mark-input-order` answer. */
  markInputOrder?: string;
  fallbackPolicy: FallbackPolicy;
  /** The `touch-seed-source` answer. */
  touchSeedSource?: string;
  carveChars: ReadonlySet<string>;
  designRationale?: string;
  /** Track 2: the inherited description, used when the author has not written one. */
  fallbackDescription?: string;
}

type TypingMethod = "rightAlt" | "sequence" | "touch" | "direct";
/** The order the first pass picks one example per method in. */
const METHOD_ORDER: readonly TypingMethod[] = ["rightAlt", "sequence", "touch", "direct"];

interface Candidate extends ReadmeTypingRow {
  /** The keystrokes before joining, so a dead key is read from its first step, not by re-splitting `keys`. */
  steps: readonly string[];
  method: TypingMethod;
  group: CharGroup;
}

const PHRASES = DOC_FORMS.readmePhrases;

/** The design note names the ways in beyond a plain key press; a key of its own needs no note. */
const NOTED_METHOD_PHRASE: Readonly<Partial<Record<TypingMethod, string>>> = {
  rightAlt: PHRASES.methodRightAlt,
  sequence: PHRASES.methodSequence,
  touch: PHRASES.methodTouch,
};

const USE_CASE_PHRASE: Readonly<Record<string, string>> = {
  literacy: PHRASES.useCaseLiteracy,
  messaging: PHRASES.useCaseMessaging,
  official: PHRASES.useCaseOfficial,
};

const LAYOUT_FAMILY_LABEL: Readonly<Partial<Record<LayoutFamilyValue, string>>> = {
  qwerty: "QWERTY",
  qwertz: "QWERTZ",
  azerty: "AZERTY",
};

/** A keystroke label as a reader sees it: the space bar is named, never left as blank space. */
function stepLabel(step: string): string {
  return step === " " ? "Space" : step;
}

function keysOf(steps: readonly string[]): string {
  return steps.map(stepLabel).join(" then ");
}

function methodOfSteps(steps: readonly string[]): TypingMethod {
  if (steps.length > 1) return "sequence";
  return steps[0]!.includes("AltGr") ? "rightAlt" : "direct";
}

function desktopCandidates(ir: KeyboardIR, extras: readonly string[]): Candidate[] {
  const rows: Candidate[] = [];
  for (const ch of extras) {
    const steps = shortestKeySteps(ir, ch);
    if (steps === undefined) continue;
    rows.push({ keys: keysOf(steps), steps, output: displayChar(ch), method: methodOfSteps(steps), group: groupOf(ch.codePointAt(0)!) });
  }
  return rows;
}

/** Long-press and flick characters beyond printable ASCII, one row per character, in layout order. */
function touchCandidates(layout: TouchLayoutIR | null): Candidate[] {
  if (layout === null) return [];
  const rows: Candidate[] = [];
  const seen = new Set<string>();
  const add = (keys: string, text: string) => {
    if (text === "" || [...text].every(isBaseCharacter) || seen.has(text)) return;
    seen.add(text);
    rows.push({ keys, steps: [keys], output: displayChar(text), method: "touch", group: groupOf(text.codePointAt(0)!) });
  };
  for (const platform of layout.platforms) {
    for (const layer of platform.layers) {
      for (const row of layer.rows) {
        for (const key of row.keys) {
          const label = key.text !== undefined && key.text !== "" ? key.text : key.id;
          for (const sub of key.sk ?? []) add(`long-press ${label} (touch)`, sub.text ?? "");
          for (const sub of Object.values(key.flick ?? {})) add(`flick ${label} (touch)`, sub?.text ?? "");
        }
      }
    }
  }
  return rows;
}

/** One example per method in METHOD_ORDER, then the rest in candidate order, up to the cap. */
function pickTypingRows(candidates: readonly Candidate[]): Candidate[] {
  const picked = new Set<Candidate>();
  for (const method of METHOD_ORDER) {
    const first = candidates.find((c) => c.method === method);
    if (first !== undefined && picked.size < README_TYPING_ROW_CAP) picked.add(first);
  }
  for (const c of candidates) {
    if (picked.size >= README_TYPING_ROW_CAP) break;
    picked.add(c);
  }
  return candidates.filter((c) => picked.has(c));
}

/**
 * How to type each sequence trigger's own character: for a sequence whose
 * first step is a single character (a dead key such as `;`), the shortest way
 * the keyboard gives that character, when that takes more than the key alone.
 * A trigger the keyboard gives no way to type gets no row — none is invented.
 */
function literalRows(ir: KeyboardIR, candidates: readonly Candidate[]): ReadmeTypingRow[] {
  const triggers = new Set<string>();
  for (const c of candidates) {
    if (c.method !== "sequence") continue;
    const first = c.steps[0]!;
    if ([...first].length === 1 && first !== " ") triggers.add(first);
  }
  const rows: ReadmeTypingRow[] = [];
  for (const trigger of [...triggers].sort(compareCodePoints)) {
    const steps = shortestKeySteps(ir, trigger);
    if (steps !== undefined && steps.length > 1) rows.push({ keys: keysOf(steps), output: trigger });
  }
  return rows;
}

function compositionOf(extras: readonly string[]): ReadmeFacts["composition"] {
  let combining = false;
  let precomposed = false;
  for (const ch of extras) {
    const cat = getCategory(ch.codePointAt(0)!);
    if (cat === "Mn" || cat === "Mc") combining = true;
    else if (ch.normalize("NFD") !== ch) precomposed = true;
  }
  if (combining && precomposed) return "mixed";
  if (combining) return "decomposed";
  return precomposed ? "precomposed" : undefined;
}

function characterGroupsOf(extras: readonly string[]): ReadmeCharacterGroup[] {
  const groups = new Map<CharGroup, string[]>();
  for (const ch of extras) {
    const g = groupOf(ch.codePointAt(0)!);
    groups.set(g, [...(groups.get(g) ?? []), displayChar(ch)]);
  }
  return GROUP_ORDER.filter((g) => groups.has(g)).map((g) => ({ kind: g, label: GROUP_LABEL[g], chars: groups.get(g)! }));
}

/** "Letters: Right Alt, key sequences. Marks: Right Alt." over the groups typed some way beyond a plain key press. */
function methodsNote(candidates: readonly Candidate[]): string | undefined {
  const parts = GROUP_ORDER.flatMap((g) => {
    const methods = METHOD_ORDER.flatMap((m) => {
      const phrase = NOTED_METHOD_PHRASE[m];
      return phrase !== undefined && candidates.some((c) => c.group === g && c.method === m) ? [phrase] : [];
    });
    return methods.length > 0 ? [fillDocPhrase(PHRASES.noteMethods, { group: GROUP_LABEL[g], methods: methods.join(", ") })] : [];
  });
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function designNotesOf(input: ReadmeFactsInput, candidates: readonly Candidate[]): string[] {
  const notes: string[] = [];
  const start = input.startKeyboard;
  if (start !== null) {
    notes.push(
      input.isAdaptation
        ? PHRASES.noteAdaptedFrom
        : fillDocPhrase(PHRASES.noteStartedFrom, { name: start.displayName }),
    );
  }
  const methods = methodsNote(candidates);
  if (methods !== undefined) notes.push(methods);
  if (input.markInputOrder === "prefix") notes.push(PHRASES.noteMarksPrefix);
  else if (input.markInputOrder === "postfix") notes.push(PHRASES.noteMarksPostfix);
  if (input.touchSeedSource === "reseed-from-desktop") notes.push(PHRASES.noteTouchFromDesktop);
  else if (input.touchSeedSource === "import-adapt" && start !== null) {
    notes.push(fillDocPhrase(PHRASES.noteTouchAdapted, { name: start.displayName }));
  }
  if (input.carveChars.size > 0 && start !== null) {
    const phrase = input.fallbackPolicy === "pass-through" ? PHRASES.noteRemovedPassThrough : PHRASES.noteRemovedSwallow;
    notes.push(fillDocPhrase(phrase, { count: String(input.carveChars.size), name: start.displayName }));
  }
  const rationale = input.designRationale?.trim();
  if (rationale !== undefined && rationale !== "") notes.push(fillDocPhrase(PHRASES.noteRationale, { text: rationale }));
  return notes.slice(0, README_DESIGN_NOTE_CAP);
}

export function buildReadmeFacts(input: ReadmeFactsInput): ReadmeFacts {
  const extras = input.ir !== null ? producedChars(input.ir).filter((ch) => !isBaseCharacter(ch)) : [];
  const candidates = [
    ...(input.ir !== null ? desktopCandidates(input.ir, extras) : []),
    ...touchCandidates(input.touchLayout),
  ];
  const typing = pickTypingRows(candidates);
  const family = input.layoutFamily !== undefined ? LAYOUT_FAMILY_LABEL[input.layoutFamily] : undefined;
  const useCase = input.useCase !== undefined ? USE_CASE_PHRASE[input.useCase] : undefined;
  const fallbackDescription = input.fallbackDescription?.trim();
  const composition = compositionOf(extras);
  return {
    languages: input.languages.map((l, i) => ({
      name: l.name,
      tag: l.tag,
      ...(i === 0 && l.autonym !== undefined && l.autonym.trim() !== "" ? { autonym: l.autonym.trim() } : {}),
    })),
    ...(input.script !== undefined && input.script !== "" ? { script: input.script } : {}),
    ...(!input.isAdaptation && input.startKeyboard !== null
      ? { basedOn: { name: input.startKeyboard.displayName, ...(family !== undefined ? { layoutFamily: family } : {}) } }
      : {}),
    ...(useCase !== undefined ? { useCase } : {}),
    characterGroups: characterGroupsOf(extras),
    removed: [...input.carveChars].sort(compareCodePoints).map(displayChar),
    ...(composition !== undefined ? { composition } : {}),
    typingRows: typing.map(({ keys, output }) => ({ keys, output })),
    literalRows: input.ir !== null ? literalRows(input.ir, candidates) : [],
    typingRowsOmitted: typing.length < candidates.length,
    needsFontNote: extras.some((ch) => ch.codePointAt(0)! > 0xff),
    designNotes: designNotesOf(input, candidates),
    ...(input.isAdaptation && fallbackDescription !== undefined && fallbackDescription !== ""
      ? { fallbackDescription }
      : {}),
  };
}
