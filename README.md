# Keyboard Studio

An experimental, browser-based way to make [Keyman](https://keyman.com) keyboards by answering
questions about a language instead of writing `.kmn` by hand. It began as a hackathon project,
built by people who use and teach Keyman and share its goal of every language being typeable.

Keyboard Studio is built on Keyman. It compiles with Keyman's own compiler, starts every keyboard
from one in the [keymanapp/keyboards](https://github.com/keymanapp/keyboards) repository, and
submits finished keyboards back to that repository through its normal review.

Try it at [kbstudio.langtech.cloud](https://kbstudio.langtech.cloud). The project page is at
[keyboard-studio.github.io/keyboard-studio](https://keyboard-studio.github.io/keyboard-studio/).

## Why it exists

Keyman has let people type their languages on every major platform since 1992, and Keyman
Developer, together with the keyboards repository, has carried more than 900 reviewed keyboards to
the communities that use them. We are grateful for both, and this project depends on them.

Keyboard Studio started at a hackathon in summer 2026, among staff and summer associates in SIL's Language
Technology Use department, as something smaller: an MCP server to help
existing Keyman Developer users write keyboard code faster. We widened the goal as we went. Many of
us have taught keyboard development in workshops for years. We kept meeting people who knew their
language well but found it hard to finish a keyboard: the code, the files that must stay in step,
and the review checklist were a lot to take on at once. Keyboard Studio tries to give those
first-time authors a guided path into the same ecosystem.

It has grown since it began, but it is much younger and less tested than the Keyman Developer
pipeline, and it is not an official Keyman project. It is a way into Keyman, not a way around it.

## What it is not

It is **not a replacement for Keyman Developer.** Developer is most fruitful for a skilled keyboard
author, and those authors should keep using it; it can do much more than the studio. The studio
deliberately covers a narrower set of well-understood keyboard designs.

## How it works

- **Start from a working keyboard.** Most keyboards in the repository cluster around a few
  layouts per script ([how the 920 keyboards group](https://keyboard-studio.github.io/keyboard-studio/docs/design-notes/keyboard-grouping.html)),
  so every session starts as a copy of one existing keyboard: a published keyboard, a basic
  layout, an uploaded `.kmn`, or US QWERTY when nothing closer exists.
- **Suggested answers.** Each question offers a proposed answer with its source, to confirm or
  change. Where a guess could be wrong in a way that matters, such as the copyright holder, the
  studio asks instead.
- **Live preview.** Type with the keyboard after every change, on desktop and touch layouts.
- **Checks as you work.** Keyman's compiler (`kmcmplib`, as WebAssembly) and checks based on the
  repository's review criteria ([docs/criteria.md](docs/criteria.md)) run on every edit.
- **Output.** An installable `.kmp`, a source `.zip`, or a draft pull request to
  `keymanapp/keyboards`.

Two tracks: make a **new keyboard** from an existing one, or make a **new version** of an existing
keyboard.

## Limits

- Experimental. Reviewers may still ask for changes, and passing the studio's checks does not
  guarantee acceptance.
- Not yet supported: CJK, Ethiopic, and Hangul jamo-composition input methods, LDML output,
  predictive-text wordlists, and merging several keyboards into one. Full list in
  [spec.md §16](spec.md#16-out-of-scope).
- Some review criteria can't be checked by software (for example, the right to name a given
  copyright holder). The studio asks the author to confirm them; Keyman's reviewers make the call.

If something the studio produces makes a reviewer's job harder, please
[open an issue](https://github.com/keyboard-studio/keyboard-studio/issues). We treat that as our
bug.

## For contributors

Requires **pnpm 9** and **Node >= 22.19.0** (an older Node makes some codegen steps exit 0 having
done nothing).

```sh
pnpm install
pnpm build       # runs `prebuild` first: fetches pinned upstream data and codegens artifacts
pnpm dev         # studio SPA at the Vite dev URL
pnpm test
```

Run `pnpm build` before `pnpm typecheck` or `pnpm test` on a clean checkout: the engine and studio
resolve types from `contracts/dist/`, which only exists after a build. Corpus-calibrated tests
expect a sibling `../keyboards` checkout tracking the
[keyboard-studio/keyboards](https://github.com/keyboard-studio/keyboards) fork's `master`. More in
[docs/tooling.md](docs/tooling.md); how the packages fit together in
[docs/architecture.md](docs/architecture.md) and [docs/packages.md](docs/packages.md).

### Repository layout

| Path | What it is |
|------|------------|
| [`spec.md`](spec.md) | The original signed-off design document, now **historical**. Authority is by topic under [Constitution v2.0.0](.specify/memory/constitution.md); this file's load-bearing sections are cited from [`docs/architecture.md`](docs/architecture.md) and the implementing specs. |
| [`specs/`](specs/) | Per-feature specs (spec-kit). Once a feature ships, its AS-BUILT and the code are authoritative. |
| [`docs/`](docs/) | [`architecture.md`](docs/architecture.md), [`packages.md`](docs/packages.md), [`tooling.md`](docs/tooling.md), [`workflow-model.md`](docs/workflow-model.md), [`keyboard-index.md`](docs/keyboard-index.md) (every keyboard the project references), [`criteria.md`](docs/criteria.md), [`lint.md`](docs/lint.md), [`accessibility.md`](docs/accessibility.md). |
| [`packages/contracts/`](packages/contracts/) | `@keyboard-studio/contracts`: the shared TypeScript contract and dependency root (types, service interfaces, mocks, zod schemas, criteria catalog). |
| [`packages/engine/`](packages/engine/) | `@keyboard-studio/engine`: codec (`.kmn` to `KeyboardIR` and back), scaffolder, validator, compiler wrapper, simulator, recognizer, strategy selector, pattern library, and output (`.kmp` / `.zip`). |
| [`packages/keyboard-lint/`](packages/keyboard-lint/) | `@keymanapp/keyboard-lint`: the Layer C hygiene lint engine, including the documentation checks. |
| [`packages/glottolog/`](packages/glottolog/) | `@keyboard-studio/glottolog`: offline Glottolog catalog, used to rank candidate starting keyboards from related languages. |
| [`packages/studio/`](packages/studio/) | `@keyboard-studio/studio`: the React + Vite authoring app. |
| [`api/`](api/) | Vercel serverless functions (OAuth, managed PR submission, draft sync, crash reports). Outside the pnpm workspace; kept bundle-safe by [`api/bundle-safety.test.ts`](api/bundle-safety.test.ts). |
| [`content/`](content/) | Pattern library, facet records, survey flows, adaptation questions, recognizer rules, i18n source catalogs. |
| [`utilities/`](utilities/) | Standalone tools kept out of `packages/*`: `spec-trace`, the lint checkers, `facet-index`, `kbgen`, the OAuth backend. |
| [`.claude/`](.claude/) | Claude Code agents and skills for the KM crew. Roster: [`.claude/agents/km-README.md`](.claude/agents/km-README.md). |
| [`CLAUDE.md`](CLAUDE.md) | Orientation for working in this repo with Claude Code. |

Commit and issue titles follow the [keymanapp/keyman](https://github.com/keymanapp/keyman) style;
see [CLAUDE.md](CLAUDE.md#commit-and-issue-title-style). `main` accepts pull requests only, and CI
must pass before merge. Run `pnpm lint` and `pnpm test` locally first.

## Acknowledgements

Keyboard Studio is a project of SIL's Language Technology Use department that began at a
hackathon; it is not an official Keyman project. Keyman began in 1992 and is now developed by the Keyman team at SIL Global. Keyman,
Keyman Developer, and the keyboards repository are the work of that team and many keyboard
authors. Every keyboard this studio starts from was made by one of them. If any idea or code here
is useful to Keyman, we would be glad to see it there.

## License

[MIT](LICENSE).
