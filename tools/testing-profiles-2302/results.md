# #2302 Playwright-CLI walk — results

Round 2 driver: playwright-cli (named session per case) + run-code phase snippets; dev server from ks-2302-walk2 @ ed251e1b (origin/main, PR #2312 merged — backspace as its own axis). Round 1 ran against ks-2302-walk @ d273b398 (PR #2303 build); round-1 detail is preserved under `round1/` and in git history.

Round-2 status counts: NOT-ATTEMPTED 19 · BLOCKED 10 · PASS 3 of 32. (Round 1: PASS 2 · FAIL 0 · BLOCKED 18 · NOT-ATTEMPTED 12.)

| Case | Profile | Backspace | Base | Round 1 | Round 2 | Furthest (R2) | Backspace (R2) | Evidence |
|---|---|---|---|---|---|---|---|---|
| p1-whole-bafut-camqwerty | P1 (postfix/NFD) | whole (off-diag) | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p1-whole-bafut-camqwerty/](evidence/p1-whole-bafut-camqwerty/) |
| p1-unwrap-bafut-camqwerty | P1 (postfix/NFD) | unwrap | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p1-unwrap-bafut-camqwerty/](evidence/p1-unwrap-bafut-camqwerty/) |
| p2-whole-bafut-camqwerty | P2 (prefix/NFC) | whole | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p2-whole-bafut-camqwerty/](evidence/p2-whole-bafut-camqwerty/) |
| p2-unwrap-bafut-camqwerty | P2 (prefix/NFC) | unwrap (off-diag) | sil_cameroon_qwerty | BLOCKED | BLOCKED | mechanisms-stuck-at-? | — | [evidence/p2-unwrap-bafut-camqwerty/](evidence/p2-unwrap-bafut-camqwerty/) |
| p3-whole-bafut-camqwerty | P3 (postfix/NFC) | whole | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p3-whole-bafut-camqwerty/](evidence/p3-whole-bafut-camqwerty/) |
| p3-unwrap-bafut-camqwerty | P3 (postfix/NFC) | unwrap (off-diag) | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p3-unwrap-bafut-camqwerty/](evidence/p3-unwrap-bafut-camqwerty/) |
| p4-whole-bafut-camqwerty | P4 (prefix/NFD) | whole (off-diag) | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p4-whole-bafut-camqwerty/](evidence/p4-whole-bafut-camqwerty/) |
| p4-unwrap-bafut-camqwerty | P4 (prefix/NFD) | unwrap | sil_cameroon_qwerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p4-unwrap-bafut-camqwerty/](evidence/p4-unwrap-bafut-camqwerty/) |
| p1-whole-ewondo-camazerty | P1 (postfix/NFD) | whole (off-diag) | sil_cameroon_azerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p1-whole-ewondo-camazerty/](evidence/p1-whole-ewondo-camazerty/) |
| p1-unwrap-ewondo-camazerty | P1 (postfix/NFD) | unwrap | sil_cameroon_azerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p1-unwrap-ewondo-camazerty/](evidence/p1-unwrap-ewondo-camazerty/) |
| p2-whole-ewondo-camazerty | P2 (prefix/NFC) | whole | sil_cameroon_azerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p2-whole-ewondo-camazerty/](evidence/p2-whole-ewondo-camazerty/) |
| p2-unwrap-ewondo-camazerty | P2 (prefix/NFC) | unwrap (off-diag) | sil_cameroon_azerty | NOT-ATTEMPTED | NOT-ATTEMPTED | not-attempted | — | — |
| p3-whole-ewondo-camazerty | P3 (postfix/NFC) | whole | sil_cameroon_azerty | NOT-ATTEMPTED | NOT-ATTEMPTED | not-attempted | — | — |
| p3-unwrap-ewondo-camazerty | P3 (postfix/NFC) | unwrap (off-diag) | sil_cameroon_azerty | NOT-ATTEMPTED | NOT-ATTEMPTED | not-attempted | — | — |
| p4-whole-ewondo-camazerty | P4 (prefix/NFD) | whole (off-diag) | sil_cameroon_azerty | BLOCKED | NOT-ATTEMPTED | not-attempted | — | [evidence/p4-whole-ewondo-camazerty/](evidence/p4-whole-ewondo-camazerty/) |
| p4-unwrap-ewondo-camazerty | P4 (prefix/NFD) | unwrap | sil_cameroon_azerty | NOT-ATTEMPTED | NOT-ATTEMPTED | not-attempted | — | — |
| p1-whole-bafut-kbdus | P1 (postfix/NFD) | whole (off-diag) | basic_kbdus | BLOCKED | BLOCKED | mechanisms-stuck-at-? | — | [evidence/p1-whole-bafut-kbdus/](evidence/p1-whole-bafut-kbdus/) |
| p1-unwrap-bafut-kbdus | P1 (postfix/NFD) | unwrap | basic_kbdus | PASS | NOT-ATTEMPTED | not-attempted | — | [evidence/p1-unwrap-bafut-kbdus/](evidence/p1-unwrap-bafut-kbdus/) |
| p2-whole-bafut-kbdus | P2 (prefix/NFC) | whole | basic_kbdus | NOT-ATTEMPTED | NOT-ATTEMPTED | not-attempted | — | — |
| p2-unwrap-bafut-kbdus | P2 (prefix/NFC) | unwrap (off-diag) | basic_kbdus | NOT-ATTEMPTED | PASS | mechanisms-complete | proposed whole-stack ✓, answered peel (override), preview ✓ | [evidence/p2-unwrap-bafut-kbdus/](evidence/p2-unwrap-bafut-kbdus/) |
| p3-whole-bafut-kbdus | P3 (postfix/NFC) | whole | basic_kbdus | NOT-ATTEMPTED | NOT-ATTEMPTED | not-attempted | — | — |
| p3-unwrap-bafut-kbdus | P3 (postfix/NFC) | unwrap (off-diag) | basic_kbdus | BLOCKED | BLOCKED | mechanisms-stuck-at-? | proposed whole-stack ✓, answered peel (override), preview ✓ | [evidence/p3-unwrap-bafut-kbdus/](evidence/p3-unwrap-bafut-kbdus/) |
| p4-whole-bafut-kbdus | P4 (prefix/NFD) | whole (off-diag) | basic_kbdus | NOT-ATTEMPTED | PASS | mechanisms-complete | proposed peel ✓, answered whole-stack (override), preview ✓ | [evidence/p4-whole-bafut-kbdus/](evidence/p4-whole-bafut-kbdus/) |
| p4-unwrap-bafut-kbdus | P4 (prefix/NFD) | unwrap | basic_kbdus | PASS | NOT-ATTEMPTED | not-attempted | — | [evidence/p4-unwrap-bafut-kbdus/](evidence/p4-unwrap-bafut-kbdus/) |
| p1-whole-ewondo-kbdfr | P1 (postfix/NFD) | whole (off-diag) | basic_kbdfr | BLOCKED | BLOCKED | mechanisms-stuck-at-? | proposed peel ✓, answered whole-stack (override), preview ✓ | [evidence/p1-whole-ewondo-kbdfr/](evidence/p1-whole-ewondo-kbdfr/) |
| p1-unwrap-ewondo-kbdfr | P1 (postfix/NFD) | unwrap | basic_kbdfr | BLOCKED | BLOCKED | mechanisms-stuck-at-? | — | [evidence/p1-unwrap-ewondo-kbdfr/](evidence/p1-unwrap-ewondo-kbdfr/) |
| p2-whole-ewondo-kbdfr | P2 (prefix/NFC) | whole | basic_kbdfr | NOT-ATTEMPTED | PASS | mechanisms-complete | proposed whole-stack ✓, answered whole-stack, preview ✓ | [evidence/p2-whole-ewondo-kbdfr/](evidence/p2-whole-ewondo-kbdfr/) |
| p2-unwrap-ewondo-kbdfr | P2 (prefix/NFC) | unwrap (off-diag) | basic_kbdfr | BLOCKED | BLOCKED | mechanisms-stuck-at-? | proposed whole-stack ✓, answered peel (override), preview ✓ | [evidence/p2-unwrap-ewondo-kbdfr/](evidence/p2-unwrap-ewondo-kbdfr/) |
| p3-whole-ewondo-kbdfr | P3 (postfix/NFC) | whole | basic_kbdfr | BLOCKED | BLOCKED | mechanisms-stuck-at-? | proposed whole-stack ✓, answered whole-stack, preview ✓ | [evidence/p3-whole-ewondo-kbdfr/](evidence/p3-whole-ewondo-kbdfr/) |
| p3-unwrap-ewondo-kbdfr | P3 (postfix/NFC) | unwrap (off-diag) | basic_kbdfr | NOT-ATTEMPTED | BLOCKED | phase1-failed:pick-base | — | [evidence/p3-unwrap-ewondo-kbdfr/](evidence/p3-unwrap-ewondo-kbdfr/) |
| p4-whole-ewondo-kbdfr | P4 (prefix/NFD) | whole (off-diag) | basic_kbdfr | NOT-ATTEMPTED | BLOCKED | mechanisms-stuck-at-? | — | [evidence/p4-whole-ewondo-kbdfr/](evidence/p4-whole-ewondo-kbdfr/) |
| p4-unwrap-ewondo-kbdfr | P4 (prefix/NFD) | unwrap | basic_kbdfr | NOT-ATTEMPTED | BLOCKED | mechanisms-stuck-at-attachment | — | — |

Per-case detail lives in `results.json` and each case's `evidence/<id>/case-result.json` (round 2; phase JSON + CLI snapshots + logs). Round-1 per-case results are under `round1/evidence/`.
