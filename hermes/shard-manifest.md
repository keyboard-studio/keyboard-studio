# Shard manifest — repo-wide `/simplify` pass

**Total shards: 39** · **Total covered non-test LOC: 64,247**

Computed from the live tree (`find` + `wc -l`) on branch `main`. Covers all hand-written
`*.ts` / `*.tsx` source under `packages/{contracts,engine,keyboard-lint,llm,studio}/src`,
`api/{oauth,submit}`, and `utilities/oauth-backend/src`.

Excluded (per PLAN "What to exclude"): `**/*.test.*`, `**/__tests__/**`, `**/__fixtures__/**`
that are empty, `**/generated/**` (engine langtags 16,153 + recognizer rules 1,036),
`**/simulator/vendor/**` (9,597), `packages/compiler` (empty), `**/*.d.ts`, `**/dist/**`,
`node_modules`, all `vitest.config.ts`, and every `utilities/*` package except `oauth-backend`.

Budget: ~2,500 non-test LOC per pass. The four whole-file-over-budget modules
(`MechanismGallery.tsx`, `TouchGallery.tsx`, `irToCarveNodes.ts`, `codec/parse.ts`) get their
own shard. Shards are ordered dependency-first: contracts → engine → keyboard-lint → llm →
studio → api → oauth-backend. A shard never crosses a package boundary.

| # | shard id | package | covers | non-test LOC |
|---|----------|---------|--------|--------------|
| S01 | contracts-ir | contracts | `src/{keyboard-ir.ts, ir-path.ts, ir-path.type-assertions.ts, keyboardIRRoundTrip.ts}` + `src/ir/` | 1596 |
| S02 | contracts-schemas-pattern | contracts | `src/{schemas.ts, pattern.ts, patternLibrary.ts, patternMatch.ts, placementMap.ts, placementStrategy.ts, assignmentMap.ts}` | 1483 |
| S03 | contracts-identity-survey-domain | contracts | `src/{keyboardId.ts, keyboardIdentity.ts, surveySession.ts, surveyPhaseResult.ts, provenance.ts, characterDiscovery.ts, linguistInventory.ts, criteria.ts, criteriaData.ts}` | 1229 |
| S04 | contracts-services-primitives | contracts | `src/{outputService.ts, scaffolder.ts, compiler.ts, compileResult.ts, validator.ts, lintEngine.ts, lintFinding.ts, simulation.ts, virtualFS.ts, strategy.ts, removalCapability.ts, axes.ts, axisFill.ts, axisPriors.ts, baseBrowser.ts, baseKeyboard.ts, langtags.ts, fontEntry.ts, index.ts}` | 1770 |
| S05 | contracts-fixtures-mocks | contracts | `src/fixtures/` + `src/mocks/` + `src/utils/` | 1525 |
| S06 | engine-foundation | engine | `src/*.ts` (root) + `src/{shared,inventory,langtags(non-generated),stub-mutator,base-browser,pattern-library}/` | 1505 |
| S07 | engine-pattern-apply | engine | `src/pattern-apply/` | 2471 |
| S08 | engine-placement-strategy | engine | `src/placement/` + `src/strategy-selector/` | 1303 |
| S09 | engine-character-discovery-output | engine | `src/character-discovery/` + `src/output/` | 2066 |
| S10 | engine-codec-parse | engine | `src/codec/parse.ts` (own shard — 1,001 LOC) | 1001 |
| S11 | engine-codec-emit-rest | engine | `src/codec/` except `parse.ts` (incl. `emit.ts`) | 1535 |
| S12 | engine-validator | engine | `src/validator/` | 2030 |
| S13 | engine-recognizer | engine | `src/recognizer/` (excl. `rules/generated/`) | 1491 |
| S14 | engine-scaffolder | engine | `src/scaffolder/` | 1590 |
| S15 | engine-compiler-loader-simulator | engine | `src/compiler/` + `src/loader/` + `src/simulator/` (excl. `vendor/`) | 1422 |
| S16 | keyboard-lint | keyboard-lint | `src/*.ts` + `src/checks/` + `src/parsers/` | 694 |
| S17 | llm | llm | `src/*.ts` + `src/backends/` | 210 |
| S18 | studio-ui-shell | studio | `src/ui/` + `src/{StudioShell.tsx, index.ts, main.tsx, test-setup.ts}` + `src/flags/` | 2217 |
| S19 | studio-components-A | studio | `src/components/{BaseKeyboardPicker,ManagedPRSubmitPanel,AccountControl,ProfileScreen,StepHost,OutputScreen}.tsx` | 2325 |
| S20 | studio-components-B | studio | rest of `src/components/` (SignUpPanel, WelcomeScreen, OAuthCallbackScreen, OSKFrame, KmnEditor, MetadataCard, PreviewScreen, PreviewPaneOverlay, PickerPane, DiagnosticsPanel, OskModeToggle, ProviderMarks, UnsupportedScriptStub, ResizeHandle, PreviewShell, previewOutputLayout) | 1596 |
| S21 | studio-dashboard-A | studio | `src/dashboard/{completeness.ts, DashboardView.tsx, buildStepGraph.ts, FlowGraphView.tsx}` | 1999 |
| S22 | studio-dashboard-B | studio | rest of `src/dashboard/` (StrategyTreeView, renderedNodeSet, manifestProjection, layout, model, ScriptRoutingView, buildScriptRouting, flowUtils, tokens) | 1521 |
| S23 | studio-editors-mechanismgallery | studio | `src/editors/assignLoop/MechanismGallery.tsx` (own shard — 1,738 LOC) | 1738 |
| S24 | studio-editors-touchgallery | studio | `src/editors/assignLoop/TouchGallery.tsx` (own shard — 1,675 LOC) | 1675 |
| S25 | studio-editors-assignloop-parts | studio | `src/editors/assignLoop/parts/` (incl. Inspector.tsx 711) | 1677 |
| S26 | studio-editors-support | studio | `src/editors/assignLoop/{provenance,touchBehavior,IntroSplash,PreviewPane}` + `src/editors/{carve,touchSuggest,adapters,panels}/` | 2539 |
| S27 | studio-hooks | studio | `src/hooks/` (incl. useKeyboardArtifact.ts 689) | 2097 |
| S28 | studio-lib-A | studio | `src/lib/{githubOAuth.ts, projectWorkingCopyVfs.ts, serializeWorkingCopy.ts, googleOAuth.ts, iso3166Names.ts, persistWorkingCopy.ts, handleOAuthCallback.ts}` | 2188 |
| S29 | studio-lib-B | studio | rest of `src/lib/` except `irToCarveNodes.ts` (browserPatternLibrary, services, langtagsDefaults, suggestBase, rankBases, scriptAxes, and the ~19 smaller helpers) | 1834 |
| S30 | studio-lib-irtocarvenodes | studio | `src/lib/irToCarveNodes.ts` (own shard — 1,146 LOC) | 1146 |
| S31 | studio-steps | studio | `src/steps/` | 1951 |
| S32 | studio-stores-lint | studio | `src/stores/` (incl. workingCopyStore.ts 882) + `src/lint/` | 1777 |
| S33 | studio-survey-runner-phases | studio | `src/survey/{PhaseB.tsx, SurveyRunner.tsx, QuestionField.tsx, PhaseA.tsx, IdentityLite.tsx}` | 2476 |
| S34 | studio-survey-flow-fg | studio | rest of `src/survey/*.tsx|ts` root (constants, charNormUtils, index, CharactersStep, FlowStepHost, Prefill, loadModularFlow, types, placementSeeds) + `src/survey/questions/{f,g}/` + `src/survey/questions/*.ts` (registry.*, drillDownDeclarations, demotedPhaseA.fixture) | 1973 |
| S35 | studio-survey-questions-a | studio | `src/survey/questions/a/` | 1671 |
| S36 | studio-survey-questions-b1 | studio | `src/survey/questions/b/` — files `pb_accent_marks_gate.ts` … `pb_mark_input_order.ts` (alphabetical first half) | 1449 |
| S37 | studio-survey-questions-b2 | studio | `src/survey/questions/b/` — files `pb_mark_style.ts` … `pb_use_case.ts` (alphabetical second half) | 1516 |
| S38 | api | api (Vercel functions) | `api/oauth/{_shared,exchange,health,refresh}.ts` + `api/submit/managed-pr.ts` | 342 |
| S39 | oauth-backend | utilities/oauth-backend | `src/*.ts` (server, handlers, github-pipeline, google-handlers, google-schemas, installation-token, managed-pr-schemas, schemas) | 1619 |

## Notes
- **39 shards** rather than a round 30: the ~2,500-LOC budget plus the "never cross a package
  boundary" and "own-shard for over-budget files" rules force the split this fine. 35 of 39
  land at or under 2,500 LOC; the four exceptions (S07 2,471; S19 2,325; S26 2,539; S33 2,476)
  are marginal and within a 64k window once the ~8k repo-map slice and rubric are added.
- **Dependency order** for the Phase-2 loop: run S01→S39 as listed. contracts (S01–05) first so
  reuse targets are confirmed before engine (S06–15) and studio (S18–37) point at them;
  keyboard-lint (S16) and llm (S17) sit between engine and studio (both import contracts, not
  each other); api (S38) and oauth-backend (S39) are leaf consumers, run last.
- Per-package `pnpm --filter <pkg> typecheck && test` gates each shard (Phase 3); `<pkg>` is the
  shard's package column.
