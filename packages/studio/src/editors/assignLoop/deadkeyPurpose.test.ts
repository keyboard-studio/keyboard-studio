import { describe, expect, it } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { parseKmn } from "@keyboard-studio/engine";
import {
  VARIANT_PURPOSE,
  deadkeyPurposeOf,
  proposeS02TriggerKey,
  resolveS02DeadkeyIdentity,
  s02BaseClash,
  sessionDeadkeys,
} from "./deadkeyPurpose.ts";
import { PATTERN_DEADKEY, PATTERN_SWAP } from "./patternIds.ts";

function dk(
  target: string,
  triggerKey: string,
  deadkeyName: string,
  baseLetters: string,
  accentChar = ";",
): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "physical",
    mechanisms: [
      {
        patternId: PATTERN_DEADKEY,
        strategyId: "S-02",
        slotValues: { triggerKey, deadkeyName, baseLetters, accentedForms: target, accentChar },
      },
    ],
    source: "user",
  };
}

const propose = (currentChar: string, baseLetter: string, sessionAssignments: MechanismAssignment[]) =>
  proposeS02TriggerKey({ currentChar, baseLetter, sessionAssignments, workingIr: null });

describe("deadkeyPurposeOf", () => {
  it("is the NFD combining-mark sequence for an accented letter", () => {
    expect(deadkeyPurposeOf("ǎ")).toBe("̌");
    expect(deadkeyPurposeOf("Ě")).toBe("̌");
    expect(deadkeyPurposeOf("ệ")).toBe("̣̂");
  });

  it("is the variant purpose for a letter with no mark", () => {
    expect(deadkeyPurposeOf("ɛ")).toBe(VARIANT_PURPOSE);
    expect(deadkeyPurposeOf("Ɔ")).toBe(VARIANT_PURPOSE);
  });
});

describe("proposeS02TriggerKey — one deadkey per purpose", () => {
  it("routes the Bafut set onto two deadkeys: caron on ';', variants on '['", () => {
    // Order mirrors the p1-whole-bafut-kbdus gallery walk that emitted seven
    // deadkeys all on K_COLON.
    const session: MechanismAssignment[] = [];
    const placed: Record<string, string> = {};
    for (const [ch, base] of [
      ["ǎ", "a"], ["Ǎ", "A"], ["ě", "e"], ["Ě", "E"], ["ɛ", "e"], ["Ɛ", "E"], ["Ɔ", "O"],
    ] as const) {
      const trigger = propose(ch, base, session);
      placed[ch] = trigger;
      const existing = sessionDeadkeys(session).get(trigger);
      session.push(dk(ch, trigger, existing?.deadkeyName ?? `30${session.length}0`, base));
    }
    expect(placed).toEqual({
      "ǎ": "K_COLON", "Ǎ": "K_COLON", "ě": "K_COLON", "Ě": "K_COLON",
      "ɛ": "K_LBRKT", "Ɛ": "K_LBRKT", "Ɔ": "K_LBRKT",
    });
    expect([...sessionDeadkeys(session).keys()]).toEqual(["K_COLON", "K_LBRKT"]);
  });

  it("gives a second mark its own trigger", () => {
    const session = [dk("ǎ", "K_COLON", "3000", "a")];
    expect(propose("à", "a", session)).toBe("K_LBRKT");
  });

  it("skips a trigger whose bare key a session key assignment reassigned", () => {
    // p1-whole-bafut-kbdus: “ took the [ key and ” the ] key before ɛ came up;
    // a trigger on [ would have shadowed “.
    const swap = (target: string, rule: string): MechanismAssignment => ({
      scope: "individual",
      target,
      modality: "physical",
      mechanisms: [{ patternId: PATTERN_SWAP, strategyId: "S-01", slotValues: { kmnRules: rule } }],
      source: "user",
    });
    const session = [
      swap("“", "+ [K_LBRKT] > U+201C"),
      swap("”", "+ [K_RBRKT] > U+201D"),
      dk("ǎ", "K_COLON", "3000", "a"),
    ];
    expect(propose("ɛ", "e", session)).toBe("K_BKQUOTE");
    // A modified-key rule leaves the bare key free.
    expect(propose("ɛ", "e", [swap("{", "+ [SHIFT K_LBRKT] > '{'"), dk("ǎ", "K_COLON", "3000", "a")])).toBe("K_LBRKT");
  });

  it("skips a trigger the starting keyboard already uses for a deadkey", () => {
    const workingIr = parseKmn(
      `store(&version) '10.0'\nbegin Unicode > use(main)\n\ngroup(main) using keys\n+ [K_COLON] > dk(0060)\n`,
      "occupied-trigger",
    ).ir;
    expect(
      proposeS02TriggerKey({ currentChar: "ǎ", baseLetter: "a", sessionAssignments: [], workingIr }),
    ).toBe("K_LBRKT");
  });

  it("shares a deadkey across purposes only when every trigger is taken and the base is free", () => {
    const session = [
      dk("ǎ", "K_COLON", "3000", "a"),
      dk("à", "K_LBRKT", "3001", "a", "["),
      dk("á", "K_RBRKT", "3002", "a", "]"),
      dk("â", "K_BKQUOTE", "3003", "a", "`"),
    ];
    // ç (cedilla) has no trigger of its own left; c is free on the caron deadkey.
    expect(propose("ç", "c", session)).toBe("K_COLON");
  });
});

describe("s02BaseClash", () => {
  const session = [dk("ě", "K_COLON", "3000", "e")];

  it("reports what the trigger + base already types", () => {
    expect(
      s02BaseClash({ triggerKey: "K_COLON", baseLetter: "e", currentChar: "ɛ", sessionAssignments: session }),
    ).toBe("ě");
  });

  it("is null for a free base or for re-applying the same character", () => {
    expect(
      s02BaseClash({ triggerKey: "K_COLON", baseLetter: "a", currentChar: "ǎ", sessionAssignments: session }),
    ).toBeNull();
    expect(
      s02BaseClash({ triggerKey: "K_COLON", baseLetter: "e", currentChar: "ě", sessionAssignments: session }),
    ).toBeNull();
  });
});

describe("resolveS02DeadkeyIdentity", () => {
  it("mints a fresh hex4 id and the trigger's literal character on an empty session", () => {
    expect(
      resolveS02DeadkeyIdentity({
        triggerKey: "K_COLON",
        triggerResolution: { kind: "key", vkey: "K_COLON" },
        workingIr: null,
        sessionAssignments: [],
      }),
    ).toEqual({ deadkeyName: "3000", accentChar: ";" });
  });

  it("skips ids already minted this session on a different trigger", () => {
    const id = resolveS02DeadkeyIdentity({
      triggerKey: "K_LBRKT",
      triggerResolution: { kind: "key", vkey: "K_LBRKT" },
      workingIr: null,
      sessionAssignments: [dk("ǎ", "K_COLON", "3000", "a")],
    });
    expect(id).toEqual({ deadkeyName: "3001", accentChar: "[" });
  });

  it("reuses the id and accentChar of a deadkey already on the trigger", () => {
    const id = resolveS02DeadkeyIdentity({
      triggerKey: "K_COLON",
      triggerResolution: { kind: "key", vkey: "K_COLON" },
      workingIr: null,
      sessionAssignments: [dk("ǎ", "K_COLON", "3000", "a")],
    });
    expect(id).toEqual({ deadkeyName: "3000", accentChar: ";" });
  });
});
