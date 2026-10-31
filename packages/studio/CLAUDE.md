# Studio conventions

Loaded when working under `packages/studio/`. Repo-wide guidance lives in the root
[CLAUDE.md](../../CLAUDE.md).

- **Accessibility** (spec 056): studio UI code follows the house rules in
  [docs/accessibility.md](../../docs/accessibility.md) — semantic HTML first, keyboard-operable
  everything, programmatic labels, ARIA APG patterns for composite widgets, codepoint-derived
  accessible names for glyphs, aria-live riding existing cycles (D3). Conformance state lives in
  [specs/056-ada-accessibility/wcag-2.2-aa-tracker.md](../../specs/056-ada-accessibility/wcag-2.2-aa-tracker.md);
  a tracker row flips to `pass` only with named evidence.
- **i18n message ids** (spec 046): `area ( "." segment )+`, lowercase, dot-separated — e.g.
  `welcome.title`, `output.submit.button.submit`. An id is a permanent handle; renaming one
  orphans its translations, so only do it when the string's *meaning* changed, not its wording.
  Full authoring rules (JSX `<Trans>` vs. the `t` macro, variable interpolation, ICU plurals,
  what not to wrap) live in
  [specs/046-i18n-localization/contracts/catalog-format.md](../../specs/046-i18n-localization/contracts/catalog-format.md);
  rationale in [docs/i18n-spike.md](../../docs/i18n-spike.md).
- **New UI strings ship with their French.** `messages:extract` adds each new id to
  `src/locales/fr/messages.json` as `""`; write the French in the same change.
  `pnpm run i18n-catalog-lint` rejects empty target values, because a blank that reaches `main`
  comes back from the next Crowdin sync as English, while French committed here is uploaded to
  Crowdin on merge and round-trips.
