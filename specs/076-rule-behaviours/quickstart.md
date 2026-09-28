# Quickstart: carve suppression (issue #1802)

Validation scenarios proving the feature works end-to-end. Each is runnable; expected outcomes are normative (they restate SC-008 and spec §User Story 6 scenarios).

## Prerequisites

- Branch `km/issue-1802-spec`, `pnpm install`, `pnpm -r build`.
- Fixture keyboard: the Cameroon QWERTY corpus keyboard per [docs/keyboard-index.md](../../docs/keyboard-index.md) (single RALT layer; two-level RALT+SHIFT variant; touch-layer variant).
- Engine simulator and vitest; studio dev server for the UI scenarios.

## Engine scenarios (vitest)

1. **Bare-key block.** Carve `+ [RALT K_E]` on the fixture with disposition `block`, A6 soft. Expect the rule rewritten in place to `> nul`, carrying `ownedByBehaviour: "carve-suppression"`, at the original group position. Simulator: the combination produces nothing on every host.
2. **Text-context block.** Carve a rule whose LHS consumes text context, disposition `block`. Expect `> context` — never `> nul`. Assert the compiler rejects a hand-built `nul`-on-text-context rule (FR-009/FR-014 extension).
3. **Deadkey block.** Carve `dk(x) + [K_A]`, disposition `block`. Expect `> nul` and simulator-confirmed no fall-through: the deadkey is not left armed.
4. **Loud variant.** A6 loud, bare-key carve. Expect `> nul beep`. Assert no bare `beep` on any matched context.
5. **Store-slot block.** Carve one slot of an `any()`/`index()` pair, disposition `block`. Expect a guard rule immediately ahead of the paired rule reproducing context up to the trigger; the store itself unchanged (no interior `nul` fill); surviving slots still fire.
6. **Un-carve.** Un-carve every carved combo. Expect all owned rules gone, originals restored, disposition metadata deleted. Recompile is clean.
7. **Allow-host exclusion.** One row flipped to `allow-host`, rest `block`. Expect the flipped combo absent from both the suppression output and the swallow skip-set predicate; every other combo still blocked.

## Studio scenarios (dev server + Playwright)

8. **Pre-fill with provenance.** Accept the closed-keyboard card, carve a character on an Arabic base. Expect the row pre-filled to Block labelled "from closed-keyboard card". Decline the card on a sparse Latin overlay: rows pre-fill to Allow host.
9. **No re-prompt.** Set a per-row override, trigger recompile (e.g. toggle an unrelated binding so `swallowUndefined` recomputes). Expect the override kept, no prompt shown.
10. **Host selector.** In the test pane, select a carved combination; switch through the keyboard's likely hosts, then blocked. Under Block every host shows nothing; under Allow host the outputs vary. On a keyboard with no language signal the five reference hosts appear. On KeymanWeb the loud Block case flashes instead of beeping.
11. **Tradeoff copy.** Expand a gallery row: expect the host-consequence table, the caption that the four layouts are examples, the question "do your typists expect a character on this key?", each option stating its own risk — and assert the string "allow unpredictable / block predictable" appears nowhere.
12. **Review panel.** Open "Review removed keys": expect every carved combo with disposition and cross-host consequence, ending in the two-sided verdict line. Touch strip shows the keycap consequence.

## Regression

- `pnpm vitest run` in `packages/engine` and `packages/studio`: no new failures; the `sil_cameroon_qwerty` scenario tests (ruling verification plan) pass.
- `spec-trace check`: only acknowledged drift (SC-007 analogue).
