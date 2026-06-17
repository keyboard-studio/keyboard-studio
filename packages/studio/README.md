# @keyboard-studio/studio

The spec'd authoring SPA. Two-pane layout (survey left, live preview right)
per [spec.md §4](../../spec.md), the §8 phase pipeline, and the §7 strategy
selector. Issues `#22`, `#48`, `#49`, `#51`, `#39` track the buildout.

```sh
pnpm --filter @keyboard-studio/studio dev
```

## When to add code here

Add a component here when:
- It implements something the spec calls for (survey step, gallery card, etc.)
- It's a new piece of the production layout (resizable divider, routing,
  lint chip rail)

The production studio uses the engine's `BaseBrowserService` (GitHub API)
and a CSP-safe artifact-serving backend — no local-clone proxy plumbing.
