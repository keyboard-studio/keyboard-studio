// CLDR legacy (43.1) keyboard → KeyboardIR (issue #2599).
//
// One `using keys` group ("main") carries the desktop rules:
//   - each `<map>` becomes `+ [modifiers K_x] > <output>`, where the output
//     is the `to` characters — or a named deadkey `dk(cldr_<hex>)` when the
//     `to` character is a dead-key character (the first character of some
//     `transforms type="simple"` `from`).
//   - each simple transform becomes `dk(cldr_<hex>) + [K_x] > <to>`, with the
//     struck key resolved through the keyMaps (the key whose `to` is the
//     transform's following character).
// The group order is keystroke rules first, then dead-key rules; kmcmplib
// sorts by key then longest-context-first, so the dead-key rules win where
// they apply regardless of this order.

import type {
  KeyboardIR,
  IRGroup,
  IRRule,
  ContextElement,
  OutputElement,
} from "@keyboard-studio/contracts";
import { makeRule, ruleKeystroke } from "@keyboard-studio/contracts";
import type { CldrLegacyKeyboard } from "./legacyXml.js";
import { isoToVkey, expandModifiers, formForLocale } from "./isoKeys.js";

/** Dead-key name for a dead-key character (ruling §5). */
export function deadkeyNameFor(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  return `cldr_${cp.toString(16).padStart(4, "0")}`;
}

/** One skipped item, recorded in the report — nothing is dropped silently. */
export interface CldrSkippedItem {
  reason: string;
  detail: string;
}

/** Report for one desktop import (see also the touch builder's report). */
export interface CldrDesktopImportReport {
  keyboardId: string;
  locale: string;
  /** e.g. `keyboards/windows/de-t-k0-windows.xml`. */
  sourceFile: string;
  keystrokeRules: number;
  transformRules: number;
  deadkeys: Array<{ char: string; name: string }>;
  /** Distinct ISO positions with no desktop vkey (touch-only / form-extra). */
  unmappedPositions: string[];
  /** Modifier alternatives skipped (e.g. `cmd` layers). */
  skippedModifiers: string[];
  skipped: CldrSkippedItem[];
}

export interface CldrDesktopImportResult {
  ir: KeyboardIR;
  report: CldrDesktopImportReport;
}

export interface ImportCldrDesktopOptions {
  keyboardId: string;
  displayName: string;
  /** BCP47 tags for the header (e.g. `["de"]`). */
  bcp47?: string[];
  /** Repo-relative source path, e.g. `keyboards/windows/de-t-k0-windows.xml`. */
  sourceFile: string;
  /**
   * `"android"` when the file being imported IS the Android file (the
   * Android-only-locale fallback, ruling §4): its `opt` keyMaps are touch
   * symbol layers, not desktop rules, and are skipped. Defaults to
   * `"desktop"`, where `opt` maps to RALT (macOS Option).
   */
  fileKind?: "desktop" | "android";
}

function systemStore(
  name: string,
  value: string,
  nodeId: string,
): KeyboardIR["stores"][number] {
  return {
    nodeId,
    name,
    isSystem: true,
    items: [...value].map((ch) => ({ kind: "char", value: ch }) as const),
  };
}

function charsOut(s: string): OutputElement[] {
  return [...s].map((ch) => ({ kind: "char", value: ch }) as const);
}

/**
 * Import a parsed legacy CLDR keyboard's desktop keyMaps + transforms into a
 * fresh KeyboardIR. Android files must not be passed here — their `opt`
 * keyMaps are touch symbol layers (see `touch.ts`); use
 * {@link importCldrKeyboard} for the combined desktop + touch import.
 */
export function importCldrDesktopKeyboard(
  parsed: CldrLegacyKeyboard,
  opts: ImportCldrDesktopOptions,
): CldrDesktopImportResult {
  const bcp47 = opts.bcp47 ?? [];
  const skipped: CldrSkippedItem[] = [];
  const unmappedPositions = new Set<string>();
  const skippedModifiers = new Set<string>();
  // Regional form for the form-dependent positions (B11/E13).
  const form = formForLocale(parsed.locale);

  // --- dead-key discovery: first char of every multi-char simple `from` ---
  const deadkeyChars = new Set<string>();
  for (const t of parsed.transforms) {
    const chars = [...t.from];
    if (chars.length >= 2) deadkeyChars.add(chars[0] as string);
    else {
      skipped.push({
        reason: "transform-not-deadkey-led",
        detail: `from=${JSON.stringify(t.from)} to=${JSON.stringify(t.to)}`,
      });
    }
  }
  const deadkeys = [...deadkeyChars]
    .sort()
    .map((char) => ({ char, name: deadkeyNameFor(char) }));
  const deadkeyByChar = new Map(deadkeys.map((d) => [d.char, d.name]));

  // --- char → struck key, for resolving transform followers ---
  // Built from the keyMaps in order (base layer first): the first key that
  // types a character wins, so plain keys beat shifted ones.
  const keyForChar = new Map<string, { vkey: string; modifiers: string[] }>();

  const rules: IRRule[] = [];
  let ruleCounter = 0;
  const nextNodeId = (): string => `rule:cldr:${++ruleCounter}`;
  const seenKeystrokes = new Set<string>();

  for (const keyMap of parsed.keyMaps) {
    // Android files carry their symbol layers as `opt` keyMaps — touch-only
    // (ruling §4). On a desktop file `opt` is the macOS Option key and maps
    // to RALT via expandModifiers.
    if (
      opts.fileKind === "android" &&
      keyMap.modifiers !== undefined &&
      keyMap.modifiers.toLowerCase().includes("opt")
    ) {
      skipped.push({
        reason: "android-opt-keymap-touch-only",
        detail: `modifiers=${JSON.stringify(keyMap.modifiers)}`,
      });
      continue;
    }
    const { sets, skipped: skippedAlts } = expandModifiers(keyMap.modifiers);
    for (const alt of skippedAlts) skippedModifiers.add(alt);
    for (const modifiers of sets) {
      for (const map of keyMap.maps) {
        const vkey = isoToVkey(map.iso, form);
        if (vkey === undefined) {
          unmappedPositions.add(map.iso);
          continue;
        }
        if (map.to === "") {
          skipped.push({ reason: "empty-to", detail: `iso=${map.iso}` });
          continue;
        }
        const strokeKey = `${vkey}|${modifiers.join(" ")}`;
        if (seenKeystrokes.has(strokeKey)) {
          skipped.push({
            reason: "keystroke-collision",
            detail:
              `iso=${map.iso} (${vkey} ${modifiers.join(" ") || "base"}) ` +
              `to=${JSON.stringify(map.to)} collides with an earlier map`,
          });
          continue;
        }
        seenKeystrokes.add(strokeKey);
        const output: OutputElement[] =
          [...map.to].length === 1 &&
          deadkeyByChar.has(map.to) &&
          map.transformNo !== true
            ? [{ kind: "namedDeadkey", name: deadkeyByChar.get(map.to) as string }]
            : charsOut(map.to);
        rules.push(
          makeRule(
            {
              nodeId: nextNodeId(),
              keystroke: { kind: "vkey", name: vkey, modifiers },
              output,
            },
            { usingKeys: true },
          ),
        );
        // First producer wins for the follower lookup (base layer first).
        if (!keyForChar.has(map.to)) {
          keyForChar.set(map.to, { vkey, modifiers });
        }
      }
    }
  }

  // --- transforms → dead-key rules ---
  let transformRules = 0;
  const seenTransforms = new Set<string>();
  for (const t of parsed.transforms) {
    const fromChars = [...t.from];
    if (fromChars.length < 2) continue; // already reported above
    const dkChar = fromChars[0] as string;
    const dkName = deadkeyByChar.get(dkChar) as string;
    const rest = fromChars.slice(1);
    const lastChar = rest[rest.length - 1] as string;
    const struck = keyForChar.get(lastChar);
    if (struck === undefined) {
      skipped.push({
        reason: "transform-follower-has-no-key",
        detail: `from=${JSON.stringify(t.from)}: no key types ${JSON.stringify(lastChar)}`,
      });
      continue;
    }
    const transformKey = `${dkName}|${t.from}`;
    if (seenTransforms.has(transformKey)) continue;
    seenTransforms.add(transformKey);
    // makeRule writes the `+` separator itself (spec 116 FR-037): the
    // pre-context is everything before the struck key.
    const preContext: ContextElement[] = [
      { kind: "namedDeadkey", name: dkName },
      ...rest.slice(0, -1).map((ch) => ({ kind: "char", value: ch }) as const),
    ];
    rules.push(
      makeRule(
        {
          nodeId: nextNodeId(),
          preContext,
          keystroke: {
            kind: "vkey",
            name: struck.vkey,
            modifiers: struck.modifiers,
          },
          output: charsOut(t.to),
        },
        { usingKeys: true },
      ),
    );
    transformRules++;
  }

  // --- kmc-kmn caps consistency (error 4202669) ---
  // When any rule for a key mentions CAPS, every other rule for that key
  // must carry NCAPS, or the compiler rejects the keyboard ("this rule must
  // include NCAPS modifier to avoid inconsistent matches"). CLDR `caps`
  // keyMaps create exactly that shape, so add NCAPS (first, matching the
  // corpus convention `+ [NCAPS SHIFT K_A]`) to the sibling rules. The
  // struck key is the last context element in every rule built above.
  // NOTE: a `caps?` alternative collapses to one rule here (see
  // expandModifiers), so after this pass it fires only with caps off —
  // modifier+letter with CapsLock on falls through to the app.
  const capsKeys = new Set<string>();
  for (const rule of rules) {
    const last = ruleKeystroke(rule, { usingKeys: true });
    if (
      last?.kind === "vkey" &&
      last.modifiers.includes("CAPS")
    ) {
      capsKeys.add(last.name);
    }
  }
  for (const rule of rules) {
    const last = ruleKeystroke(rule, { usingKeys: true });
    if (
      last?.kind === "vkey" &&
      capsKeys.has(last.name) &&
      !last.modifiers.includes("CAPS") &&
      !last.modifiers.includes("NCAPS")
    ) {
      last.modifiers = ["NCAPS", ...last.modifiers];
    }
  }

  const keystrokeRules = rules.length - transformRules;

  const group: IRGroup = {
    nodeId: "group:cldr:main",
    name: "main",
    usingKeys: true,
    rules,
    readonly: false,
  };

  const displayName = opts.displayName;
  const ir: KeyboardIR = {
    origin: "imported",
    header: {
      keyboardId: opts.keyboardId,
      name: displayName,
      bcp47,
      copyright:
        "Copyright © Unicode, Inc. — CLDR keyboard data, Unicode License",
      version: "1.0",
      targets: ["any"],
      storeDirectives: [],
      encoding: "Unicode",
      entryPoints: { main: "main" },
    },
    stores: [
      systemStore("NAME", displayName, "store:cldr:NAME"),
      systemStore("VERSION", "17.0", "store:cldr:VERSION"),
      systemStore("KEYBOARDVERSION", "1.0", "store:cldr:KEYBOARDVERSION"),
      systemStore("TARGETS", "any", "store:cldr:TARGETS"),
      systemStore(
        "COPYRIGHT",
        "Copyright © Unicode, Inc. — CLDR keyboard data, Unicode License",
        "store:cldr:COPYRIGHT",
      ),
    ],
    groups: [group],
    comments: [
      {
        nodeId: "comment:cldr-source",
        text:
          `Imported from CLDR 43.1 ${opts.sourceFile} under the Unicode ` +
          `License (https://www.unicode.org/license.txt).`,
        anchor: "freestanding",
      },
    ],
    raw: [],
    recognizedPatterns: [],
  };

  return {
    ir,
    report: {
      keyboardId: opts.keyboardId,
      locale: parsed.locale,
      sourceFile: opts.sourceFile,
      keystrokeRules,
      transformRules,
      deadkeys,
      unmappedPositions: [...unmappedPositions].sort(),
      skippedModifiers: [...skippedModifiers].sort(),
      skipped,
    },
  };
}

/**
 * The desktop char→key resolution table a combined import builds, exposed so
 * the touch builder (and standalone callers such as #2610) can resolve a
 * touch label to the K_ key whose desktop rule produces it. Built from the
 * same keyMaps the desktop import consumed.
 */
export interface CldrDesktopCharTable {
  /** First key (base layer preferred) that types the character. */
  keyForChar(char: string): { vkey: string; modifiers: string[] } | undefined;
  /** Output of one (vkey, modifiers) keystroke, when the desktop file defines it. */
  outputForKey(vkey: string, modifiers: readonly string[]): string | undefined;
}

export function buildCldrDesktopCharTable(
  parsed: CldrLegacyKeyboard,
): CldrDesktopCharTable {
  const form = formForLocale(parsed.locale);
  const keyForChar = new Map<string, { vkey: string; modifiers: string[] }>();
  const outputByKey = new Map<string, string>();
  for (const keyMap of parsed.keyMaps) {
    const { sets } = expandModifiers(keyMap.modifiers);
    for (const modifiers of sets) {
      for (const map of keyMap.maps) {
        const vkey = isoToVkey(map.iso, form);
        if (vkey === undefined || map.to === "") continue;
        if (!keyForChar.has(map.to)) {
          keyForChar.set(map.to, { vkey, modifiers });
        }
        const key = `${vkey}|${modifiers.join(" ")}`;
        if (!outputByKey.has(key)) outputByKey.set(key, map.to);
      }
    }
  }
  return {
    keyForChar: (char: string) => keyForChar.get(char),
    outputForKey: (vkey: string, modifiers: readonly string[]) =>
      outputByKey.get(`${vkey}|${[...modifiers].join(" ")}`),
  };
}
