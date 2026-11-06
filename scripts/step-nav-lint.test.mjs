// step-nav-lint fixture test (#2527) — the spec 081 FR-001 rule in
// eslint.config.mjs (`stepNavSelectors`) must flag a Back / Continue button
// rendered in a step body, and must not flag the correct path: a
// usePublishStepNav spec whose labels are step-nav labels.
//
// Runs the repo's real selectors through the ESLint Linter API (no file
// fixtures — a positive fixture file inside the linted tree would fail
// `pnpm lint` itself). Run: `pnpm run test:step-nav-lint`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { stepNavSelectors } from "../eslint.config.mjs";

const linter = new Linter();
const config = {
  files: ["**/*.tsx"],
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
  },
  rules: { "no-restricted-syntax": ["error", ...stepNavSelectors] },
};

function lint(code) {
  return linter.verify(code, [config], "fixture.tsx");
}

describe("step-nav lint (#2527)", () => {
  it("flags a body Back button calling onBack", () => {
    const messages = lint(`
      export function Step({ onBack }) {
        const { t } = useLingui();
        return (
          <button type="button" onClick={onBack}>
            {t({ id: "editor.assignLoop.osk.back", message: "Back" })}
          </button>
        );
      }
    `);
    assert.ok(messages.length >= 1, `expected nav errors, got ${JSON.stringify(messages)}`);
    assert.ok(messages.every((m) => m.message.includes("spec 081 FR-001")));
  });

  it("flags a body Continue button calling a local handleContinue", () => {
    const messages = lint(`
      export function Step({ onComplete }) {
        const { t } = useLingui();
        const handleContinue = () => onComplete({ html: "" });
        return (
          <button type="button" data-testid="html-continue" onClick={handleContinue}>
            {t({ id: "editor.assignLoop.html.continue", message: "Continue" })}
          </button>
        );
      }
    `);
    assert.ok(messages.length >= 1, `expected nav errors, got ${JSON.stringify(messages)}`);
  });

  it("does not flag a usePublishStepNav spec with Back / Continue labels", () => {
    const messages = lint(`
      export function Step({ onBack, onComplete }) {
        const { t } = useLingui();
        usePublishStepNav({
          back: {
            label: t({ id: "editor.assignLoop.osk.back", message: "Back" }),
            onClick: onBack,
            testId: "osk-back",
          },
          forward: {
            label: t({ id: "editor.assignLoop.osk.continue", message: "Continue" }),
            onClick: () => onComplete({}),
            testId: "osk-continue",
          },
        });
        return <div />;
      }
    `);
    assert.deepEqual(messages, []);
  });

  it("does not flag an in-body editor action (Discard changes)", () => {
    const messages = lint(`
      export function Step() {
        const { t } = useLingui();
        const handleDiscard = () => {};
        return (
          <button type="button" onClick={handleDiscard} disabled={false}>
            {t({ id: "editor.assignLoop.css.discard", message: "Discard changes" })}
          </button>
        );
      }
    `);
    assert.deepEqual(messages, []);
  });

  it("does not flag a template confirm button (Apply)", () => {
    const messages = lint(`
      export function Pane() {
        const { t } = useLingui();
        const apply = () => {};
        return (
          <button type="button" onClick={apply}>
            {t({ id: "touch.builder.template.apply", message: "Apply" })}
          </button>
        );
      }
    `);
    assert.deepEqual(messages, []);
  });
});
