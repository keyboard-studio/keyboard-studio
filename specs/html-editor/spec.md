# Feature Specification: HTML editor step

**Feature Branch**: `km/html-editor`

**Created**: 2026-11-03

**Status**: Shipped (as-built)

**Owner**: Studio team

## Purpose

The author edits the keyboard's user manual (`welcome.htm`) directly.
`readme.htm`, `README.md`, and the `.php` help page are generated exports
from this source — they are not edited here.

## Placement

The `html` step sits after the documentation questions (Phase F, `helpStep`),
near the end of the flow, before `packageStep` (`help` → `html` → `package`).
The gallery decision module is `welcomeHtm` (`provides: ["welcome-htm"]`,
`requires: ["help-docs"]`, `screen: "html"`).

## Decisions (Matthew, 2026-11-03)

- Placement is after the documentation questions, before the package step.
- The `.htm` files are **HTML**, not Markdown (verified across
  keymanapp/keyboards: `akan`, `basic_kbdus`, `khmer_angkor` all start with
  `<!DOCTYPE html>`). The editor is HTML-mode, not Markdown-mode.

## Scope

- Monaco editor in HTML mode for `welcome.htm`, with an HTML tag validator.
- Preview renders the HTML directly.
- Out of scope: editing `readme.htm`, `README.md`, or `.php` (generated).
