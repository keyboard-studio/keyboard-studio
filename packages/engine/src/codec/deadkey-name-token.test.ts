/**
 * Round-trip proof for the spec-083 (issue #1849) name-metadata carrier.
 *
 * The author-chosen deadkey name travels as a structured comment token on
 * the trigger rule's trailing comment (`c @deadkey:<hexid> name=<name>`).
 * This test proves the carrier survives a real parse → emit → parse cycle
 * through the codec: the emitter writes the trailing comment inline and the
 * parser's stripTrailingComment recovers it, so `getDeadkeyName` still
 * resolves after the round trip.
 *
 * Lives in the engine package (not contracts) because contracts is the
 * dependency root and cannot import the codec.
 *
 * @see specs/083-deadkey-lifecycle/spec.md (User Story 3, acceptance 2)
 * @see packages/contracts/src/ir/deadkeys.ts ("Name metadata carrier — DECISION")
 */
import { describe, it, expect } from "vitest";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { getDeadkeyName, listDeadkeys } from "@keyboard-studio/contracts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'deadkey-name-token'
store(&TARGETS) 'any'
begin Unicode > use(main)

group(main) using keys

store(acuteK) 'aeiou'
store(acuteO) 'áéíóú'

+ [K_QUOTE] > dk(0001) c @deadkey:0001 name=acute
dk(0001) + any(acuteK) > index(acuteO, 2)
dk(0001) + [K_QUOTE] > "'"
`;

describe("deadkey name token round-trip (spec 083)", () => {
  it("survives parse → emit → parse", () => {
    const first = parse(KMN, "deadkey-name-token").ir;

    const listed = listDeadkeys(first);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(1);
    expect(listed[0]?.triggerKey).toBe("K_QUOTE");
    expect(listed[0]?.authorName).toBe("acute");
    expect(listed[0]?.origin).toBe("studio");

    const emitted = emit(first);
    expect(emitted).toContain("@deadkey:0001 name=acute");

    const second = parse(emitted, "deadkey-name-token").ir;
    const relisted = listDeadkeys(second);
    expect(relisted).toHaveLength(1);
    expect(relisted[0]?.authorName).toBe("acute");
    expect(relisted[0]?.origin).toBe("studio");

    const trigger = second.groups
      .flatMap((g) => g.rules)
      .find((r) => r.trailingComment !== undefined);
    expect(trigger).toBeDefined();
    expect(getDeadkeyName(trigger!)).toBe("acute");
  });

  it("a token coexisting with user comment text survives the round trip", () => {
    const kmn = KMN.replace(
      "c @deadkey:0001 name=acute",
      "c hand-minted, do not touch @deadkey:0001 name=acute",
    );
    const first = parse(kmn, "deadkey-name-token").ir;
    const emitted = emit(first);
    const second = parse(emitted, "deadkey-name-token").ir;
    const trigger = second.groups
      .flatMap((g) => g.rules)
      .find((r) => r.trailingComment !== undefined);
    expect(trigger?.trailingComment).toContain(
      "hand-minted, do not touch @deadkey:0001 name=acute",
    );
    expect(getDeadkeyName(trigger!)).toBe("acute");
  });
});
