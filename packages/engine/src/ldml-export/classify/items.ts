// Builds CompatibilityItems from profile rows (spec 108, FR-010, FR-061).
// Status, code and severity come from the resolved profile row; the only
// adjustment made here is that a non-rule site is never above a hint.

import type { ProfileRow, ProfileRowStatus, TargetProfile } from "../profiles/types.js";
import type { CompatibilityItem, LdmlCode, LdmlSide, LdmlStatus, RowId } from "../types.js";

/** Short English construct labels, by mapping row. */
const CONSTRUCT: Record<string, string> = {
  "1.1": "entry group",
  "1.2": "begin ANSI with no begin Unicode",
  "1.3": "NewContext group",
  "1.4": "PostKeystroke group",
  "1.4a": "PostKeystroke layer rule that depends only on the layer and the key",
  "1.4b": "layer rule that depends on earlier text",
  "1.5": "context-only group called on every path",
  "1.6": "context-only group called on some paths",
  "1.7": "keystroke group called from a keystroke group",
  "1.8": "match or nomatch rule that only calls a group",
  "1.9": "match or nomatch rule with output",
  "1.10": "readonly group",
  "1.11": "group unreachable from the entry group",
  "1.12": "call()",
  "1.13": "target selector on a rule",
  "2.1": "positional key rule",
  "2.2": "ISO key rule",
  "2.4": "key not on the chosen keyboard form",
  "2.5": "frame key",
  "2.6": "character keystroke",
  "2.7": "character keystroke on a mnemonic keyboard",
  "2.8": "key with no rule",
  "2.12": "RSHIFT modifier",
  "2.14": "rule with no caps flag",
  "2.15": "caps-lock mode setting",
  "2.18": "backspace rule with context",
  "2.19": "backspace rule with modifiers",
  "2.21": "touch-only key in a hardware rule",
  "2.22": "NUMLOCK or SCROLL modifier flag",
  "2.23": "left and right modifiers mixed in one rule",
  "2.24": "backspace rule with an empty context",
  "2.25": "any() over virtual keys in keystroke position",
  "2.26": "position where the base keyboard has a dead key",
  "3.4": "deadkey matched in context but never output",
  "3.9": "index() expansion beyond the cap",
  "3.10": "notany() class",
  "3.11": "notany() over multi-character items",
  "3.13": "more than nine capture groups",
  "3.15a": "nul output with no context",
  "3.15b": "nul output with context",
  "3.16": "beep output",
  "3.17": "if(option = 'value') guard",
  "3.18": "option-store rule (set, save, reset, or other if())",
  "3.19": "platform() condition",
  "3.20": "baselayout() condition",
  "3.21": "layer state in a rule",
  "3.22": "rules that differ only by NFC and NFD",
  "3.23": "output that differs from its NFC form",
  "3.24": "nul in context",
  "3.26": "raw store item",
  "4.1": "&NAME",
  "4.3": "&KEYBOARDVERSION",
  "4.6": "&TARGETS",
  "4.9": "metadata store",
  "4.10": "attribution",
  "4.11": "&BITMAP",
  "4.12": "header directive",
  "4.13": "&CASEDKEYS",
  "4.14": "&MNEMONICLAYOUT",
  "4.16": "no language tag",
  "4.17": "base keyboard and provenance record",
  "5.3": "desktop touch platform",
  "5.8": "gestures on a gesture target",
  "5.9": "touch spacer",
  "5.11": "touch presentation (font, hint or dk)",
  "5.12": "touch layer-switch key",
  "5.13": "touch backspace, enter or tab key",
  "5.14": "touch key",
  "5.15": "touch layout",
  "6.1": "unparsed fragment",
  "6.2": "unrecognised element",
};

export interface AddOptions {
  nodeKey: string;
  /** Needed when the row's status is composite (`M/A`, `M/N`, `A/N`). */
  status?: LdmlStatus;
  line?: number | null | undefined;
  owner?: string | null;
  side?: LdmlSide;
  params?: Record<string, string>;
  /** True for a site inside a KMN group (a rule or fragment); false for stores, headers, bases. */
  isRule?: boolean;
  construct?: string;
}

export class ItemSink {
  private readonly map = new Map<string, CompatibilityItem>();

  constructor(readonly profile: TargetProfile) {}

  row(id: RowId): ProfileRow {
    const r = this.profile.rows.get(id);
    if (r === undefined) throw new Error(`LDML profile ${this.profile.id} has no row ${id}`);
    return r;
  }

  /** Add (or return the existing) item for a row at a site. */
  add(rowId: RowId, o: AddOptions): CompatibilityItem {
    const r = this.row(rowId);
    const status = o.status ?? resolveStatus(r.status);
    const composite = r.status.includes("/");
    // A composite row resolved to M carries no code; a plain M row keeps its hint code (3.4, 3.16).
    const code: LdmlCode | null = composite && status === "M" ? null : (r.code ?? null);
    let severity = code === null ? null : r.severity;
    if (severity === "warning" && o.isRule !== true) severity = "hint";
    const siteKey = `${code ?? ""}|${rowId}|${o.nodeKey}`;
    const existing = this.map.get(siteKey);
    if (existing !== undefined) return existing;
    const construct = o.construct ?? CONSTRUCT[rowId] ?? `mapping row ${rowId}`;
    const item: CompatibilityItem = {
      siteKey,
      rowId,
      status,
      code,
      severity,
      nodeKey: o.nodeKey,
      line: o.line ?? null,
      owner: o.owner ?? null,
      construct,
      consequence: status === "N" ? `Not exported: ${r.form}.` : `Exported as ${r.form}.`,
      params: o.params ?? {},
      side: o.side ?? "hardware",
    };
    this.map.set(siteKey, item);
    return item;
  }

  all(): CompatibilityItem[] {
    return [...this.map.values()];
  }
}

function resolveStatus(s: ProfileRowStatus): LdmlStatus {
  if (s.includes("/")) throw new Error(`row status ${s} needs an explicit status`);
  return s as LdmlStatus;
}

/** Recursively freeze a value. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
