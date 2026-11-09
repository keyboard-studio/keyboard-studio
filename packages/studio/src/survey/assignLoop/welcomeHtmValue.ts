/**
 * The Documentation step's authored text, per editable member. `html` is the
 * welcome page (the historic field name). Kept in its own leaf file (the
 * oskLayoutValue.ts precedent) so the gallery module and its renderer can
 * both import the type without a circular dependency.
 */
export interface WelcomeHtmValue {
  html?: string;
  readmeHtm?: string;
  readmeMd?: string;
  helpPhp?: string;
}
