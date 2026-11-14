// Spec 117 T097: the code-edit set. Each entry names a corpus keyboard and the Code-tab edits an
// author could make to it, as text-to-text functions over the keyboard's canonical emitted text.
// A pattern that is absent throws, so a corpus drift fails loudly instead of testing nothing.

export type CodeEditKind =
  | "change-rule"
  | "add-rule"
  | "delete-rule"
  | "edit-store"
  | "add-store"
  | "edit-header"
  | "edit-opaque";

export interface CodeEditCase {
  kind: CodeEditKind;
  edit: (text: string) => string;
}

export interface CodeEditEntry {
  id: string;
  edits: readonly CodeEditCase[];
}

function must(text: string, re: RegExp): RegExpExecArray {
  const m = re.exec(text);
  if (!m) throw new Error(`codeEditSet: ${re} not found`);
  return m;
}

const RULE = /^\+ \[[^\]]*\] > U\+[0-9A-F]{4}$/m;
const USER_STORE = /^store\((?!&)[^)]+\) '[^']*'$/m;
const NAME = /^store\(&NAME\) '([^']*)'$/m;

function replaceOnce(text: string, re: RegExp, to: (m: RegExpExecArray) => string): string {
  const m = must(text, re);
  return text.slice(0, m.index) + to(m) + text.slice(m.index + m[0].length);
}

const changeRule: CodeEditCase = {
  kind: "change-rule",
  edit: (t) => replaceOnce(t, RULE, (m) => m[0].replace(/U\+[0-9A-F]{4}$/, m[0].endsWith("U+00A7") ? "U+00A4" : "U+00A7")),
};
const addRule: CodeEditCase = {
  kind: "add-rule",
  edit: (t) => replaceOnce(t, RULE, (m) => `${m[0]}\n+ [K_Q] > U+00A7`),
};
const deleteRule: CodeEditCase = {
  kind: "delete-rule",
  edit: (t) => replaceOnce(t, new RegExp(`${RULE.source}\n`, "m"), () => ""),
};
const editStore: CodeEditCase = {
  kind: "edit-store",
  edit: (t) => replaceOnce(t, USER_STORE, (m) => m[0].replace(/'$/, "x'")),
};
const addStore: CodeEditCase = {
  kind: "add-store",
  edit: (t) => replaceOnce(t, /^begin /m, () => "store(zzcode) 'qq'\nbegin "),
};
const editHeader: CodeEditCase = {
  kind: "edit-header",
  edit: (t) => replaceOnce(t, NAME, (m) => `store(&NAME) '${m[1]} edited'`),
};
const opaque = (re: RegExp, to: (m: RegExpExecArray) => string): CodeEditCase => ({
  kind: "edit-opaque",
  edit: (t) => replaceOnce(t, re, to),
});

export const CODE_EDIT_SET: readonly CodeEditEntry[] = [
  { id: "basic_kbdus", edits: [changeRule, addRule, deleteRule, addStore, editHeader] },
  { id: "basic_kbdfr", edits: [changeRule, addRule, deleteRule, editStore, addStore, editHeader] },
  { id: "sil_cameroon_qwerty", edits: [changeRule, addRule, deleteRule, editStore, editHeader] },
  { id: "enga", edits: [changeRule, addRule, deleteRule, addStore, editHeader] },
  {
    id: "sil_euro_latin",
    edits: [editHeader, opaque(/outs\(whitespace\) dk\(0001\)/, () => "outs(whitespace) dk(0002)")],
  },
  {
    id: "korean_phonetic",
    edits: [editHeader, opaque(/call\(jamo_combine\)/, () => "call(jamo_combine2)")],
  },
  {
    id: "cs_pinyin",
    edits: [opaque(/^store\(&HOTKEY\) '\[Ctrl Alt K_S\]'$/m, () => "store(&HOTKEY) '[Ctrl Alt K_T]'")],
  },
];
