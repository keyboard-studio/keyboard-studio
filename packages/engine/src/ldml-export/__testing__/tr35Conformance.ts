// Test-only harness H4: checks the TR35 rules that neither the CLDR XSD nor kmc-ldml enforce
// (research R23). Never import this from product code.

export interface Violation {
  rule: string;
  message: string;
  line: number;
}

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  line: number;
}

const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
const ATTR = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** A small element/attribute parser, enough for LDML keyboard documents (no DTD, no entities). */
function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#document", attrs: {}, children: [], line: 1 };
  const stack: XmlNode[] = [root];
  let lineAt = 1;
  let cursor = 0;
  for (const m of xml.matchAll(TOKEN)) {
    const index = m.index ?? 0;
    for (let i = cursor; i < index; i++) if (xml.charCodeAt(i) === 10) lineAt++;
    cursor = index;
    const name = m[2];
    if (name === undefined) continue; // comment, PI or CDATA
    const top = stack[stack.length - 1] as XmlNode;
    if (m[1] === "/") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(ATTR)) attrs[a[1] as string] = a[2] ?? a[3] ?? "";
    const node: XmlNode = { name, attrs, children: [], line: lineAt };
    top.children.push(node);
    if (m[4] !== "/") stack.push(node);
  }
  return root;
}

function walk(node: XmlNode, visit: (n: XmlNode) => void): void {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

function all(root: XmlNode, name: string): XmlNode[] {
  const out: XmlNode[] = [];
  walk(root, (n) => {
    if (n.name === name) out.push(n);
  });
  return out;
}

function idList(value: string | undefined): string[] {
  return value === undefined ? [] : value.split(/\s+/).filter((s) => s.length > 0);
}

const GAP_FORBIDDEN = [
  "output",
  "layerId",
  "flickId",
  "longPressKeyIds",
  "longPressDefaultKeyId",
  "multiTapKeyIds",
] as const;
const GESTURE_ATTRS = ["flickId", "longPressKeyIds", "longPressDefaultKeyId", "multiTapKeyIds"] as const;

export function tr35Conformance(xml: string): Violation[] {
  const doc = parseXml(xml);
  const out: Violation[] = [];
  const add = (rule: string, node: XmlNode, message: string): void => {
    out.push({ rule, message, line: node.line });
  };

  const keyNodes = all(doc, "key").filter((k) => k.attrs["id"] !== undefined);
  const keysById = new Map<string, XmlNode>();
  for (const k of keyNodes) keysById.set(k.attrs["id"] as string, k);
  // Imported key sets (CLDR and local) define ids this checker cannot see.
  const hasKeyImports = all(doc, "import").length > 0;
  const keyKnown = (id: string): boolean => keysById.has(id) || hasKeyImports;

  const layersEls = all(doc, "layers");
  const layerIds = new Set<string>();
  for (const l of all(doc, "layer")) {
    const id = l.attrs["id"];
    if (id !== undefined) layerIds.add(id);
  }
  const flickIds = new Set<string>();
  for (const f of all(doc, "flick")) {
    const id = f.attrs["id"];
    if (id !== undefined) flickIds.add(id);
  }

  // Gap keys.
  const gapIds = new Set<string>();
  for (const k of keyNodes) {
    if (k.attrs["gap"] !== "true") continue;
    gapIds.add(k.attrs["id"] as string);
    for (const attr of GAP_FORBIDDEN) {
      if (k.attrs[attr] !== undefined) {
        add("gap-key", k, `gap key "${k.attrs["id"]}" must not have ${attr}`);
      }
    }
  }
  for (const d of all(doc, "display")) {
    const keyId = d.attrs["keyId"];
    if (keyId !== undefined && gapIds.has(keyId)) {
      add("gap-key-display", d, `a display refers to gap key "${keyId}"`);
    }
  }

  // Layers.
  const seenWidths = new Map<string, Set<number>>();
  for (const layers of layersEls) {
    const formId = layers.attrs["formId"] ?? "";
    const touch = formId === "touch";
    const forms = layers.children.filter((c) => c.name === "layer");
    if (touch) {
      if (!forms.some((l) => l.attrs["id"] === "base")) {
        add("touch-base-layer", layers, 'touch form has no layer with id="base"');
      }
      const raw = layers.attrs["minDeviceWidth"];
      if (raw !== undefined) {
        const n = Number(raw);
        if (!/^\d+$/.test(raw) || n < 1 || n > 999) {
          add("min-device-width-range", layers, `minDeviceWidth "${raw}" is not a whole number in 1..999`);
        } else {
          const seen = seenWidths.get(formId) ?? new Set<number>();
          if (seen.has(n)) {
            add("min-device-width-distinct", layers, `minDeviceWidth ${n} repeats within form "${formId}"`);
          }
          seen.add(n);
          seenWidths.set(formId, seen);
        }
      }
    }
    for (const layer of forms) {
      if (touch) {
        if (layer.attrs["id"] === undefined) add("touch-layer-id", layer, "touch layer has no id");
        if (layer.attrs["modifiers"] !== undefined) {
          add("touch-layer-modifiers", layer, "touch layer must not have modifiers");
        }
      } else {
        if (layer.attrs["modifiers"] === undefined) {
          add("hardware-layer-modifiers", layer, "hardware layer has no modifiers");
        }
        if (layer.attrs["id"] !== undefined) {
          add("hardware-layer-id", layer, "hardware layer must not have an id");
        }
      }
      for (const row of layer.children.filter((c) => c.name === "row")) {
        const keys = row.attrs["keys"];
        if (keys !== undefined && !/^(\S+( \S+)*)?$/.test(keys)) {
          add("row-spacing", row, "row keys must be joined by single spaces with no edge whitespace");
        }
      }
    }
  }

  // Key references and gestures.
  const gestureTargets = new Set<string>();
  for (const k of keyNodes) {
    const width = k.attrs["width"];
    if (width !== undefined) {
      const w = Number(width);
      if (!Number.isFinite(w) || w < 0.01 || w > 100) {
        add("width-range", k, `width "${width}" is outside 0.01..100`);
      }
    }
    const layerId = k.attrs["layerId"];
    if (layerId !== undefined && !layerIds.has(layerId)) {
      add("layer-id-unresolved", k, `layerId "${layerId}" does not name a layer`);
    }
    const flickId = k.attrs["flickId"];
    if (flickId !== undefined && !flickIds.has(flickId)) {
      add("flick-id-unresolved", k, `flickId "${flickId}" does not name a flick`);
    }
    const targets = [
      ...idList(k.attrs["longPressKeyIds"]),
      ...idList(k.attrs["multiTapKeyIds"]),
      ...idList(k.attrs["longPressDefaultKeyId"]),
    ];
    for (const t of targets) {
      gestureTargets.add(t);
      if (!keyKnown(t)) add("gesture-key-unresolved", k, `gesture key id "${t}" does not resolve`);
    }
  }
  for (const seg of all(doc, "flickSegment")) {
    const t = seg.attrs["keyId"];
    if (t === undefined) continue;
    gestureTargets.add(t);
    if (!keyKnown(t)) add("gesture-key-unresolved", seg, `flick key id "${t}" does not resolve`);
  }
  for (const t of gestureTargets) {
    const key = keysById.get(t);
    if (key === undefined) continue;
    for (const attr of GESTURE_ATTRS) {
      if (key.attrs[attr] !== undefined) {
        add("gesture-target-gesture", key, `gesture target "${t}" must not have ${attr}`);
      }
    }
  }
  return out;
}
