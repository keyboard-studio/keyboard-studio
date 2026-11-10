/*
 * Keyman is copyright (C) SIL Global. MIT License.
 *
 * Created by Dr Mark C. Sinclair on 2025-03-13
 *
 * KMC KMN Next Generation Parser (TokenBuffer)
 *
 * Vendored from keymanapp/keyman developer/src/kmc-kmn/src/ng-compiler/token-buffer.ts at fb7afff889c26161c8233edb46192dfdb0dec8e6
 */

import { TokenType } from "./token-type.js";
import { Token } from "./lexer.js";

/**
 * TokenBuffer adds additional methods to the Token array produced
 * by the Lexer, and is used by the Parser
 */
export class TokenBuffer {
  /** index into the Token list (0 <= _currentPosition <= list.length) */
  private _currentPosition: number=0;
  /** end-of-file Token */
  private readonly eof: Token = new Token(TokenType.EOF, "");

/**
 * Construct a TokenBuffer
 */
  public constructor(
    /** the list of Tokens produced by the Lexer */
    private readonly list: Token[],
    /**
     * LOCAL PATCH 3 (performance): an optional window [start, end) of the list,
     * so a caller parsing one line at a time needs no copy of its tokens.
     * Positions stay indices into `list`; `end` plays the part of list.length.
     */
    start: number = 0,
    private readonly end: number = list.length
  ) {
    this._currentPosition = start;
    this.start = start;
  }

  /** LOCAL PATCH 3: the window start (0 for a whole list). */
  private readonly start: number;

  public get currentPosition() { return this._currentPosition; }

  /**
   * The current Token (or EOF when current position is equal to the length of the list)
   *
   * @returns the current token or the EOF token
   */
  public currentToken(): Token {
    return this._currentPosition == this.end ? this.eof : this.list[this._currentPosition] as Token;
  }

  /**
   * Advances the current position without exceeding the length of the list
   */
  public popToken(): void {
    // TODO-NG-COMPILER: consider if a warning is justified for popToken() when we are already at list.length
    this._currentPosition = Math.min(this._currentPosition + 1, this.end);
  }

  /**
   * Resets the current position to the provided one within the range 0 <= save <= list.length
   *
   * @param save the desired current position
   */
  public resetCurrentPosition(save: number): void {
    // TODO-NG-COMPILER: fatal error if save < 0 or > length
    this._currentPosition = Math.min(Math.max(this.start, save), this.end);
  }

  /**
   * The source code (text) represented by the Token list
   *
   * @returns the source code (text)
   */
  public toText(): string {
    let text: string = '';
    for (const token of this.list) {
      text += token.text;
    }
    return text;
  }
}
