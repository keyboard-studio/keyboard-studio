---
name: issue-closure
description: Reconcile a tracked issue's acceptance-criteria checkboxes against what shipped before writing `closes #N` or `refs #N` in a PR or commit. Use at PR open (km-archivist) or on any commit that touches a tracked issue.
---

# Issue closure policy

When a cycle lands work that touches a tracked issue (`#N`), the closing specialist — usually
`km-archivist` at PR open, but also `/km-lead` for direct-to-main commits — must reconcile what
shipped against the issue's acceptance-criteria checkboxes:

1. **Enumerate the AC checkboxes.** `gh issue view N --json body` and walk the `- [ ]` list. If
   the issue has no checkboxes, this policy does not apply.
2. **Verify each one against the diff.** A checkbox is *done* only if the shipped change actually
   satisfies it — not if "we meant to" or "it's covered by another PR". Run the relevant command,
   read the relevant file, or call the relevant specialist (typically `km-verification`).
3. **Check the boxes that are done.** `gh issue edit N --body "<updated>"` with the verified boxes
   flipped. Leave a one-line note explaining which flipped and which didn't.
4. **Pick the right closing keyword.** All boxes checked → `closes #N`. Some still open →
   `refs #N`, and the issue stays open. Do not check boxes you haven't verified.

An issue with half its checkboxes flipped is more honest than one closed prematurely or one left
fully unchecked despite real progress. Partial closures are normal; **silent** partial closures
are the bug.
