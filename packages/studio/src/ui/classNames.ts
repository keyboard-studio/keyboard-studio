// Shared className merge helper for the ui/ primitives.
//
// Every primitive that carries the shared `ks-*` utility classes (Button,
// Dropdown, TextField, Textarea, …) needs to append an optional caller
// className without clobbering the base classes. This was the same
// `className !== undefined ? \`base ${className}\` : "base"` ternary copy-pasted
// at every call site (#536 triage). Centralise it so the merge rule lives once.

/**
 * Merge a component's own base class string with an optional caller-supplied
 * className. The base classes always come first; the caller's className (when
 * provided and non-empty) is appended. Returns just the base when no caller
 * className is given.
 */
export function mergeClassNames(base: string, className?: string): string {
  return className !== undefined && className !== ""
    ? `${base} ${className}`
    : base;
}
