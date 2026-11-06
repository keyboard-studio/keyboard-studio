// rawCtrlUpgrade: the fix for the raw-Ctrl criterion (spec 114 FR-002).
//
// Parses the `.kmn` to IR, drops every rule the criterion reports, and
// projects the edit back onto the original text (`projectKmnText`), so only
// those rules differ. The characters those rules typed that no remaining rule
// types are returned as the offer's inventory additions: unplaced, so the
// Mechanisms step that follows Upgrades is where the author gives each a new
// key. Touch layouts are left unchanged, and the preview says so.
//
// Pure of timers and store reads (decision D3 is untouched).

import { parseKmn, projectKmnText } from "@keyboard-studio/engine";
import { findRawCtrlRules, type RawCtrlRule } from "@keymanapp/keyboard-lint";

import { findingKeyOf } from "./openRatchet.ts";
import { charactersOf } from "../lib/openInventory.ts";
import { uplus } from "../lib/consistencySuggestions.ts";
import type { UpgradeInput, UpgradeOffer } from "./upgradeTypes.ts";

export const RAW_CTRL = "KM_LINT_RAW_CTRL";

/** Names for characters that cannot be seen on their own. */
const INVISIBLE_NAMES: Readonly<Record<number, string>> = {
  0x0300: "COMBINING GRAVE ACCENT",
  0x0301: "COMBINING ACUTE ACCENT",
  0x0302: "COMBINING CIRCUMFLEX ACCENT",
  0x0303: "COMBINING TILDE",
  0x0304: "COMBINING MACRON",
  0x0308: "COMBINING DIAERESIS",
  0x00a0: "NO-BREAK SPACE",
  0x2002: "EN SPACE",
  0x2003: "EM SPACE",
  0x2009: "THIN SPACE",
  0x200a: "HAIR SPACE",
  0x200b: "ZERO WIDTH SPACE",
  0x200c: "ZERO WIDTH NON-JOINER",
  0x200d: "ZERO WIDTH JOINER",
  0x200e: "LEFT-TO-RIGHT MARK",
  0x200f: "RIGHT-TO-LEFT MARK",
  0x202f: "NARROW NO-BREAK SPACE",
};

/** A character as the preview shows it: itself when visible, else its name. */
function describeChar(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  const name = INVISIBLE_NAMES[cp];
  if (name !== undefined) return `${uplus(ch)} ${name}`;
  if (/[\p{Cf}\p{Z}\p{Cc}\p{Mn}]/u.test(ch)) return `${uplus(ch)} (invisible)`;
  return ch;
}

function describeRule(r: RawCtrlRule): string {
  const out = [...r.outputs.join("")].map(describeChar).join(" ");
  return `[${r.plane} ${r.key}] > ${out}`;
}

const TOUCH_NOTE =
  "Touch layouts are not changed. If this keyboard has a touch layer reached on Ctrl, it keeps working as before.";

export async function buildRawCtrlOffer(input: UpgradeInput): Promise<UpgradeOffer | null> {
  const startIr = parseKmn(input.kmnText, input.keyboardId).ir;
  const rules = findRawCtrlRules(startIr, input.keyboardId);
  if (rules.length === 0) return null;

  const drop = new Set(rules.map((r) => r.nodeId));
  const nextIr = structuredClone(startIr);
  for (const g of nextIr.groups) g.rules = g.rules.filter((r) => !drop.has(r.nodeId));

  const projected = projectKmnText(input.kmnText, startIr, nextIr);
  if (!projected.ok) return null;
  const afterText = projected.text;
  if (afterText === input.kmnText) return null;

  // Characters a remaining rule still types need no new key.
  const stillTyped = new Set<string>();
  for (const g of nextIr.groups) {
    for (const r of g.rules) {
      for (const o of r.output) {
        if (o.kind === "char") for (const ch of charactersOf(o.value)) stillTyped.add(ch);
      }
    }
  }
  const additions: string[] = [];
  for (const r of rules) {
    for (const ch of charactersOf(r.outputs.join(""))) {
      if (!stillTyped.has(ch) && !additions.includes(ch)) additions.push(ch);
    }
  }

  return {
    file: input.file,
    afterText,
    inventoryAdditions: additions,
    fix: {
      id: `upgrade:${RAW_CTRL}:${input.file}`,
      kind: "upgrade",
      findingKey: findingKeyOf(RAW_CTRL, input.file, undefined),
      preview: [
        { file: input.file, before: input.kmnText, after: afterText },
        { file: "Ctrl rules removed", before: rules.map(describeRule).join("\n"), after: TOUCH_NOTE },
      ],
      status: "pending",
      title: "Move characters off Ctrl",
    },
  };
}
