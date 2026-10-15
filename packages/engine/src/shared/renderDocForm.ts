// renderDocForm — the documentation form renderer (spec 095 FR-023/FR-024).
//
// Two constructs and nothing else: `{{id}}` inserts a slot, and
// `{{#id}}…{{/id}}` keeps its text only when slot `id` is non-empty. A dropped
// block takes the newline after `{{/id}}` with it, so an empty section leaves
// no blank line. A block tag alone on its line removes that whole line, kept
// or dropped, so multi-line forms read naturally. Values are inserted as given:
// callers escape them for the target file first.

import type { DocSlotModel } from "./docSlots.js";

export class DocFormParseError extends Error {
  readonly formId: string | undefined;
  readonly problem: string;

  constructor(problem: string, formId?: string) {
    super(formId !== undefined ? `form "${formId}": ${problem}` : problem);
    this.name = "DocFormParseError";
    this.problem = problem;
    this.formId = formId;
  }
}

type DocNode =
  | { kind: "text"; text: string }
  | { kind: "slot"; id: string }
  | { kind: "block"; id: string; children: DocNode[]; dropsNextNewline: boolean };

const TAG_BODY = /^([#/]?)([A-Za-z][A-Za-z0-9]*)$/;

/** A block tag stands alone when it fills its line: start of form or a newline before, a newline or end of form after. */
function standsAlone(form: string, start: number, end: number): boolean {
  return (start === 0 || form[start - 1] === "\n") && (end === form.length || form[end] === "\n");
}

function parse(form: string, formId: string | undefined): { nodes: DocNode[]; ids: string[] } {
  const root: DocNode[] = [];
  const stack: Array<{ id: string; children: DocNode[] }> = [];
  const ids: string[] = [];
  const seen = new Set<string>();
  const noteId = (id: string): void => {
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  const fail = (problem: string): never => {
    throw new DocFormParseError(problem, formId);
  };
  const current = (): DocNode[] => stack[stack.length - 1]?.children ?? root;
  const pushText = (text: string): void => {
    if (text !== "") current().push({ kind: "text", text });
  };

  let pos = 0;
  while (pos < form.length) {
    const open = form.indexOf("{{", pos);
    if (open === -1) {
      pushText(form.slice(pos));
      break;
    }
    pushText(form.slice(pos, open));
    const close = form.indexOf("}}", open + 2);
    if (close === -1) fail(`unknown construct ${form.slice(open, open + 20)}`);
    const end = close + 2;
    const tag = form.slice(open, end);
    const match = TAG_BODY.exec(form.slice(open + 2, close));
    if (match === null) return fail(`unknown construct ${tag}`);
    const [, sigil, id] = match as unknown as [string, string, string];
    noteId(id);
    const alone = sigil !== "" && standsAlone(form, open, end);
    pos = alone && form[end] === "\n" ? end + 1 : end;

    if (sigil === "") {
      current().push({ kind: "slot", id });
    } else if (sigil === "#") {
      if (stack.some((b) => b.id === id)) fail(`nested block {{#${id}}}`);
      stack.push({ id, children: [] });
    } else {
      const top = stack.pop();
      if (top === undefined || top.id !== id) {
        fail(top === undefined ? `unbalanced block {{/${id}}}` : `unbalanced block {{#${top.id}}}`);
      }
      current().push({
        kind: "block",
        id,
        children: (top as { children: DocNode[] }).children,
        dropsNextNewline: !alone && form[end] === "\n",
      });
    }
  }
  const unclosed = stack[stack.length - 1];
  if (unclosed !== undefined) fail(`unbalanced block {{#${unclosed.id}}}`);
  return { nodes: root, ids };
}

/** The slot ids `form` references, in first-use order. Throws DocFormParseError on an unbalanced block or unknown construct. */
export function parseDocForm(form: string, formId?: string): string[] {
  return parse(form, formId).ids;
}

function renderNodes(nodes: readonly DocNode[], slots: Readonly<Record<string, string | undefined>>): string {
  let out = "";
  let skipNewline = false;
  for (const node of nodes) {
    if (node.kind === "text") {
      out += skipNewline && node.text.startsWith("\n") ? node.text.slice(1) : node.text;
      skipNewline = false;
    } else if (node.kind === "slot") {
      out += slots[node.id] ?? "";
      skipNewline = false;
    } else if ((slots[node.id] ?? "").trim() !== "") {
      out += renderNodes(node.children, slots);
      skipNewline = false;
    } else {
      skipNewline = node.dropsNextNewline;
    }
  }
  return out;
}

/** Render `form` with `slots`. Values are inserted as given (already escaped). Deterministic. */
export function renderDocForm(form: string, slots: Partial<DocSlotModel>): string {
  return renderNodes(parse(form, undefined).nodes, slots as Readonly<Record<string, string | undefined>>);
}
