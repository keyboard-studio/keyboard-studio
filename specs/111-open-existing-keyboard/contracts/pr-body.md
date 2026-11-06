# Contract: PR body blocks for Open (studio)

Owner: Engine (assembly). Content owns the wording. Appended to the body array in `ManagedPRSubmitPanel.tsx` after the decision summary, on Open only.

## Source block (always on Open)

```markdown
### Updated from
- Repository: keymanapp/keyboards @ `<short sha>`
- Path: `release/sil/sil_cameroon_qwerty`
- Version: 6.0.4 → 6.0.5
```

When the author picked upstream over a curated studio copy, add:

```markdown
- Note: replaces the curated keyboard-studio/keyboards copy (`<short sha>`).
```

## Review block (only when there are notes or inherited failures)

```markdown
### Criteria review
**Kept despite a new failure** (author's reasons):
- 18.15 Touch and desktop produce the same characters: "<note text>"

**Inherited** (failing before this update; not introduced here):
- 5.5b README links to the keyboard's Keyman page
- 7.28 Cased-script keyboard declares &CasedKeys
```

## Rules

- Notes are quoted as written. Markdown in a note is escaped so it can't break the block.
- Criteria are named by id and their short description from `criteria.json`, not the lint code.
- A criterion that is failing and has no note can't appear here, because the submit gate blocks it (FR-027).
