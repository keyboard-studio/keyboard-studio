// useInertOutside — make everything outside a modal surface `inert` while it
// is active, so the background can take neither pointer input nor focus.
//
// A focus trap alone is not enough for an inline (non-portal) modal: a click
// on a non-focusable spot drops focus to <body>, and Tab keydowns inside an
// iframe never reach the parent's trap — either way the next keypress could
// land on a background control. `inert` closes both paths.
//
// The surface renders inline deep in the app tree, so no single root can be
// made inert without freezing the surface too. Instead, walk up from each
// kept element to <body> and mark every sibling branch that holds no kept
// element. Only attributes this hook set are removed on cleanup.

import { useLayoutEffect, type RefObject } from "react";

export function useInertOutside(
  active: boolean,
  keepRefs: ReadonlyArray<RefObject<HTMLElement | null>>,
): void {
  useLayoutEffect(() => {
    if (!active) return;
    const keep = keepRefs
      .map((r) => r.current)
      .filter((el): el is HTMLElement => el !== null);
    if (keep.length === 0) return;
    const holdsKept = (el: Element): boolean =>
      keep.some((k) => el === k || el.contains(k));
    const marked: Element[] = [];
    for (const start of keep) {
      let node: Element = start;
      while (node.parentElement !== null && node !== document.body) {
        for (const sibling of Array.from(node.parentElement.children)) {
          if (holdsKept(sibling) || sibling.hasAttribute("inert")) continue;
          sibling.setAttribute("inert", "");
          marked.push(sibling);
        }
        node = node.parentElement;
      }
    }
    return () => {
      for (const el of marked) el.removeAttribute("inert");
    };
    // keepRefs is a fresh array literal each render; the refs inside it are
    // stable, and the surface mounts fresh per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
