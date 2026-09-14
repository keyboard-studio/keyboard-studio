# Contract: Standard help-site header (spec 076, US1 / FR-003)

The exact header block a non-inherited `source/help/<id>.php` MUST begin with.
Format verified against the corpus (e.g. `release/a/ahom_star/source/help/ahom_star.php`,
`release/a/akha_lahu/source/help/akha_lahu.php`):

```php
<?php
  $pagename = '<Display Name> Keyboard Help';
  $pagetitle = $pagename;
  require_once('header.php');
?>
```

Rules:

- **Page name** = `<Display Name> Keyboard Help` where `<Display Name>` is the
  keyboard's display name (criterion 11.7 format). If the display name already ends
  with the word "Keyboard" (case-insensitive), emit `<Display Name> Help` to avoid
  "Keyboard Keyboard".
- **Page title** = `$pagename` (assign the variable, not a second string literal).
- **Escaping**: the display name is PHP-single-quote-escaped (`'` → `\'`, `\` → `\\`)
  — free-text safety per spec 061 FR-009 (spec edge case: names needing escaping).
- The header is followed by the rendered documentation body — the SAME body the
  welcome page renders (spec 061 FR-005 parity; FR-004 permits only the header and the
  welcome layout section to differ).
- **Placeholder productions** (description unanswered): the header still ships, above
  the placeholder body (acceptance scenario US1-3). This changes the current behavior
  where `renderHelpPhp` returns a bare `<?php /* <name> help */ ?>` stub — the stub
  body is kept, the header is added.
- **Inherited help pages** (Track 2 with a base help page): untouched — base header
  and body preserved, answers appended below the merge boundary, no second header
  (US1-2 / FR-003). Detection: a base help text is present ⇒ merge path; header
  injection happens only on the fresh-document path (`buildFreshHtmlDoc` analogue for
  PHP).
- The tool emits the `require_once('header.php')` include reference only; it never
  bundles or emulates the include (spec assumption).

Determinism: header emission is a pure function of the display name (SC-004).
