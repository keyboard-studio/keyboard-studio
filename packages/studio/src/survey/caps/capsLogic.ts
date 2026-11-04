// capsLogic — the pure rules behind the caps-handling decision (spec 112):
// the casing gate and which modes are offered. React-free.

import { caseCounterpart, isCapsModifier } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { CapsHandlingValue } from "../../decisions/decisionTypes.ts";

/** True when at least one character of the alphabet has a case pair. */
export function isCasedAlphabet(chars: readonly string[], bcp47?: string): boolean {
  return chars.some((c) => caseCounterpart(c, bcp47) !== null);
}

/** True when any rule of the keyboard tests CAPS or NCAPS. */
export function hasCapsRules(ir: KeyboardIR): boolean {
  return ir.groups.some((g) =>
    g.rules.some((r) =>
      r.context.some(
        (el) => el.kind === "vkey" && el.modifiers.some(isCapsModifier),
      ),
    ),
  );
}

/** The modes offered for a copied keyboard; explicit-rules needs rules to keep. */
export function capsModesOffered(ir: KeyboardIR | null): CapsHandlingValue["mode"][] {
  return ir !== null && hasCapsRules(ir)
    ? ["cased-keys", "explicit-rules", "none"]
    : ["cased-keys", "none"];
}

/** The confirmed alphabet's characters out of the recorded character-inventory value. */
export function alphabetOf(value: unknown): string[] {
  const chars = (value as { chars?: unknown } | undefined)?.chars;
  return Array.isArray(chars) ? chars.filter((c): c is string => typeof c === "string") : [];
}

