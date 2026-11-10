import type { KeyboardIR } from "@keyboard-studio/contracts";

/**
 * True when a parsed `.kmn` looks like a Keyman keyboard: it has a `begin`
 * statement or at least one group.
 *
 * `parse()` is deliberately lenient. Text it cannot read is kept as opaque
 * fragments rather than rejected, and many callers parse fragments with no
 * `begin` line. So text that is not a keyboard at all, such as an MSKLC
 * `.klc` saved as `.kmn`, parses into an empty IR without an error. Entry
 * points that take a whole keyboard from an author check it with this before
 * replacing the working copy.
 */
export function isKeyboardSource(ir: KeyboardIR): boolean {
  return ir.header.encoding !== undefined || ir.groups.length > 0;
}

/** The message an entry point shows when {@link isKeyboardSource} is false. */
export const NOT_A_KEYBOARD_SOURCE_MESSAGE =
  "This is not a Keyman keyboard source: it has no begin statement and no groups.";
