# Spec 111 handoff (2026-11-06)

Branch `111-open-existing-keyboard`, PR #2519 (open, do not merge unasked).

## State of the branch

- **Pushed (2026-11-06):** everything up to `37fb9aa4`. The golden-walk check passed: `test.kvks` and `test.kpj` differ only by CR, and `HISTORY.md` only by its normalised date. Copy's output is unchanged. The two agent worktrees below have been removed.
- `37fb9aa4` is the merge of the revised Open walk (`744c88b8`, tasks T062-T066).
  - Verified on it: `pnpm build` green; vitest contracts 1085, engine 5011, keyboard-lint 586, studio 11400 passed; `pnpm lint` 0 errors; desktop e2e 13 passed.
  - **One open check:** the golden walk failed on `source/test.kvks` and `test.kpj`. Before this merge that was CRLF-only noise from the Windows checkout. Confirm it still is before pushing:
    1. Copy `e2e/fixtures/golden-walk/basic-kbdfr-copy.zip` aside.
    2. Run with `GOLDEN_WALK_CAPTURE=1`.
    3. Unzip both and `diff --strip-trailing-cr` the two files.
    4. `git checkout --` the zip.
  - The merge moved Copy's `project_name` rejoin target to `open_languages` (gated off on Copy), so a real Copy change is possible.
- **Push:** `git push origin 111-open-existing-keyboard`. The pre-push hook runs `pnpm lint`; never `--no-verify`.
- **Worktrees:** `.claude/worktrees/agent-a8d437e825d42f227` and `agent-aa32816cd54d7e0dc` are merged and can be removed (`git worktree remove`). `.claude/worktrees/keyboards` is a symlink to `C:/Github/keyboards` that the agents made. `../keyboard-studio-golden` (branch `km/fix-golden-walk-html-step`) is an older merged worktree.
- **Port 5273:** the owner's own `pnpm dev` for the main checkout. Do not kill it; e2e reuses it.

## What shipped on this branch this session (all spec 111)

- **Start screen** (FR-001): New leads, Open follows, reachable from the nav wordmark. The Copy walk no longer offers Open.
- **Open walk** (US8, FR-021 amended, FR-031..034, T056-T066):
  - Languages → Letters → Upgrades (only if needed) → Mechanisms (not on basic_) → OSK → Touch gallery → CSS → Documentation (only if needed) → Review (criteria) → Output.
  - Order comes from module requires/provides. Gates read the derived decisions `open-issues` and `open-basic-keyboard`.
- **Upgrades:**
  - 7.28 cased keys.
  - 18.16 full Capsifesto touch caps (rightalt-caps, ctrl-caps, one-shot Shift, `*Shifted*` / `*ShiftedLock*`).
  - 18.17 Ctrl/RAlt touch keys.
  - 18.18 symbols layer from the owner's `symbols.json`.
  - Layer ids follow Keyman's standard names: Ctrl+Shift is `shift-ctrl` (`packages/contracts/src/ir/touchLayerRules.ts`).
- **Cased keys:** a key joins `&CasedKeys` when its Caps output is its Shift output, so AZERTY digits count. The caps comparison blocks any old Caps output that diverged in a non-case way. This applies to Copy too (FR-030 amended).
- **Criteria:**
  - 18.6 treats composed and decomposed forms as equal.
  - The Open expected inventory is the main exemplar tier only.
  - Missing letters are grouped by language, with Remove language.
- **Basic keyboards:** `basic_*` physical layouts are frozen (`packages/studio/src/lib/basicKeyboard.ts`).
- **Build fixes:**
  - The `/api` tsconfig states module/target, so Vercel stops forcing NodeNext and strict:false.
  - The duplicate husky `prepare` was removed. The installer clears a stale `core.hooksPath`.
  - Vendored Keyman type-only aliases were converted to `type`.
  - The sourcemap warning filter was added.

## Next: Ctrl and removal rules (spec 111 FR-035..FR-040, tasks T070-T077)

Owner rulings, recorded in `spec.md` under "Ctrl" and "Removing letters":

- Outside `basic_*`, raw unsided `CTRL` (no Alt) on letter, number or punctuation keys is reported:
  - The finding recommends moving off Ctrl and warns the keyboard may not be accepted.
  - Ctrl+Space (special spaces) is not reported.
- **Fix:** splice out those Ctrl rules and return their characters to the inventory unplaced. Mechanisms, which follows Upgrades in the walk, places them.
- **No new Ctrl content or layers** on either path. A copied `basic_*` keyboard keeps its Ctrl rules unless their letters are carved.
- `LCTRL` / `RCTRL` are allowed, with an advisory to prefer Alt.
- **Removing a letter a listed language needs** (main exemplar tier) shows a dismissable warning naming the language, on both paths.
- **Still awaiting the owner:**
  - FR-039 / T074: `CTRL ALT` → `RALT` upgrade with whole-keyboard modifier conversion.
  - T075: rename the 11 `basic_*` touch `ctrl` layers that hold RALT content to `rightalt`.
- **Evidence:**
  - Keyman core `core/src/kmx/kmx_modifiers.cpp` `states` table: `CTRL ALT` matches AltGr (LCtrl+RAlt) and also plain left Ctrl+Alt.
  - On a Mac, Control maps to `CTRL`, and Command is never processed (`mac/.../CoreHelper.m`).
  - Corpus census: 131 keyboards type on raw Ctrl, and 31 have Ctrl-only output.
    - By key: number row 18 (mostly ZWJ/ZWNJ/LRM/RLM and ₹), letters 11 (mostly Arabic-script), Space 5 (NBSP, thin space).
    - Likely false positives: ASCII digits that fall through to the base layout, and esperanto_sava_eujao.

**Proposed route (owner has not yet chosen):** move FR-035..FR-040 and T070-T077 into a new spec (`specs/1NN-...`, check `gh pr list --state open` for free numbers), leave a pointer in spec 111, then run `/speckit-plan`, `/speckit-tasks` via `python3 scripts/speckit_rounds_goat.py specs/1NN-...` in fresh sessions.

- **Why not rerun them on spec 111:** `speckit-tasks` would regenerate `tasks.md` and drop Phases 1-13.
- **Also:** the driver reports spec 111 as complete, so it would do nothing.
- **The other option:** reset its status and run them with append-only instructions.

## Other open items

- **T055:** about 25 non-CI e2e specs still call `chooseAdaptTrack` (which throws). Convert them to open from the start screen.
- **PR #2519 description** does not yet mention the start screen, the Open walk or the upgrades.
- **Walk-agent notes needing an owner call:**
  - A `basic_*` keyboard with no missing letters never shows Letters, so its author cannot add touch-only characters.
  - The Tools menu no longer lists Mechanisms or Touch on Open.
  - Mechanisms on Open only offers inventory characters not yet typed.
- **Infographic** "Open vs Copy Paths" (https://claude.ai/artifact/AYxRNW81DyN1Dcq6ZF3Hjt) matches the walk as decided.

## Working rules the owner gave this session

- Walk order is pinned by inputs and outputs, not literal test sequences. "Copy unchanged" means its outputs (golden walk).
- Ask before building in a session the owner says is too long. Do not merge PRs unasked.
- `basic_*` physical layouts never change. Their touch, docs and project structure may be upgraded, and so may how Caps is written, provided output is identical.
