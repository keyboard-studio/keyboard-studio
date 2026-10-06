---
name: spec-extraction
description: Rules for extracting a spec.md section into specs/NNN-<slug>/ or creating a new feature spec folder — which sections extract, how NNN is numbered, and who owns spec drift. Use before extracting a section or choosing a new spec number.
---

# Section extraction — don't shred the architecture

The monolithic `spec.md` is migrating into `specs/NNN-<slug>/` folders one numbered section at a
time, where `NNN` mirrors the spec.md section number (e.g. `specs/007-strategy-selection/` for
§7). **The extracted folder is authoritative for its section once landed; `spec.md` keeps a stub
pointer.** Sections not yet extracted remain authoritative in `spec.md`. Extracted so far: §7
(pilot), §8, §5 (Pattern schema).

Only *feature / contract* sections extract. The **architecture-core** sections — §4 (system
overview), §5a (KeyboardIR spine), §9 (routing), §10 (validator layering), §11 (criteria model),
§12/§13 (output + team boundaries) — describe how the whole tool composes; they are **not**
features and stay authoritative in `spec.md`, composed in
[docs/architecture.md](../../../docs/architecture.md). (§8 Data flow was extracted before this
rule; it is the meta-flow and is treated as architecture-core wherever its text lives.) The
reference-only sections (§14, §17, §18, §19) are not planned for extraction.

When deciding whether to extract: *feature/contract → `specs/NNN`; architecture/meta-flow → stays,
composed in `docs/architecture.md`; reference → stays.*

**New features still get their own `specs/NNN-<slug>/`** with a creation-order `NNN`, and **cite
the governing `spec.md §X`** (or its extracted folder) rather than re-deriving scope. The
mirror-numbering convention applies only to sections being extracted; new features pick the next
free `NNN` above the extracted-section range.

**Open PRs claim numbers before `main` sees them.** The `before_specify` hook and
`spec-number-lint` only scan folders already merged, so two in-flight specs can pick the same
`NNN`. Before choosing one, check open PRs too:
`gh pr list --state open --json number,title,headRefName`. Skip any number an open PR's title or
branch already uses.

**Drift split:** `utilities/spec-trace` owns textual drift of the spec corpus — the monolith's
sections, the extracted feature specs, and `docs/architecture.md`; it hashes each unit and flags
un-acknowledged changes (`node utilities/spec-trace check|report|acknowledge`).
`/speckit-analyze` owns per-feature `spec ↔ plan ↔ tasks` consistency. Do **not** install
spec-kit's "Spec Trace" community extension — it duplicates the existing utility.
