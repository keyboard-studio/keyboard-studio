// Serialises an LdmlDocument to keyboard3 XML (spec 108). Element order follows
// the DTD content model, attribute order is fixed per element, empty containers
// are omitted, and the output uses `\n`, two-space indent and a trailing newline.

import type { LdmlDocument, LdmlSpecial } from "./model.js";

type Attr = readonly [string, string | number | boolean | undefined];

const INDENT = "  ";

/** Escape attribute text: `& < > "` and every C0 control as a numeric reference. */
export function escapeAttr(value: string): string {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0) as number;
    if (ch === "&") out += "&amp;";
    else if (ch === "<") out += "&lt;";
    else if (ch === ">") out += "&gt;";
    else if (ch === '"') out += "&quot;";
    else if (cp < 0x20) out += `&#x${cp.toString(16).toUpperCase()};`;
    else out += ch;
  }
  return out;
}

/** Make text safe inside a comment: no `--`, no trailing `-`, `\n` line ends. */
export function sanitizeComment(text: string): string {
  let t = text.replace(/\r\n?/g, "\n");
  while (t.includes("--")) t = t.replace(/--/g, "- -");
  if (t.endsWith("-")) t += " ";
  return t;
}

function attrs(list: readonly Attr[]): string {
  let out = "";
  for (const [name, value] of list) {
    if (value === undefined) continue;
    const text = typeof value === "boolean" ? (value ? "true" : "false") : escapeAttr(String(value));
    out += ` ${name}="${text}"`;
  }
  return out;
}

class Out {
  private lines: string[] = [];

  line(depth: number, text: string): void {
    this.lines.push(INDENT.repeat(depth) + text);
  }

  comment(depth: number, text: string | undefined): void {
    if (text === undefined || text === "") return;
    const clean = sanitizeComment(text);
    if (!clean.includes("\n")) {
      this.line(depth, `<!-- ${clean} -->`);
      return;
    }
    this.line(depth, "<!--");
    for (const l of clean.split("\n")) this.line(depth + 1, l);
    this.line(depth, "-->");
  }

  /** A childless element, or an open/close pair around `body`'s lines (omitted if empty). */
  element(depth: number, name: string, a: readonly Attr[], body?: () => void): void {
    if (body === undefined) {
      this.line(depth, `<${name}${attrs(a)}/>`);
      return;
    }
    const mark = this.lines.length;
    this.line(depth, `<${name}${attrs(a)}>`);
    const inner = this.lines.length;
    body();
    if (this.lines.length === inner) {
      this.lines.length = mark;
      return;
    }
    this.line(depth, `</${name}>`);
  }

  toString(): string {
    return this.lines.join("\n") + "\n";
  }
}

function writeSpecial(o: Out, depth: number, special: LdmlSpecial): void {
  const ns: Attr[] = Object.entries(special.namespaces).map(
    ([prefix, uri]) => [`xmlns:${prefix}`, uri] as const,
  );
  o.element(depth, "special", ns, () => {
    for (const el of special.elements) o.element(depth + 1, el.name, el.attributes);
  });
}

export function writeKeyboard3(doc: LdmlDocument): string {
  const o = new Out();
  o.line(0, '<?xml version="1.0" encoding="UTF-8"?>');
  o.comment(0, doc.comment);

  const d = 1;
  o.element(
    0,
    "keyboard3",
    [
      ["xmlns", doc.xmlns],
      ["locale", doc.locale],
      ["conformsTo", doc.conformsTo],
    ],
    () => {
      o.element(d, "locales", [], () => {
        for (const l of doc.locales ?? []) o.element(d + 1, "locale", [["id", l.id]]);
      });
      if (doc.version !== undefined) o.element(d, "version", [["number", doc.version.number]]);
      o.element(d, "info", [
        ["name", doc.info.name],
        ["author", doc.info.author],
        ["layout", doc.info.layout],
        ["indicator", doc.info.indicator],
        ["attribution", doc.info.attribution],
      ]);
      if (doc.settings !== undefined) {
        o.element(d, "settings", [["normalization", doc.settings.normalization]]);
      }
      const displays = doc.displays;
      if (displays !== undefined) {
        o.element(d, "displays", [], () => {
          for (const x of displays.display ?? []) {
            o.element(d + 1, "display", [
              ["output", x.output],
              ["display", x.display],
              ["keyId", x.keyId],
            ]);
          }
          if (displays.displayOptions !== undefined) {
            o.element(d + 1, "displayOptions", [
              ["baseCharacter", displays.displayOptions.baseCharacter],
            ]);
          }
        });
      }
      o.element(d, "keys", [], () => {
        for (const k of doc.keys ?? []) {
          o.element(d + 1, "key", [
            ["id", k.id],
            ["flickId", k.flickId],
            ["output", k.output],
            ["gap", k.gap],
            ["layerId", k.layerId],
            ["longPressKeyIds", k.longPressKeyIds],
            ["longPressDefaultKeyId", k.longPressDefaultKeyId],
            ["multiTapKeyIds", k.multiTapKeyIds],
            ["width", k.width],
          ]);
        }
      });
      o.element(d, "flicks", [], () => {
        for (const f of doc.flicks ?? []) {
          o.element(d + 1, "flick", [["id", f.id]], () => {
            for (const s of f.flickSegment ?? []) {
              o.element(d + 2, "flickSegment", [
                ["directions", s.directions],
                ["keyId", s.keyId],
              ]);
            }
          });
        }
      });
      for (const ls of doc.layers ?? []) {
        o.element(
          d,
          "layers",
          [
            ["formId", ls.formId],
            ["minDeviceWidth", ls.minDeviceWidth],
          ],
          () => {
            for (const layer of ls.layer ?? []) {
              o.element(
                d + 1,
                "layer",
                [
                  ["id", layer.id],
                  ["modifiers", layer.modifiers],
                ],
                () => {
                  for (const row of layer.row ?? []) {
                    o.element(d + 2, "row", [["keys", row.keys]]);
                  }
                },
              );
            }
          },
        );
      }
      const v = doc.variables;
      if (v !== undefined) {
        o.element(d, "variables", [], () => {
          for (const x of v.string ?? []) o.element(d + 1, "string", [["id", x.id], ["value", x.value]]);
          for (const x of v.set ?? []) o.element(d + 1, "set", [["id", x.id], ["value", x.value]]);
          for (const x of v.uset ?? []) o.element(d + 1, "uset", [["id", x.id], ["value", x.value]]);
        });
      }
      for (const t of doc.transforms ?? []) {
        o.element(d, "transforms", [["type", t.type]], () => {
          for (const g of t.transformGroup ?? []) {
            if ((g.transform?.length ?? 0) === 0 && (g.reorder?.length ?? 0) === 0) continue;
            o.comment(d + 1, g.comment);
            o.element(d + 1, "transformGroup", [], () => {
              for (const x of g.reorder ?? []) {
                o.element(d + 2, "reorder", [
                  ["from", x.from],
                  ["before", x.before],
                  ["order", x.order],
                  ["tertiary", x.tertiary],
                  ["tertiaryBase", x.tertiaryBase],
                  ["preBase", x.preBase],
                ]);
              }
              for (const x of g.transform ?? []) {
                o.comment(d + 2, x.comment);
                o.element(d + 2, "transform", [["from", x.from], ["to", x.to]]);
              }
            });
          }
        });
      }
      if (doc.special !== undefined) writeSpecial(o, d, doc.special);
    },
  );
  return o.toString();
}
