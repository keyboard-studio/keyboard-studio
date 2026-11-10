/*
 * Keyman is copyright (C) SIL Global. MIT License.
 *
 * Created by Dr Mark C. Sinclair on 2025-02-25
 *
 * KMC KMN Next Generation Lexer
 *
 * Vendored from keymanapp/keyman developer/src/kmc-kmn/src/ng-compiler/lexer.ts at fb7afff889c26161c8233edb46192dfdb0dec8e6
 */

import { TokenType } from "./token-type.js";
import { KMN_SCAN_RECOGNIZERS, ScanRecognizer } from "./scan-recognizer.js";

// LOCAL PATCH 1 (performance): dispatch on the first character instead of
// trying every recognizer in table order at each position. See PROVENANCE.md.

/** Predicates for the recognizers whose regex does not start with a literal character. */
const FIRST_CHAR_OVERRIDES: Partial<Record<TokenType, (c: string) => boolean>> = {
  [TokenType.STRING]:    (c) => c === "'" || c === '"',
  [TokenType.OCTAL]:     (c) => c >= '0' && c <= '7',
  [TokenType.MODIFIER]:  (c) => /^[sclran]$/i.test(c),
  [TokenType.KEY_CODE]:  (c) => /^[ktua-e]$/i.test(c),
  [TokenType.WHITESPACE]:(c) => /^[^\S\r\n]$/.test(c),
  [TokenType.NEWLINE]:   (c) => c === '\r' || c === '\n',
  [TokenType.DEADKEY]:   (c) => /^d$/i.test(c),
  [TokenType.PARAMETER]: (c) => /^[^=,()[\]\s]$/.test(c),
};

/** Can a match of this recognizer start with the character `c`? */
function firstCharPredicate(recognizer: ScanRecognizer): (c: string) => boolean {
  const override = FIRST_CHAR_OVERRIDES[recognizer.tokenType];
  if (override) return override;
  const src = recognizer.regExp.source;
  const escaped = src[0] === '\\';
  const lit = escaped ? src[1] : src[0];
  if (lit === undefined || !(escaped ? /^[\\$()[\]+.]$/ : /^[A-Za-z&>,!=]$/).test(lit)) {
    // A recognizer added by a re-sync that neither starts with a literal nor has an override.
    throw new Error(`lexer first-character dispatch: no first-character rule for ${recognizer.tokenType}`);
  }
  if (recognizer.regExp.ignoreCase) {
    const lo = lit.toLowerCase();
    const up = lit.toUpperCase();
    return (c) => c === lo || c === up;
  }
  return (c) => c === lit;
}

/**
 * The Next Generation Lexer for the Keyman Keyboard Language.
 *
 * The Lexer identifies Tokens in the supplied buffer using ScanRecognizers.
 *
 */
export class Lexer {
  /** offset into the buffer */
  private offset: number = 0;
  /** the current line number */
  private lineNum: number = 1;
  /** the current character number */
  private charNum: number = 1;
  /** the accumulating tokens */
  private tokenList: Token[] = [];
  /** have we just seen a continuation line? */
  private seenContinuation: boolean = false;
  private scanRecognizers: ScanRecognizer[] = KMN_SCAN_RECOGNIZERS.map((x) => new ScanRecognizer(x.tokenType, x.regExp, x.emit));
  /** the offset in the buffer at which the current line started */
  private lineStart: number = 0;
  /** recognizers that can start with a given character code, in table order (built lazily) */
  private readonly candidates = new Map<number, ScanRecognizer[]>();
  private readonly predicates: Array<(c: string) => boolean> = this.scanRecognizers.map(firstCharPredicate);

  /** The recognizers that can match at a position starting with character code `code`, in table order. */
  private candidatesFor(code: number): ScanRecognizer[] {
    let list = this.candidates.get(code);
    if (list === undefined) {
      const c = String.fromCharCode(code);
      list = this.scanRecognizers.filter((_r, i) => this.predicates[i]!(c));
      this.candidates.set(code, list);
    }
    return list;
  }

  /**
   * Construct a Lexer
   */
  public constructor(
    /** the string to search for tokens */
    private readonly buffer: string,
    /** the filename (for use in the Tokens) */
    private readonly filename: string=null as never,
    /**
     * LOCAL PATCH 2 (trivia callback): called, in source order, for every token the recognizer
     * table marks emit:false (comments, whitespace, continuations). Does not change which
     * tokens are emitted. See PROVENANCE.md.
     */
    private readonly onTrivia?: (token: Token) => void
  ) {
  }

  /**
   * Identify all tokens in the buffer
   *
   * @param addEOF             add an end-of-file token if required
   * @param emitAll            emit all tokens found
   * @param handleContinuation combine continuation lines into a single line
   * @return                   an array of all emitted tokens
   */
  public parse({addEOF=true, emitAll=false, handleContinuation=true}={}): Token[]  {
    while (this.matchToken({addEOF, emitAll, handleContinuation}));
    return this.tokenList;
  }

  /**
   * Match a single token, pushing it onto the lexer tokenList if it is to be emitted
   *
   * @param addEOF             add an end-of-file token if required
   * @param emitAll            whether to emit all tokens found
   * @param handleContinuation whether to combine continuation lines into a single line
   * @return                   whether a matching token was found
   */
  private matchToken({addEOF, emitAll, handleContinuation}:{addEOF:boolean, emitAll:boolean, handleContinuation:boolean}): boolean {
    let   tokenMatch: boolean = false;


    // we cannot handle line continuation if emitAll is true
    // (i.e. emitAll:true => handleContinuation:false)
    if (emitAll) {
      handleContinuation = false;
    }

    // loop over the ScanRecognizers that can start at this character, looking for a match at the offset
    const candidates = this.candidatesFor(this.buffer.charCodeAt(this.offset));
    for (let ri = 0; ri < candidates.length && !tokenMatch; ri++) {
      const recognizer: ScanRecognizer    = candidates[ri]!;
      const emitToken: boolean            = emitAll || recognizer.emit;
      recognizer.regExp.lastIndex         = this.offset;
      const match: RegExpExecArray | null = recognizer.regExp.exec(this.buffer);

      if (match) {
        if (!recognizer.emit && this.onTrivia) {
          this.onTrivia(new Token(recognizer.tokenType, match[0], this.lineNum, this.charNum, undefined, this.filename));
        }
        // the line seen so far is the buffer text from the start of the line to the end of this match
        const matchEnd = this.offset + match[0].length;
        // if handleContinuation is true, no CONTINUATIONs will be emitted,
        // nor will NEWLINEs that follow CONTINUATIONs be emitted
        if (recognizer.tokenType === TokenType.CONTINUATION) {
            if (handleContinuation) {
              this.seenContinuation = true;
            } else if (emitToken) { // not handling continuation and emitting CONTINUATION
              this.tokenList.push(new Token(TokenType.CONTINUATION, match[0], this.lineNum, this.charNum, undefined, this.filename));
            }
        } else if (recognizer.tokenType === TokenType.NEWLINE) {
          if ((handleContinuation && !this.seenContinuation) || !handleContinuation) {
            if (emitToken) { // emitting NEWLINE
              this.tokenList.push(new Token(TokenType.NEWLINE, match[0], this.lineNum, this.charNum, this.buffer.slice(this.lineStart, matchEnd), this.filename));
            }
            this.lineStart = matchEnd; // reset on NEWLINE
          }
          if (handleContinuation) {
            this.seenContinuation = false; // as seen a NEWLINE
          }
        } else if (emitToken) { // emitting other tokens
          this.tokenList.push(new Token(recognizer.tokenType, match[0], this.lineNum, this.charNum, undefined, this.filename));
        }
        tokenMatch  = true;
        this.offset = recognizer.regExp.lastIndex; // advance the buffer offset past the matched token
        if (recognizer.tokenType === TokenType.NEWLINE) {
          this.lineNum += 1;
          this.charNum  = 1;
        } else {
          this.charNum += match[0].length;
        }
      }
    }

    // discard matching empty brackets
    // Empty brackets are simply discarded by the current compiler, and allowing them through to the syntax analyser
    // hugely complicates the grammar. When the Lexer is extended for error handling, it may be that a few more token
    // combinations can be identified and warnings/errors given. Possibilities include mismatched braces, square
    // brackets etc. I included this one at this stage because of an instance in the keyboard repository
    // https://github.com/keymanapp/keyboards/blob/92240aaf75261aa771a019d0eee59a4e58806644/release/sil/sil_senegal_bqj_azerty/source/sil_senegal_bqj_azerty.kmn#L746
    if (!emitAll && (this.tokenList.length >= 2) &&
      this.tokenList.at(-1)!.isTokenType(TokenType.RIGHT_BR) &&
      this.tokenList.at(-2)!.isTokenType(TokenType.LEFT_BR)) {
      // TODO-NG-COMPILER: syntax error or warning for empty brackets
      this.tokenList.pop();
      this.tokenList.pop();
    }

    // TODO-NG-COMPILER: fatal error if this.offset > this.buffer.length

    // add a newline and end-of-file tokens if required
    if (this.offset >= this.buffer.length && addEOF) {
      if (this.offset > this.lineStart) { // add a NEWLINE (with no text) if it is missing from the final line
        this.tokenList.push(new Token(TokenType.NEWLINE, '', 1, 1, this.buffer.slice(this.lineStart, this.offset), this.filename));
        this.lineStart = this.offset;
      }
      this.tokenList.push(new Token(TokenType.EOF, '', 1, 1, undefined, this.filename));
    }

    // return false if there was no match or the buffer is empty
    return tokenMatch && this.offset < this.buffer.length;
  }

  public toString(): string {
    return `{${this.scanRecognizers}}`;
  }
}

/**
 * An input Token found by the Next Generation Lexer for the Parser.
 */
export class Token {
  /**
   * Construct a Token
   */
  public constructor(
    /** the token type */
    public readonly tokenType: TokenType,
    /** the matched text */
    public readonly text: string,
    /** the line number of the matched text, starts from 1 */
    public readonly lineNum: number=1,
    /** the character number of the matched text, starts from 1 */
    public readonly charNum: number=1,
    /** the line of the matched next NEWLINE or null */
    public readonly line: string=null as never,
    /** the filename */
    public readonly filename: string=null as never
  ) {
    // TODO-NG-COMPILER: fatal error if lineNum < 1
    this.lineNum   = (lineNum < 1 ) ? 1 : lineNum;
    // TODO-NG-COMPILER: fatal error if charNum < 1
    this.charNum   = (charNum < 1 ) ? 1 : charNum;
    // TODO-NG-COMPILER: fatal error if line is non-null for non-NEWLINE
    this.line      = (tokenType === TokenType.NEWLINE) ? line : null as never;
  }

  public isTokenType(tokenType: TokenType): boolean {
    return this.tokenType === tokenType;
  }

  public toString(): string {
    let buf: string = `[${this.tokenType}`
    if (this.tokenType !== TokenType.NEWLINE &&
      this.tokenType !== TokenType.EOF &&
      this.tokenType !== TokenType.WHITESPACE) {
      buf = buf.concat(`,${this.text}`);
    }
    buf = buf.concat(']');
    return buf;
  }
}

