# @keyboard-studio/studio

The spec'd authoring SPA. Two-pane layout (survey left, live preview right)
per [spec.md §4](../../spec.md), the §8 phase pipeline, and the §7 strategy
selector. Issues `#22`, `#48`, `#49`, `#51`, `#39` track the buildout.

**This package is intentionally a thin shell right now.** It's where the
real UI gets built up against the spec, with components migrated /
re-shaped from the POC reference next door.

## POC reference

The working compile-on-the-fly + KMW preview pipeline lives in
[`@keyboard-studio/studio-poc`](../studio-poc/README.md). It boots
end-to-end against the local `keymanapp/keyboards` clone, exercises
`@keymanapp/kmc-kmn` in-browser, and renders KMW's `InlinedOSKView`
inline. Treat it as the integration testbed for the engine's compile
service.

```sh
# the working POC dev interface — picker, in-browser compile, OSK preview
pnpm --filter @keyboard-studio/studio-poc dev

# this shell (empty until the spec'd UI is built)
pnpm --filter @keyboard-studio/studio dev
```

## When to add code here

Add a component here when:
- It implements something the spec calls for (survey step, gallery card, etc.)
- It's been extracted from `studio-poc/src/` and refactored against the
  spec'd UX (e.g. the OSK iframe wrapper)
- It's a new piece of the production layout (resizable divider, routing,
  lint chip rail)

If you find yourself reaching for the proxy plumbing, the path-shim hack,
or the local-keyboards Vite plugin — those are POC scaffolding. Leave
them in `studio-poc/`; the production studio will eventually use a
spec-compliant base-browser service and a CSP-safe artifact-serving
backend.
