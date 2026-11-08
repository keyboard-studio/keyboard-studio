/**
 * invertChanges -- the changes that undo `changes` (spec 113 US8). Pure.
 *
 * The inverse of a list is the inverses in reverse order: insert and remove swap,
 * replace swaps `old` and `node`, store / group / begin / header changes carry
 * their previous value. Removed and replaced nodes are stored with the change for
 * exactly this reason, so an older entry can be reverted by appending its inverse.
 */

import type { ContentAnchor, IRChange } from "@keyboard-studio/contracts";
import { canonicalNodeText } from "./sequence.js";

function usingKeysOf(at: ContentAnchor): boolean {
  return at.container.kind === "group" ? at.container.usingKeys : false;
}

function invertOne(c: IRChange): IRChange {
  switch (c.change) {
    case "insert": {
      // The node now sits after `c.at`; name it by its own text and neighbours.
      const text = canonicalNodeText(c.node, usingKeysOf(c.at));
      const at: ContentAnchor = { container: c.at.container, text };
      if (c.at.text !== "") at.prev = c.at.text;
      if (c.at.next !== undefined) at.next = c.at.next;
      return { change: "remove", at, old: c.node };
    }
    case "remove": {
      const at: ContentAnchor = { container: c.at.container, text: c.at.prev ?? "" };
      if (c.at.text !== "") at.next = c.at.text;
      return { change: "insert", at, node: c.old };
    }
    case "replace": {
      const at: ContentAnchor = {
        container: c.at.container,
        text: canonicalNodeText(c.node, usingKeysOf(c.at)),
      };
      if (c.at.prev !== undefined) at.prev = c.at.prev;
      if (c.at.next !== undefined) at.next = c.at.next;
      return { change: "replace", at, old: c.node, node: c.old };
    }
    case "set-store":
      return c.previous === undefined
        ? { change: "remove-store", name: c.name, previous: c.value, ...(c.after === undefined ? {} : { after: c.after }) }
        : { change: "set-store", name: c.name, value: c.previous, previous: c.value };
    case "remove-store":
      return {
        change: "set-store",
        name: c.name,
        value: c.previous,
        ...(c.after === undefined ? {} : { after: c.after }),
      };
    case "add-group":
      return { change: "remove-group", previous: c.group, ...(c.after === undefined ? {} : { after: c.after }) };
    case "remove-group":
      return { change: "add-group", group: c.previous, ...(c.after === undefined ? {} : { after: c.after }) };
    case "set-begin":
      return { change: "set-begin", begin: c.previous, previous: c.begin };
    case "set-header":
      return { change: "set-header", header: c.previous, previous: c.header };
  }
}

export function invertChanges(changes: readonly IRChange[]): IRChange[] {
  return changes.map(invertOne).reverse();
}
