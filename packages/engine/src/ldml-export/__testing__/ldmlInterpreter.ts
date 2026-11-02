// Test-only LDML keyboard interpreter (harness H5; research R24).
//
// Limited to what the exporter emits: the hardware key map by layer, `simple` and
// `backspace` transform groups, markers, `${str}` / `$[set]` variables, `$[1:set]`
// mapping, NFD matching and NFC output, plus a touch tap. It is NOT a conformant
// LDML implementation, and no product code may import it.
//
// Internal text model: the context is an NFD string in which each marker id is one
// private-use character (U+E000 upward), so regexes see a marker as one atom.

// ---------------------------------------------------------------------------
// Public types

export interface LdmlKeystroke {
  /** A main-block key position (`K_A`, `K_OE2`, ...) or `K_BKSP`. */
  readonly vkey: string;
  /** Modifier components: `shift`, `alt`, `altL`, `altR`, `ctrl`, `ctrlL`, `ctrlR`, or none. */
  readonly modifiers: readonly string[] | string;
  readonly caps: boolean;
}

export interface LdmlInterpreter {
  /**
   * Type a sequence of keystrokes after `initialContext`. Returns the whole resulting
   * text (initial context included), NFC-normalised, with markers removed.
   */
  type(keys: readonly LdmlKeystroke[], initialContext?: string): string;
  /**
   * Tap one touch key. Selects the touch form by `minDeviceWidth` (the widest form that
   * fits `formWidth`), applies the key's output, then runs the transforms. Returns the
   * whole resulting text, as `type` does.
   */
  tapTouch(formWidth: number, layerId: string, keyId: string, context?: string): string;
}

// ---------------------------------------------------------------------------
// Minimal XML parser (elements, attributes, comments, entities)

interface XmlNode {
  readonly name: string;
  readonly attrs: Record<string, string>;
  readonly children: XmlNode[];
}

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const cp = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return String.fromCodePoint(cp);
  });
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) break;
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end < 0) throw new Error("ldmlInterpreter: unterminated comment");
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt);
      if (end < 0) throw new Error("ldmlInterpreter: unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      const end = xml.indexOf(">", lt);
      if (end < 0) throw new Error("ldmlInterpreter: unterminated declaration");
      i = end + 1;
      continue;
    }
    // Find the tag end, skipping '>' inside quoted attribute values.
    let j = lt + 1;
    let quote = "";
    while (j < xml.length) {
      const c = xml.charAt(j);
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      j++;
    }
    if (j >= xml.length) throw new Error("ldmlInterpreter: unterminated tag");
    const body = xml.slice(lt + 1, j);
    i = j + 1;
    if (body.startsWith("/")) {
      if (stack.length < 2) throw new Error("ldmlInterpreter: unbalanced closing tag");
      stack.pop();
      continue;
    }
    const selfClose = body.endsWith("/");
    const inner = selfClose ? body.slice(0, -1) : body;
    const nameMatch = /^\s*([^\s/>]+)/.exec(inner);
    if (!nameMatch || nameMatch[1] === undefined) throw new Error("ldmlInterpreter: bad tag");
    const attrs: Record<string, string> = {};
    const attrRe = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    const rest = inner.slice(nameMatch[0].length);
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(rest)) !== null) {
      const key = m[1];
      if (key !== undefined) attrs[key] = decodeEntities(m[2] ?? m[3] ?? "");
    }
    const node: XmlNode = { name: nameMatch[1], attrs, children: [] };
    const parent = stack[stack.length - 1];
    if (parent === undefined) throw new Error("ldmlInterpreter: empty stack");
    parent.children.push(node);
    if (!selfClose) stack.push(node);
  }
  if (stack.length !== 1) throw new Error("ldmlInterpreter: unclosed element");
  const top = root.children[0];
  if (top === undefined) throw new Error("ldmlInterpreter: no root element");
  return top;
}

function kids(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter((c) => c.name === name);
}

// ---------------------------------------------------------------------------
// Hardware position grids (TR35 predefined forms `us` and `iso`)

const ROW_NUMBERS = [
  "K_BKQUOTE", "K_1", "K_2", "K_3", "K_4", "K_5", "K_6", "K_7", "K_8", "K_9", "K_0",
  "K_HYPHEN", "K_EQUAL",
];
const HARDWARE_GRIDS: Record<string, readonly (readonly string[])[]> = {
  us: [
    ROW_NUMBERS,
    ["K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_U", "K_I", "K_O", "K_P", "K_LBRKT", "K_RBRKT", "K_BKSLASH"],
    ["K_A", "K_S", "K_D", "K_F", "K_G", "K_H", "K_J", "K_K", "K_L", "K_COLON", "K_QUOTE"],
    ["K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M", "K_COMMA", "K_PERIOD", "K_SLASH"],
    ["K_SPACE"],
  ],
  iso: [
    ROW_NUMBERS,
    ["K_Q", "K_W", "K_E", "K_R", "K_T", "K_Y", "K_U", "K_I", "K_O", "K_P", "K_LBRKT", "K_RBRKT"],
    ["K_A", "K_S", "K_D", "K_F", "K_G", "K_H", "K_J", "K_K", "K_L", "K_COLON", "K_QUOTE", "K_BKSLASH"],
    ["K_OE2", "K_Z", "K_X", "K_C", "K_V", "K_B", "K_N", "K_M", "K_COMMA", "K_PERIOD", "K_SLASH"],
    ["K_SPACE"],
  ],
};

/** Normalise a vkey spelling (`K_oE2` and `K_OE2` are the same position). */
function normVKey(v: string): string {
  return v.toUpperCase();
}

// A few key ids that the exporter may leave implied (not declared in <keys>).
const IMPLIED_NAMES: Record<string, string> = {
  space: " ",
  hyphen: "-",
  comma: ",",
  period: ".",
  slash: "/",
  backslash: "\\",
  colon: ":",
  "semi-colon": ";",
  apos: "'",
  "double-quote": '"',
  "open-paren": "(",
  "close-paren": ")",
  "open-square": "[",
  "close-square": "]",
  "open-angle": "<",
  "close-angle": ">",
  equal: "=",
  plus: "+",
  underscore: "_",
  asterisk: "*",
  amp: "&",
  at: "@",
  hash: "#",
  percent: "%",
  caret: "^",
  dollar: "$",
  bang: "!",
  question: "?",
  pipe: "|",
  tilde: "~",
};

// ---------------------------------------------------------------------------
// Interpreter

const MARKER_BASE = 0xe000;
const MARKER_LAST = 0xf8ff;
const MARKER_CLASS = "\\u{E000}-\\u{F8FF}";

interface Transform {
  readonly re: RegExp;
  readonly to: string;
  readonly captureSets: ReadonlyMap<number, string>;
}

interface KeyDef {
  readonly output: string | undefined; // text (markers encoded); undefined = no output
  readonly layerId: string | undefined;
}

interface HwLayer {
  readonly combos: readonly (readonly string[])[]; // alternatives; each a component list
  readonly byVKey: ReadonlyMap<string, string>; // vkey -> key id
}

interface TouchForm {
  readonly minDeviceWidth: number | undefined;
  readonly layers: ReadonlyMap<string, readonly string[]>; // layer id -> key ids
}

export function loadLdml(xml: string): LdmlInterpreter {
  const root = parseXml(xml);
  if (root.name !== "keyboard3") {
    throw new Error(`ldmlInterpreter: root element is <${root.name}>, expected <keyboard3>`);
  }

  // Markers
  const markerChars = new Map<string, string>();
  const markerChar = (id: string): string => {
    let c = markerChars.get(id);
    if (c === undefined) {
      const cp = MARKER_BASE + markerChars.size;
      if (cp > MARKER_LAST) throw new Error("ldmlInterpreter: too many markers");
      c = String.fromCharCode(cp);
      markerChars.set(id, c);
    }
    return c;
  };
  const isMarker = (ch: string): boolean => {
    const cp = ch.codePointAt(0) ?? 0;
    return cp >= MARKER_BASE && cp <= MARKER_LAST;
  };

  // Variables
  const strings = new Map<string, string>();
  const setValues = new Map<string, string>();
  for (const vars of kids(root, "variables")) {
    for (const s of kids(vars, "string")) strings.set(s.attrs["id"] ?? "", s.attrs["value"] ?? "");
    for (const s of kids(vars, "set")) setValues.set(s.attrs["id"] ?? "", s.attrs["value"] ?? "");
  }

  /** Resolve escapes and `${}` in literal text into a marker-encoded string (not normalised). */
  const literal = (s: string, depth = 0): string => {
    if (depth > 20) throw new Error("ldmlInterpreter: variable recursion");
    let out = "";
    let i = 0;
    while (i < s.length) {
      const rest = s.slice(i);
      let m: RegExpExecArray | null;
      if ((m = /^\\u\{([0-9A-Fa-f\s]+)\}/.exec(rest))) {
        for (const h of (m[1] ?? "").trim().split(/\s+/)) out += String.fromCodePoint(parseInt(h, 16));
        i += m[0].length;
      } else if ((m = /^\\m\{([^}]+)\}/.exec(rest))) {
        out += markerChar(m[1] ?? "");
        i += m[0].length;
      } else if ((m = /^\$\{([^}]+)\}/.exec(rest))) {
        const v = strings.get(m[1] ?? "");
        if (v === undefined) throw new Error(`ldmlInterpreter: unknown string variable ${m[1]}`);
        out += literal(v, depth + 1);
        i += m[0].length;
      } else if (s.charAt(i) === "\\" && i + 1 < s.length) {
        out += s.charAt(i + 1);
        i += 2;
      } else {
        const cp = s.codePointAt(i) ?? 0;
        const ch = String.fromCodePoint(cp);
        out += ch;
        i += ch.length;
      }
    }
    return out;
  };

  const setCache = new Map<string, string[]>();
  const setItems = (id: string, depth = 0): string[] => {
    const cached = setCache.get(id);
    if (cached) return cached;
    if (depth > 20) throw new Error("ldmlInterpreter: set recursion");
    const raw = setValues.get(id);
    if (raw === undefined) throw new Error(`ldmlInterpreter: unknown set ${id}`);
    const items: string[] = [];
    for (const tok of raw.split(/\s+/).filter((t) => t.length > 0)) {
      const ref = /^\$\[([^\]]+)\]$/.exec(tok);
      if (ref) items.push(...setItems(ref[1] ?? "", depth + 1));
      else items.push(literal(tok).normalize("NFD"));
    }
    setCache.set(id, items);
    return items;
  };

  const reLit = (text: string): string => {
    const cps = [...text.normalize("NFD")];
    const body = cps.map((c) => `\\u{${(c.codePointAt(0) ?? 0).toString(16)}}`).join("");
    return cps.length > 1 ? `(?:${body})` : body;
  };

  const compileFrom = (from: string): { re: RegExp; captureSets: Map<number, string> } => {
    const captureSets = new Map<number, string>();
    let src = "";
    let groups = 0;
    let i = 0;
    while (i < from.length) {
      const rest = from.slice(i);
      const c = from.charAt(i);
      let m: RegExpExecArray | null;
      if ((m = /^\\u\{[0-9A-Fa-f\s]+\}|^\\m\{[^}]+\}|^\$\{[^}]+\}/.exec(rest))) {
        if (m[0].startsWith("\\m{.}")) src += `[${MARKER_CLASS}]`;
        else src += reLit(literal(m[0]));
        i += m[0].length;
      } else if ((m = /^\$\[([^\]]+)\]/.exec(rest))) {
        const items = setItems(m[1] ?? "");
        // Longest alternatives first so a longer item wins over its own prefix.
        const alts = [...items].sort((a, b) => b.length - a.length).map(reLit);
        src += `(?:${alts.join("|")})`;
        i += m[0].length;
      } else if (c === "[") {
        let j = i + 1;
        let cls = "[";
        if (from.charAt(j) === "^") {
          cls += "^" + MARKER_CLASS;
          j++;
        }
        while (j < from.length && from.charAt(j) !== "]") {
          const r = from.slice(j);
          const e = /^\\u\{[0-9A-Fa-f]+\}/.exec(r);
          if (e) {
            cls += e[0];
            j += e[0].length;
          } else if (from.charAt(j) === "\\" && j + 1 < from.length) {
            const cp = from.codePointAt(j + 1) ?? 0;
            cls += `\\u{${cp.toString(16)}}`;
            j += 1 + String.fromCodePoint(cp).length;
          } else if (from.charAt(j) === "-") {
            cls += "-";
            j++;
          } else {
            const cp = from.codePointAt(j) ?? 0;
            cls += `\\u{${cp.toString(16)}}`;
            j += String.fromCodePoint(cp).length;
          }
        }
        if (j >= from.length) throw new Error(`ldmlInterpreter: unterminated class in "${from}"`);
        src += cls + "]";
        i = j + 1;
      } else if (c === "(") {
        groups++;
        const setRef = /^\(\$\[([^\]]+)\]\)/.exec(rest);
        if (setRef) captureSets.set(groups, setRef[1] ?? "");
        src += "(";
        i++;
      } else if (c === ")" || c === "|" || c === "*" || c === "+" || c === "?") {
        src += c;
        i++;
      } else if (c === "\\" && i + 1 < from.length) {
        const cp = from.codePointAt(i + 1) ?? 0;
        src += reLit(String.fromCodePoint(cp));
        i += 1 + String.fromCodePoint(cp).length;
      } else {
        const cp = from.codePointAt(i) ?? 0;
        const ch = String.fromCodePoint(cp);
        src += reLit(ch);
        i += ch.length;
      }
    }
    return { re: new RegExp(`(?:${src})$`, "u"), captureSets };
  };

  const compileTransforms = (container: XmlNode): Transform[][] => {
    const groups: Transform[][] = [];
    for (const g of kids(container, "transformGroup")) {
      const list: Transform[] = [];
      for (const t of kids(g, "transform")) {
        const from = t.attrs["from"];
        if (from === undefined) continue;
        const { re, captureSets } = compileFrom(from);
        list.push({ re, to: t.attrs["to"] ?? "", captureSets });
      }
      groups.push(list);
    }
    return groups;
  };

  const simpleGroups: Transform[][] = [];
  const backspaceGroups: Transform[][] = [];
  for (const tr of kids(root, "transforms")) {
    const type = tr.attrs["type"];
    if (type === "simple") simpleGroups.push(...compileTransforms(tr));
    else if (type === "backspace") backspaceGroups.push(...compileTransforms(tr));
  }

  const applyTo = (t: Transform, mm: RegExpExecArray): string => {
    const to = t.to;
    let out = "";
    let i = 0;
    while (i < to.length) {
      const rest = to.slice(i);
      let m: RegExpExecArray | null;
      if ((m = /^\$\[(\d):([^\]]+)\]/.exec(rest))) {
        const n = Number(m[1]);
        const fromSet = t.captureSets.get(n);
        if (fromSet === undefined) {
          throw new Error(`ldmlInterpreter: capture ${n} is not a set capture in a $[n:set] mapping`);
        }
        const captured = (mm[n] ?? "").normalize("NFD");
        const idx = setItems(fromSet).indexOf(captured);
        out += idx < 0 ? "" : (setItems(m[2] ?? "")[idx] ?? "");
        i += m[0].length;
      } else if ((m = /^\$(\d)/.exec(rest))) {
        out += mm[Number(m[1])] ?? "";
        i += 2;
      } else if (rest.startsWith("$$")) {
        out += "$";
        i += 2;
      } else if (rest.startsWith("\\$")) {
        out += "$";
        i += 2;
      } else if (rest.startsWith("\\\\")) {
        out += "\\";
        i += 2;
      } else if ((m = /^\\u\{[0-9A-Fa-f\s]+\}|^\\m\{[^}]+\}|^\$\{[^}]+\}/.exec(rest))) {
        out += literal(m[0]);
        i += m[0].length;
      } else {
        const ch = String.fromCodePoint(to.codePointAt(i) ?? 0);
        out += ch;
        i += ch.length;
      }
    }
    return out.normalize("NFD");
  };

  /** Each group applies at most once: the first transform (document order) that matches. */
  const runGroups = (groups: readonly Transform[][], ctx: string): { text: string; fired: boolean } => {
    let text = ctx;
    let fired = false;
    for (const group of groups) {
      for (const t of group) {
        const mm = t.re.exec(text);
        if (mm) {
          text = text.slice(0, mm.index) + applyTo(t, mm);
          fired = true;
          break;
        }
      }
    }
    return { text, fired };
  };

  // Keys
  const keyDefs = new Map<string, KeyDef>();
  for (const keys of kids(root, "keys")) {
    for (const k of kids(keys, "key")) {
      const id = k.attrs["id"];
      if (id === undefined) continue;
      const out = k.attrs["output"];
      keyDefs.set(id, {
        output: k.attrs["gap"] === "true" || out === undefined ? undefined : literal(out).normalize("NFD"),
        layerId: k.attrs["layerId"],
      });
    }
  }
  const keyDef = (id: string): KeyDef => {
    const d = keyDefs.get(id);
    if (d) return d;
    if (id === "gap") return { output: undefined, layerId: undefined }; // row placeholder
    const implied = IMPLIED_NAMES[id] ?? ([...id].length === 1 ? id : undefined);
    if (implied === undefined) throw new Error(`ldmlInterpreter: key id "${id}" is not defined`);
    return { output: implied.normalize("NFD"), layerId: undefined };
  };

  // Layers
  const hwLayers: HwLayer[] = [];
  const touchForms: TouchForm[] = [];
  for (const layers of kids(root, "layers")) {
    const formId = layers.attrs["formId"] ?? "";
    if (formId === "touch") {
      const map = new Map<string, string[]>();
      for (const layer of kids(layers, "layer")) {
        const ids: string[] = [];
        for (const row of kids(layer, "row")) ids.push(...(row.attrs["keys"] ?? "").split(" ").filter((x) => x));
        map.set(layer.attrs["id"] ?? "", ids);
      }
      const min = layers.attrs["minDeviceWidth"];
      touchForms.push({ minDeviceWidth: min === undefined ? undefined : Number(min), layers: map });
      continue;
    }
    const grid = HARDWARE_GRIDS[formId];
    if (!grid) throw new Error(`ldmlInterpreter: unsupported hardware form "${formId}"`);
    for (const layer of kids(layers, "layer")) {
      const byVKey = new Map<string, string>();
      kids(layer, "row").forEach((row, r) => {
        const gridRow = grid[r];
        if (!gridRow) throw new Error(`ldmlInterpreter: row ${r} is beyond the ${formId} grid`);
        (row.attrs["keys"] ?? "")
          .split(" ")
          .filter((x) => x)
          .forEach((id, c) => {
            const vk = gridRow[c];
            if (vk === undefined) throw new Error(`ldmlInterpreter: row ${r} key ${c} is beyond the ${formId} grid`);
            byVKey.set(vk, id);
          });
      });
      const combos = (layer.attrs["modifiers"] ?? "none")
        .split(",")
        .map((c) => c.trim().split(/\s+/).filter((x) => x && x !== "none"));
      hwLayers.push({ combos, byVKey });
    }
  }

  const satisfies = (layerComp: string, pressed: string): boolean =>
    layerComp === pressed ||
    (layerComp === "alt" && (pressed === "altL" || pressed === "altR")) ||
    (layerComp === "ctrl" && (pressed === "ctrlL" || pressed === "ctrlR"));

  const comboMatches = (combo: readonly string[], pressed: readonly string[]): boolean =>
    combo.length === pressed.length &&
    pressed.every((p) => combo.some((l) => satisfies(l, p))) &&
    combo.every((l) => pressed.some((p) => satisfies(l, p)));

  const findHwKey = (k: LdmlKeystroke): string | undefined => {
    const mods = typeof k.modifiers === "string" ? k.modifiers.split(/\s+/) : [...k.modifiers];
    const pressed = mods.filter((m) => m && m !== "none");
    if (k.caps) pressed.push("caps");
    const vk = normVKey(k.vkey);
    for (const layer of hwLayers) {
      if (layer.combos.some((combo) => comboMatches(combo, pressed))) return layer.byVKey.get(vk);
    }
    return undefined;
  };

  const strip = (ctx: string): string => [...ctx].filter((ch) => !isMarker(ch)).join("").normalize("NFC");

  const afterOutput = (ctx: string): string => runGroups(simpleGroups, ctx).text;

  const backspace = (ctx: string): string => {
    const r = runGroups(backspaceGroups, ctx);
    if (r.fired) return afterOutput(r.text);
    // Default: delete one code point plus the markers adjacent to it.
    const cps = [...ctx];
    while (cps.length > 0 && isMarker(cps[cps.length - 1] ?? "")) cps.pop();
    if (cps.length > 0) cps.pop();
    while (cps.length > 0 && isMarker(cps[cps.length - 1] ?? "")) cps.pop();
    return cps.join("");
  };

  return {
    type(keys, initialContext = "") {
      let ctx = initialContext.normalize("NFD");
      for (const k of keys) {
        if (normVKey(k.vkey) === "K_BKSP") {
          ctx = backspace(ctx);
          continue;
        }
        const id = findHwKey(k);
        if (id === undefined) continue; // unmatched keystrokes produce nothing
        const def = keyDef(id);
        if (def.output === undefined) continue;
        ctx = afterOutput((ctx + def.output).normalize("NFD"));
      }
      return strip(ctx);
    },

    tapTouch(formWidth, layerId, keyId, context = "") {
      if (touchForms.length === 0) throw new Error("ldmlInterpreter: document has no touch form");
      const sorted = [...touchForms].sort((a, b) => (a.minDeviceWidth ?? 0) - (b.minDeviceWidth ?? 0));
      let form = sorted[0] as TouchForm;
      for (const f of sorted) if ((f.minDeviceWidth ?? 0) <= formWidth) form = f;
      const ids = form.layers.get(layerId);
      if (!ids) throw new Error(`ldmlInterpreter: touch layer "${layerId}" not found`);
      if (!ids.includes(keyId)) throw new Error(`ldmlInterpreter: key "${keyId}" is not in touch layer "${layerId}"`);
      const def = keyDef(keyId);
      let ctx = context.normalize("NFD");
      if (def.output !== undefined) ctx = afterOutput((ctx + def.output).normalize("NFD"));
      return strip(ctx);
    },
  };
}
