// decisionValueText — a humanized outline of a `decision` payload's stored
// value (spec 090 US5 payload kind), for the trail's expanded detail.
//
// The recorder deliberately gives the trail no per-module knowledge of what a
// value means (recordGalleryDecisions.ts, D-090-48): the summary digests the
// value's shape at record time, and the value itself "rides in the payload for
// anyone who expands the entry". This module is that reader — a generic walk
// over any `JsonValue` producing a bounded list of prose lines: scalars as
// themselves, character/item lists as their items, objects as one line per
// field. It returns LINE KINDS, not finished sentences, so the component owns
// the localized framing words ("none", "N items", "…and N more") and this
// module stays catalogue-free and unit-testable, the same split headline.ts
// uses.
//
// FR-008 discipline (no internal identifier ever renders):
//   - an object field's name is shown only when it is a single plain word
//     ("accepted", "declined", "retained", "ops") — a camelCase or
//     snake_case field name (`layoutId`, `triggerOutput`) is an internal
//     code, and its field is shown by its value alone;
//   - inside an item object, the `id` and `provenance` fields never render:
//     an id is an identifier, and per-item provenance is bookkeeping the
//     entry's own provenance line already states at the level the author
//     acted on it.
// Field VALUES are author/base-supplied content (the identifier guard's
// `payload.value` exemption) and render as they are.
//
// Bounds mirror the record's own boundedness (the summary limit, the editor
// sample limit): at most MAX_LINES lines, MAX_ITEMS items per array,
// MAX_FIELDS fields per object, MAX_TEXT characters per scalar — and every
// truncation leaves a `more` marker rather than ending silently.

import type { JsonValue } from "@keyboard-studio/contracts";
import { formatAnswerValue } from "./headline.ts";

export type DecisionValueLine =
  /** A finished content line, ready to render as-is. */
  | { kind: "text"; text: string }
  /** An absence to state in words ("none"), optionally under a field label. */
  | { kind: "empty"; label?: string }
  /** A collection shown only as its size ("N items"), optionally labelled. */
  | { kind: "count"; count: number; label?: string }
  /** Items/lines/fields omitted by a bound above ("…and N more"). */
  | { kind: "more"; count: number };

const MAX_LINES = 12;
const MAX_ITEMS = 8;
const MAX_PRIMITIVE_ITEMS = 24;
const MAX_FIELDS = 6;
const MAX_DEPTH = 2;
const MAX_TEXT = 500;

/** A field name that reads as prose: one lowercase word, nothing else. */
const PLAIN_FIELD_NAME = /^[a-z]+$/;

/** Item fields that never render (see the module header). */
const SKIPPED_ITEM_FIELDS: ReadonlySet<string> = new Set(["id", "provenance"]);

function truncateText(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** One scalar as display text — strings as themselves, booleans yes/no. */
function scalarText(value: string | number | boolean): string {
  if (typeof value === "number") return String(value);
  return truncateText(formatAnswerValue(value));
}

function isPrimitive(value: JsonValue): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

/**
 * One array item as a single line of text, or `null` when the item carries
 * nothing displayable (e.g. an object whose only fields are skipped ones).
 *
 * For an item object the primitive field VALUES are joined — with a string
 * `char` field first when present, since the character is what the item IS
 * (a punctuation item, a retained convenience char) and its sibling fields
 * are modifiers of it.
 */
function itemText(item: JsonValue): string | null {
  if (isPrimitive(item)) return scalarText(item);
  if (item === null || Array.isArray(item)) return null;
  const parts: string[] = [];
  const char = item["char"];
  if (typeof char === "string") parts.push(char);
  for (const [key, fieldValue] of Object.entries(item)) {
    if (key === "char" || SKIPPED_ITEM_FIELDS.has(key)) continue;
    if (isPrimitive(fieldValue)) parts.push(scalarText(fieldValue));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

function arrayLines(value: readonly JsonValue[]): DecisionValueLine[] {
  if (value.length === 0) return [{ kind: "empty" }];

  if (value.every(isPrimitive)) {
    // A list of scalars reads as one line. Short strings (characters,
    // single marks) join with a space, as `formatAnswerValue` joins a
    // char list; anything longer joins with a comma.
    const texts = value.map(scalarText);
    const shown = texts.slice(0, MAX_PRIMITIVE_ITEMS);
    const separator = texts.every((text) => text.length <= 2) ? " " : ", ";
    const lines: DecisionValueLine[] = [{ kind: "text", text: shown.join(separator) }];
    if (texts.length > shown.length) {
      lines.push({ kind: "more", count: texts.length - shown.length });
    }
    return lines;
  }

  const lines: DecisionValueLine[] = [];
  let rendered = 0;
  for (const item of value) {
    if (rendered >= MAX_ITEMS) break;
    const text = itemText(item);
    if (text !== null) {
      lines.push({ kind: "text", text });
      rendered += 1;
    }
  }
  if (rendered === 0) {
    // Nothing in the array is displayable (identifier-only items) — the
    // count is the truthful statement, and it matches the summary's digest.
    return [{ kind: "count", count: value.length }];
  }
  if (value.length > rendered) {
    lines.push({ kind: "more", count: value.length - rendered });
  }
  return lines;
}

function objectLines(
  value: { [key: string]: JsonValue },
  depth: number,
): DecisionValueLine[] {
  const entries = Object.entries(value);
  if (entries.length === 0) return [{ kind: "empty" }];

  const lines: DecisionValueLine[] = [];
  const shown = entries.slice(0, MAX_FIELDS);
  for (const [key, fieldValue] of shown) {
    const label = PLAIN_FIELD_NAME.test(key) ? key : undefined;
    const sub = valueLines(fieldValue, depth + 1);
    if (sub.length === 1) {
      const only = sub[0]!;
      if (only.kind === "text") {
        lines.push({ kind: "text", text: label !== undefined ? `${label}: ${only.text}` : only.text });
      } else if (only.kind === "empty") {
        lines.push(label !== undefined ? { kind: "empty", label } : { kind: "empty" });
      } else if (only.kind === "count") {
        lines.push(
          label !== undefined
            ? { kind: "count", count: only.count, label }
            : { kind: "count", count: only.count },
        );
      } else {
        lines.push(only);
      }
    } else {
      // A multi-line field (a list of items): the label heads it when the
      // field has one, then the field's own lines follow.
      if (label !== undefined) lines.push({ kind: "text", text: `${label}:` });
      lines.push(...sub);
    }
  }
  if (entries.length > shown.length) {
    lines.push({ kind: "more", count: entries.length - shown.length });
  }
  return lines;
}

function valueLines(value: JsonValue, depth: number): DecisionValueLine[] {
  if (value === null) return [{ kind: "empty" }];
  if (typeof value === "string") {
    return value === "" ? [{ kind: "empty" }] : [{ kind: "text", text: truncateText(value) }];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [{ kind: "text", text: scalarText(value) }];
  }
  if (depth > MAX_DEPTH) {
    // Past the outline's depth the shape is stated, not spelled out.
    return [{ kind: "count", count: Array.isArray(value) ? value.length : Object.keys(value).length }];
  }
  return Array.isArray(value) ? arrayLines(value) : objectLines(value, depth);
}

/**
 * The outline of one recorded decision value, bounded to {@link MAX_LINES}
 * lines (a final `more` line states what the bound omitted).
 */
export function decisionValueLines(value: JsonValue): readonly DecisionValueLine[] {
  const lines = valueLines(value, 0);
  if (lines.length > MAX_LINES) {
    return [
      ...lines.slice(0, MAX_LINES - 1),
      { kind: "more", count: lines.length - (MAX_LINES - 1) },
    ];
  }
  return lines;
}
