// ESLint flat config (ESLint v10). The `lint` script targets
// `packages/*/src/**/*.{ts,tsx}`; this config applies the typescript-eslint
// recommended rule set to those files. Type-aware rules are intentionally
// not enabled — `pnpm typecheck` already runs the full strict tsc pass, so
// lint stays fast and focuses on lint-only concerns.

import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import lingui from "eslint-plugin-lingui";
import jsxA11y from "eslint-plugin-jsx-a11y";

// Spec 090 FR-003 layer 2 (research R4): store-write call sites banned
// inside gallery renderer trees. A migrated renderer receives its decision
// value via DecisionRendererProps and reports changes via onChange only —
// it never calls a store write action itself; the gallery host
// (steps/galleryHost.tsx) is the single write path. The per-story audit
// lists live in packages/studio/src/decisions/galleryWriteAudit.test.ts
// (the call-site checker); each story extends BOTH lists in its own change
// (US1: T014, US2: T027, US3: T035, US4: T043), and T060 asserts the final
// lists leave zero exceptions (SC-002). Scaffolding lands with empty lists:
// the mechanism is in place, and the checker test's self-test proves the
// scanner flags a planted call site, so the empty state is not vacuous.
const GALLERY_RENDERER_TREE_GLOBS = [
  // The gallery modules + host are renderer trees from the start.
  "packages/studio/src/survey/questions/gallery/**/*.{ts,tsx}",
  "packages/studio/src/steps/galleryHost.tsx",
  // Per-story renderer trees are appended here as each story migrates.
  // US1 (T014): the three migrated small-picker renderers.
  "packages/studio/src/survey/layout/LayoutStep.tsx",
  "packages/studio/src/survey/touchSeedSource/TouchSeedSourcePanel.tsx",
  "packages/studio/src/survey/chooseBase/BaseKeyboardRenderer.tsx",
  "packages/studio/src/editors/panels/BaseResolution.tsx",
];
const GALLERY_WRITE_IDENTIFIERS = [
  // Store write actions a renderer tree must never call (research R4 list).
  // Extended per story in the same change that extends the checker test.
  // US1 (T014): the layout step's answer write, the base picker's session
  // writes, and the touch-seed session write (already retired by 088).
  "saveAnswer",
  "setLocalBase",
  "setBaseConfirmed",
  "setTouchSeedSource",
];

// US2 (T027): the Phase B/C renderer trees. Their retired store write path
// is the deleted phaseBDraftStore (T025): its accept/decline/setter action
// names survive as pure functions over the decision values and as gallery
// host hook methods, so the bannable signature is the store hook itself.
// A `saveAnswer` ban additionally applies to the two trees whose answer
// writes US2 retired in full (invisibles, convenience). The marks /
// characters / punctuation trees still call saveAnswer as the spec-079
// evidence layer — and no ban applies to them: the T026 ruling
// (research D-090-29) determined that layer is spec 079's own draft
// surface, outside FR-003's banned category (gallery components writing
// answers in place of decision records). Mirrors the checker test's
// lists.
const GALLERY_RENDERER_TREES_US2 = [
  "packages/studio/src/survey/CharactersStep.tsx",
  "packages/studio/src/survey/PhaseB.tsx",
  "packages/studio/src/survey/CharacterMapPane.tsx",
  "packages/studio/src/survey/marks/**/*.{ts,tsx}",
  "packages/studio/src/survey/punctuation/**/*.{ts,tsx}",
  "packages/studio/src/survey/invisibles/**/*.{ts,tsx}",
  "packages/studio/src/survey/convenience/**/*.{ts,tsx}",
];
const GALLERY_RENDERER_TREES_US2_ANSWER_FREE = [
  "packages/studio/src/survey/invisibles/**/*.{ts,tsx}",
  "packages/studio/src/survey/convenience/**/*.{ts,tsx}",
];

// US3 (T035): the Phase D trees join the global usePhaseBDraftStore
// ban (the store is deleted; zero references). The action-name bans
// (cascade*/prefillCarveDispositions/commitDeadkeyOp) are NOT
// registered, by ruling (research D-090-31): those actions are the
// ratified edit-time write paths of the editor-backed decisions
// (the carve overlay; the deadkey op log), not gallery write-arounds.
// Mirrors the checker test's lists.
const GALLERY_RENDERER_TREES_US3 = [
  "packages/studio/src/editors/carve/**/*.{ts,tsx}",
  "packages/studio/src/editors/deadkey/**/*.{ts,tsx}",
  "packages/studio/src/editors/adapters/deadkeyAdapter.tsx",
  "packages/studio/src/editors/adapters/carveAdapter.tsx",
  "packages/studio/src/survey/rules/**/*.{ts,tsx}",
  "packages/studio/src/survey/deadkeys/**/*.{ts,tsx}",
];

// US4 (T043): the assignLoop trees are NOT added, and the action-name
// bans T043's text names (recordAssignments / setTouchDraft /
// deleteTouchKey) are NOT registered, by ruling (research D-090-47,
// lead ruling on D-090-38 Flag 1, extending D-090-31's scope
// determination to US4): those actions are the sanctioned edit-time
// write paths of the mechanisms / touch galleries under the ratified
// record-from-working-copy design — they write the working-copy
// state (the phase-C assignment list, the touch draft, the
// deleted-touch-key set) that completion snapshots into the
// physical-layout / touch-layout decision values, not answers in
// place of decision records. Mirrors the checker test's lists.

function galleryWriteBanRule(identifiers) {
  return [
    "error",
    ...identifiers.flatMap((name) => [
      {
        selector: `CallExpression[callee.name="${name}"]`,
        message: `Gallery renderer trees must not call store write action "${name}" — report the change through onChange (spec 090 FR-003).`,
      },
      {
        selector: `CallExpression[callee.property.name="${name}"]`,
        message: `Gallery renderer trees must not call store write action "${name}" — report the change through onChange (spec 090 FR-003).`,
      },
    ]),
  ];
}

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.d.ts",
      // Generated recognizer rules — codegen output, not hand-edited.
      "**/recognizer/rules/generated/**",
      // Vendored upstream Keyman code (see simulator/vendor/.../PROVENANCE.md):
      // third-party, not ours to lint.
      "**/simulator/vendor/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // React Hooks correctness for the studio SPA. rules-of-hooks catches real
      // bugs; exhaustive-deps is advisory (warn) — several call sites opt out
      // deliberately via inline eslint-disable, which now resolves.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The codebase marks intentionally-unused bindings with a leading
      // underscore (destructure-omit, placeholder params, type-only imports
      // kept for documentation). Honour that convention.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // Disallow console.* calls in shipped code — route intentional
      // diagnostics through the `devLog` helper (@keyboard-studio/contracts/
      // dev-log), which prints in dev/test/CLI and goes inert in a production
      // build. That helper holds the single sanctioned console sink; every
      // other call site should use it, so a warning here means a stray call.
      "no-console": "warn",
    },
  },
  {
    // Tests, codegen determinism harnesses, and other *.test.ts files run
    // only under vitest/Node and log freely for diagnostics — they never
    // reach a production bundle, so the no-console gate does not apply.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Spec 090 FR-003 layer 2 overlay (see GALLERY_WRITE_IDENTIFIERS above):
    // no store-write call sites inside gallery renderer trees — neither a
    // bare call (`saveAnswer(...)`) nor a member call
    // (`store.saveAnswer(...)` / `getState().saveAnswer(...)`). Selectors
    // are generated from the identifier list by galleryWriteBanRule.
    files: GALLERY_RENDERER_TREE_GLOBS,
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": galleryWriteBanRule(GALLERY_WRITE_IDENTIFIERS),
    },
  },
  {
    // Spec 090 FR-003 layer 2 overlay, US2 (T027): the Phase B/C trees
    // never touch the deleted phaseBDraftStore hook (see the US2 list
    // comment above).
    files: GALLERY_RENDERER_TREES_US2,
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": galleryWriteBanRule(["usePhaseBDraftStore"]),
    },
  },
  {
    // Spec 090 FR-003 layer 2 overlay, US2 (T027): invisibles and
    // convenience retired their answer writes in full, so `saveAnswer`
    // is banned there today. Marks / characters / punctuation do NOT
    // follow: their saveAnswer calls are the spec-079 evidence layer,
    // ruled outside the banned category (research D-090-29).
    files: GALLERY_RENDERER_TREES_US2_ANSWER_FREE,
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": galleryWriteBanRule(["saveAnswer", "usePhaseBDraftStore"]),
    },
  },
  {
    // Spec 090 FR-003 layer 2 overlay, US3 (T035, ungated slice): the
    // Phase D trees never touch the deleted phaseBDraftStore hook.
    files: GALLERY_RENDERER_TREES_US3,
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": galleryWriteBanRule(["usePhaseBDraftStore"]),
    },
  },
  {
    // Accessibility gate for shipped studio JSX (spec 056 FR-002; house
    // rules in docs/accessibility.md). Recommended ruleset at error
    // severity — a defect this plugin detects (missing label, invalid
    // ARIA, click-without-key) fails `pnpm lint`. Any rule demoted or
    // disabled here needs an inline justification per FR-002. Tests are
    // out of scope: fixture JSX never ships.
    files: ["packages/studio/src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/test/**"],
    plugins: { "jsx-a11y": jsxA11y },
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      // ignoreNonDOM: only flag autoFocus on real DOM elements. A custom
      // component's autoFocus prop (e.g. CharChipEditor autoFocus={false})
      // is an API the component resolves internally — any DOM autoFocus it
      // renders is still caught at that DOM site. Deliberate in-dialog focus
      // placement per APG carries a per-site disable instead (ConfirmDialog).
      "jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
      // Not a demotion — teach the rule which house primitives (packages/
      // studio/src/ui) render a real form control, so a wrapping <label>
      // counts as associated. Plain <label> next to plain <div> still errors.
      "jsx-a11y/label-has-associated-control": [
        "error",
        {
          controlComponents: [
            "Checkbox",
            "TextField",
            "Textarea",
            "SelectMenu",
            "MultiSelect",
            "RadioGroup",
          ],
        },
      ],
    },
  },
  {
    // Unlocalized-string SCAN for the studio's Tier-A UI surface.
    //
    // Scope is deliberately narrow — studio COMPONENT files (`.tsx`) only:
    //   - Tier-B content (survey/questions/*.ts, localized via the content
    //     extraction pipeline, NOT <Trans>) is `.ts`, so it is out of scope
    //     here and never false-flagged.
    //   - Data maps / enums (iso3166Names, keyOptions, scriptAxes — also `.ts`)
    //     are likewise out of scope.
    // Level is `warn`, never `error`: this is a periodic "what did we forget to
    // internationalize" signal, not a merge gate. It must not turn CI red — the
    // codebase's heavy inline CSS-in-JS guarantees residual noise the ignore
    // list below can only partly tame. Genuine hits get wrapped in <Trans>/t();
    // legitimate non-UI strings get an inline `// eslint-disable-next-line`.
    files: ["packages/studio/src/**/*.tsx"],
    ignores: [
      "**/*.test.tsx",
      "**/test/**",
      // Dev-only demo route (/?demo=lint) — not production UI.
      "**/lint/LintDemo.tsx",
    ],
    plugins: { lingui },
    rules: {
      "lingui/no-unlocalized-strings": [
        "warn",
        {
          ignore: [
            "^(?![A-Z])\\S+$", // single lowercase token (css keyword, identifier, hex, url)
            "^[A-Z0-9_ ./-]+$", // ALL-CAPS / codes / paths / short tokens
            "^[#.@/{]", // css selector, hex colour, path, template fragment
            "\\d", // contains a digit (css sizes, versions) — pragmatic noise cut
            "->", // example key-mappings ("a -> A")
            "system-ui|-apple-system|monospace|sans-serif|Segoe|Roboto|Consolas|Cascadia|Playfair", // font stacks
            "^(GitHub|Google|Keyboard Studio)$", // brand / product names — never translated
          ],
          ignoreNames: [
            { regex: { pattern: "className", flags: "i" } },
            "style", "styleName", "src", "srcSet", "type", "id", "width", "height",
            "displayName", "key", "role", "name", "data-testid", "testId", "viewBox",
            "xmlns", "d", "fill", "stroke", "href", "rel", "target", "htmlFor",
            "autoComplete", "inputMode", "fontFamily", "font", "background", "color",
            "transform", "transition", "boxShadow", "gridTemplateColumns",
          ],
          ignoreFunctions: [
            "console.*", "devLog.*", "Error", "*.addEventListener",
            "*.removeEventListener", "*.postMessage", "*.getElementById",
            "*.querySelector", "*.querySelectorAll", "*.setAttribute",
            "*.getAttribute", "*.setProperty", "*.includes", "*.indexOf",
            "*.endsWith", "*.startsWith", "*.matchMedia", "require",
            "slugify*", "normalize*",
          ],
        },
      ],
    },
  },
];
