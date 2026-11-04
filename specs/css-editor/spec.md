# Feature Specification: CSS editor step

**Feature Branch**: `km/css-editor`

**Created**: 2026-11-03

**Status**: Shipped (as-built)

**Owner**: Studio team

## Purpose

An optional step for authoring the keyboard's custom CSS (`&KMW_EMBEDCSS`
stylesheet, `.css` file in the package). If empty, no `.css` file is written.

## Placement

The `css` step is optional and sits on the manifest spine after the Touch
Gallery (`touch` → `css` → `help`), because CSS affects mostly touch but
possibly the desktop OSK too. The gallery decision module is `customCss`
(`provides: ["custom-css"]`, `requires: ["touch-layout"]`, `screen: "css"`).

## Decisions (Matthew, 2026-11-03)

- Placement is a wizard step after the Touch Gallery (not a packaging panel).
- The step carries a live preview showing both the touch layout and the
  desktop OSK side-by-side, with the custom CSS applied.

## Scope

- Monaco editor for CSS with a `cssCodeLint` contract.
- Live preview: touch layout and desktop OSK side-by-side (or toggleable).
- Skip path: "No custom CSS (skip)" records empty CSS; Continue passes
  `{ css }` via `onComplete` for the output pipeline.
