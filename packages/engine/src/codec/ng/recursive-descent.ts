/*
 * Keyman is copyright (C) SIL Global. MIT License.
 *
 * Created by Dr Mark C. Sinclair on 2025-03-13
 *
 * KMC KMN Next Generation Parser (Recursive Descent/Kleene Operator Rules)
 *
 * Vendored from keymanapp/keyman developer/src/kmc-kmn/src/ng-compiler/recursive-descent.ts at fb7afff889c26161c8233edb46192dfdb0dec8e6
 */

import { TokenType } from "./token-type.js";
import { Token } from "./lexer.js";
import { TokenBuffer } from "./token-buffer.js";
import { NodeType } from "./node-type.js";
import { ASTNode } from "./tree-construction.js";
import { TOKEN_TO_NODE } from "./token-to-node.js";
import { ASTRebuild } from "./ast-rebuild.js";

/**
 * LOCAL PATCH 3 (performance): FIRST-set prediction.
 *
 * The token types a rule can start with, and whether it can succeed without
 * consuming a token. `tokens: null` means "unknown, may start with anything":
 * it is the answer for any rule class whose parse() is not one of the
 * combinators below, so prediction never skips a rule that could succeed.
 */
export interface FirstSet {
  readonly nullable: boolean;
  readonly tokens: ReadonlySet<TokenType> | null;
}

/** A rule that may start with anything (unknown parse, or a cycle). */
const ANY_FIRST: FirstSet = { nullable: true, tokens: null };
/** A rule that can never succeed (no child rule, or no child rules). */
const NEVER_FIRST: FirstSet = { nullable: false, tokens: new Set<TokenType>() };

/** Union of FIRST sets: of a sequence's prefix (`all` nullable) or of alternatives. */
function unionFirst(sets: FirstSet[], nullable: boolean): FirstSet {
  const tokens = new Set<TokenType>();
  for (const s of sets) {
    if (s.tokens === null) return { nullable, tokens: null };
    for (const t of s.tokens) tokens.add(t);
  }
  return { nullable, tokens };
}

/**
 * Rule is the abstract base class of all the recursive-descent
 * syntax analyzer rules.
 */
export abstract class Rule { // equivalent to a no-child rule
  /**
   * LOCAL PATCH 3: when false, the combinators try every alternative as
   * upstream does. Only the parser equivalence test turns it off.
   */
  public static prediction: boolean = true;

  private firstCache: FirstSet | undefined = undefined;
  private firstBusy: boolean = false;

  /**
   * Parse the tokenBuffer, building it into an abstract syntax tree (AST).
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if this rule was successfully parsed
   */
  public abstract parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean;

  /** LOCAL PATCH 3: this rule's FIRST set, computed once (the rule graph is fixed after construction). */
  public first(): FirstSet {
    if (this.firstCache !== undefined) return this.firstCache;
    if (this.firstBusy) return ANY_FIRST; // cycle guard: conservative
    this.firstBusy = true;
    try {
      this.firstCache = KNOWN_PARSE.has(this.parse) ? this.computeFirst() : ANY_FIRST;
    } finally {
      this.firstBusy = false;
    }
    return this.firstCache;
  }

  /** LOCAL PATCH 3: the set to test, or null when the rule may start with anything (filled on first use). */
  private startTokens: ReadonlySet<TokenType> | null | undefined = undefined;

  /** LOCAL PATCH 3: true unless this rule certainly fails on a token of this type. */
  public mayStartWith(tokenType: TokenType): boolean {
    let tokens = this.startTokens;
    if (tokens === undefined) {
      const f = this.first();
      tokens = this.startTokens = f.nullable ? null : f.tokens;
    }
    return tokens === null || tokens.has(tokenType);
  }

  /** LOCAL PATCH 3: FIRST set for a rule whose parse() is the class's own combinator parse. */
  protected computeFirst(): FirstSet {
    return ANY_FIRST;
  }
}

/**
 * SingleChildRule is the abstract base class of all the recursive-descent
 * syntax analyzer rules with a single child.
 */
export abstract class SingleChildRule extends Rule {
  /**
   * Construct a SingleChildRule
   */
  public constructor(
    /** the single child rule */
    protected rule: Rule=null as never
  ) {
    super();
  }

  /**
   * Parse the tokenBuffer, building it into an abstract syntax tree (AST).
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if this rule was successfully parsed (null if there is no rule)
   */
  public parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    // TODO-NG-COMPILER: fatal error if rule is null
    return this.rule?.parse(tokenBuffer, node) ?? false;
  }

  protected override computeFirst(): FirstSet {
    return this.rule != null ? this.rule.first() : NEVER_FIRST;
  }
}

/**
 * SingleChildRuleWithASTRebuild is the abstract base class of all the
 * recursive-descent syntax analyzer rules with a single child that use
 * an ASTRebuild to rebuild the tree after a successful parse.
 */
export abstract class SingleChildRuleWithASTRebuild extends SingleChildRule {
  /**
   * Construct a SingleChildRuleWithASTRebuild
   */
  public constructor(
    /** the strategy used on the tree after a successful parse */
    protected readonly strategy: ASTRebuild,
    /** the single child rule */
    rule: Rule=null as never
  ) {
    super(rule);
  }

  /**
   * Parse the rule and, if successful, apply the ASTRebuild
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if this rule was successfully parsed
   */
  public override parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    // LOCAL PATCH 3 (performance): with prediction on, one scratch node per rule
    // instance. The rule graph is a tree built by constructors, so an instance is
    // never active twice at once, and the parent only takes the scratch node's
    // children (every ASTRebuild returns the node it is given).
    const tmp: ASTNode = Rule.prediction ? (this.scratch ??= new ASTNode()) : new ASTNode();
    tmp.truncateChildren(0);
    // TODO-NG-COMPILER: fatal error if rule is null
    const parseSuccess: boolean = this.rule?.parse(tokenBuffer, tmp) ?? false;
    if (parseSuccess) {
      const rebuilt = this.strategy.apply(tmp);
      node.addChildrenOf(rebuilt);
      if (rebuilt !== tmp) this.scratch = undefined; // a strategy kept the node: never reuse it
    }
    tmp.truncateChildren(0);
    return parseSuccess;
  };

  /** LOCAL PATCH 3: the reusable temporary node (see parse). */
  private scratch: ASTNode | undefined = undefined;
}

/**
 * MultiChildRule is the abstract base class of all the recursive-descent
 * syntax analyzer rules with multiple children.
 */
export abstract class MultiChildRule extends Rule {
  /**
   * Construct a MultiChildRule
   */
  public constructor(
    /** the array of child rules */
    protected rules: Rule[]
  ) {
    // TODO-NG-COMPILER fatal error if rules is null
    super();
  }
}

/**
 * SequenceRule represents sequential rules in the recursive-descent
 * syntax analyzer (rules eparated by spaces in the BNF).
 */
export class SequenceRule extends MultiChildRule {
  /**
   * Parse each rule in turn, succeeding only if all succeed.
   * In the event of failure, reset the tokenBuffer to the position
   * saved at the start of the attempted parse.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if this rule was successfully parsed
   */
  public parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    // TODO-NG-COMPILER: fatal error if rules is null or empty
    if (!this.rules?.length) {
      return false;
    }

    // LOCAL PATCH 3: nothing is consumed yet, so failing here needs no reset
    if (Rule.prediction && !this.mayStartWith(tokenBuffer.currentToken().tokenType)) {
      return false;
    }

    const save = tokenBuffer.currentPosition;

    if (!Rule.prediction) {
      const tmp = new ASTNode();
      for (const rule of this.rules) {
        if (!rule.parse(tokenBuffer, tmp)) {
          tokenBuffer.resetCurrentPosition(save);
          return false;
        }
      }
      node.addChildrenOf(tmp);
      return true;
    }

    // LOCAL PATCH 3: build straight into node and roll back on failure
    // (same children, in the same order, as building into a temporary node)
    const mark = node.childCount;
    for (const rule of this.rules) {
      if (!rule.parse(tokenBuffer, node)) {
        node.truncateChildren(mark);
        tokenBuffer.resetCurrentPosition(save);
        return false;
      }
    }
    return true;
  }

  protected override computeFirst(): FirstSet {
    if (!this.rules?.length) return NEVER_FIRST;
    const prefix: FirstSet[] = [];
    for (const rule of this.rules) {
      const f = rule.first();
      prefix.push(f);
      if (!f.nullable) return unionFirst(prefix, false);
    }
    return unionFirst(prefix, true);
  }
}

/**
 * AlternateRule represents alternative rules in the recursive-descent
 * syntax analyzer (rules eparated by '|' in the BNF).
 */
export class AlternateRule extends MultiChildRule {
  /**
   * Parse each rule in turn, succeeding if any succeed. In the event of failure,
   * reset the tokenBuffer to the position saved at the start of the attempted parse.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if this rule was successfully parsed
   */
  public parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    const save = tokenBuffer.currentPosition;
    let tmp: ASTNode;

    // TODO-NG-COMPILER: fatal error if rules is null or empty
    if (!this.rules?.length) {
      return false;
    }

    if (!Rule.prediction) {
      for (const rule of this.rules) {
        tmp = new ASTNode();
        if (rule.parse(tokenBuffer, tmp)) {
          node.addChildrenOf(tmp);
          return true;
        }
      }
      tokenBuffer.resetCurrentPosition(save);
      return false;
    }

    // LOCAL PATCH 3: only the alternatives that can start with the current token, in order,
    // each built straight into node and rolled back on failure
    const mark = node.childCount;
    for (const rule of this.candidatesFor(tokenBuffer.currentToken().tokenType)) {
      if (rule.parse(tokenBuffer, node)) {
        return true;
      }
      node.truncateChildren(mark);
    }

    tokenBuffer.resetCurrentPosition(save);
    return false;
  }

  /** LOCAL PATCH 3: per-token-type candidate lists, built lazily, in table order. */
  private readonly candidates = new Map<TokenType, Rule[]>();

  private candidatesFor(tokenType: TokenType): Rule[] {
    let list = this.candidates.get(tokenType);
    if (list === undefined) {
      list = this.rules.filter((rule) => rule.mayStartWith(tokenType));
      this.candidates.set(tokenType, list);
    }
    return list;
  }

  protected override computeFirst(): FirstSet {
    if (!this.rules?.length) return NEVER_FIRST;
    const sets = this.rules.map((rule) => rule.first());
    return unionFirst(sets, sets.some((s) => s.nullable));
  }
}

/**
 * OptionalRule represents optional rules in the recursive-descent
 * syntax analyzer ('?' in the BNF).
 */
export class OptionalRule extends SingleChildRule {
  /**
   * Construct an OptionalRule
   */
  public constructor(
    /** the optional single child rule */
    rule: Rule
  ) {
    super(rule);
  }

  /**
   * Parses the stored rule, always succeeding as the rule is optional.
   * In the event of failure of the stored rule, reset the tokenBuffer
   * to the position saved at the start of the attempted parse.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true
   */
  public override parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    // TODO-NG-COMPILER: fatal error if rule is null
    if (this.rule == null) {
      return false;
    }

    const save = tokenBuffer.currentPosition;

    if (Rule.prediction) {
      // LOCAL PATCH 3: skip a certain failure; otherwise build into node, rolling back on failure
      if (this.rule.mayStartWith(tokenBuffer.currentToken().tokenType)) {
        const mark = node.childCount;
        if (!this.rule.parse(tokenBuffer, node)) {
          node.truncateChildren(mark);
          tokenBuffer.resetCurrentPosition(save);
        }
      }
      return true;
    }

    const tmp  = new ASTNode();

    if (this.rule.parse(tokenBuffer, tmp)) {
      node.addChildrenOf(tmp);
    } else {
      tokenBuffer.resetCurrentPosition(save);
      // TODO-NG-COMPILER generate warning as parse returns true
    }

    return true;
  }

  protected override computeFirst(): FirstSet {
    return this.rule == null ? NEVER_FIRST : { nullable: true, tokens: this.rule.first().tokens };
  }
}

/**
 * ManyRule represents 'many' rules in the recursive-descent
 * syntax analyzer ('*' in the BNF).
 */
export class ManyRule extends SingleChildRule {
  /**
   * Construct a ManyRule
   */
  public constructor(
    /** the single child rule */
    rule: Rule
  ) {
    super(rule);
  }

  /**
   * Parses the stored rule as many times as possible, always succeeding
   * as the rule is optional. In the event of failure of the stored rule,
   * reset the tokenBuffer to the position saved at the start of that
   * individual attempt to parse.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true
   */
  public override parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    // TODO-NG-COMPILER: fatal error if rule is null
    if (this.rule == null) {
      return false;
    }

    if (Rule.prediction) {
      // LOCAL PATCH 3: stop at a certain failure; build into node, rolling back a failed attempt
      while (this.rule.mayStartWith(tokenBuffer.currentToken().tokenType)) {
        const save = tokenBuffer.currentPosition;
        const mark = node.childCount;
        if (!this.rule.parse(tokenBuffer, node)) {
          node.truncateChildren(mark);
          tokenBuffer.resetCurrentPosition(save);
          break;
        }
      }
      return true;
    }

    while (true) {
      const save = tokenBuffer.currentPosition;
      const tmp  = new ASTNode();

      if (this.rule.parse(tokenBuffer, tmp)) {
        node.addChildrenOf(tmp);
      } else {
        tokenBuffer.resetCurrentPosition(save);
        break;
      }
    }
    return true;
  }

  protected override computeFirst(): FirstSet {
    return this.rule == null ? NEVER_FIRST : { nullable: true, tokens: this.rule.first().tokens };
  }
}

/**
 * OneOrManyRule represents one-or-many rules in the recursive-descent
 * syntax analyzer ('+' in the BNF).
 */
export class OneOrManyRule extends SingleChildRule {
  /**
   * Construct a OneOrManyRule
   */
  public constructor(
    /** the single child rule */
    rule: Rule
  ) {
    super(rule);
  };

  /**
   * Parses the stored rule as many times as possible, succeeding if the
   * rule suceeds at least once. In the event of failure of the stored rule,
   * reset the tokenBuffer to the position saved at the start of that
   * individual attempt to parse.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true
   */
  public override parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    // TODO-NG-COMPILER: fatal error if rule is null
    let anyParseSuccess: boolean = false;

    if (Rule.prediction) {
      if (this.rule == null) {
        return false;
      }
      // LOCAL PATCH 3: stop at a certain failure; build into node, rolling back a failed attempt
      while (this.rule.mayStartWith(tokenBuffer.currentToken().tokenType)) {
        const save = tokenBuffer.currentPosition;
        const mark = node.childCount;
        if (!this.rule.parse(tokenBuffer, node)) {
          node.truncateChildren(mark);
          tokenBuffer.resetCurrentPosition(save);
          break;
        }
        anyParseSuccess = true;
      }
      return anyParseSuccess;
    }

    do {
      const save = tokenBuffer.currentPosition;
      const tmp  = new ASTNode();
      if (this.rule?.parse(tokenBuffer, tmp)) {
        node.addChildrenOf(tmp);
        anyParseSuccess = true;
      } else {
        tokenBuffer.resetCurrentPosition(save);
        break;
      }
    } while (true);
    return anyParseSuccess;
  }

  protected override computeFirst(): FirstSet {
    return this.rule == null ? NEVER_FIRST : this.rule.first();
  }
}

/**
 * TokenRule represents a Token (terminal) in the BNF.
 */
export class TokenRule extends Rule {
  /** mapping from the TokenType to a NodeType to use in the AST */
  private static tokenToNodeMap: Map<TokenType, NodeType>;

  /**
   * Construct a TokenRule
   */
  public constructor(
    /** the TokenType to potentially match */
    private readonly tokenType: TokenType,
    /** whether to add an ASTNode if the rule succeeds */
    private readonly addNode=false
  ) {
    super();
  }

  private static tokenToNode = TOKEN_TO_NODE;

  static {
    TokenRule.tokenToNodeMap = new Map<TokenType, NodeType>();
    for (const map of TokenRule.tokenToNode) {
      TokenRule.tokenToNodeMap.set(map.tokenType, map.nodeType);
    }
  }

  /**
   * Parse the current token looking to match the stored TokenType.
   * If matched, the rule succeeds.  Moreover, if adding an ASTNode has
   * been requested (addNode), and there is a valid mapping from the
   * TokenType to a NodeType, then add the ASTNode. If there is no match,
   * reset the tokenBuffer to the position saved at the start of the method.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if this rule was successfully parsed
   */
  public parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    const token = tokenBuffer.currentToken();

    if (token.isTokenType(this.tokenType)) {
      tokenBuffer.popToken();
      if (this.addNode) {
        const nodeType = TokenRule.tokenToNodeMap.get(token.tokenType);
        if (nodeType !== undefined) {
          node.addChild(new ASTNode(nodeType, token));
          // TODO-NG-COMPILER: warning if there is no valid mapping
        }
      }
      return true;
    }

    return false;
  }

  public static getNodeType(tokenType: TokenType): NodeType {
    return TokenRule.tokenToNodeMap.get(tokenType) as NodeType;
  }

  protected override computeFirst(): FirstSet {
    return { nullable: false, tokens: new Set<TokenType>([this.tokenType]) };
  }
}

/**
 * AlternateTokenRule is an optimisation of an AlternateRule where
 * the rules array would consist entirely of TokenRules (all with the
 * same addNode setting). Instead, the TokenType of the current token
 * is directly compared against a supplied array of TokenType looking
 * for the first match.
 */
export class AlternateTokenRule extends Rule {
  /** a Set of TokenType to be potentially matched */
  private readonly tokenTypes: Set<TokenType>;

  /**
   * Construct an AlternateTokenRule
   */
  public constructor(
    /** the array of TokenType to be potentially matched */
    tokenTypes: TokenType[],
    /** whether to add an ASTNode if the rule succeeds */
    private readonly addNode: boolean=false
  ) {
    super();
    // a Set is used to avoid unnecessary duplicates
    this.tokenTypes = new Set<TokenType>(tokenTypes);
    // TODO-NG-COMPILER: warning if there is a duplicate TokenType in the supplied array
  }

  /**
   * Check if the current TokenType is included in the tokenTypes Set.
   * If so, the rule succeeds. Moreover, if adding an ASTNode has
   * been requested (addNode), and there is a valid mapping from the
   * TokenType to a NodeType, then add the ASTNode. If there is no match,
   * reset the tokenBuffer to the position saved at the start of the method.
   *
   * @param tokenBuffer the TokenBuffer to parse
   * @param node where to build the AST
   * @returns true if the current token was successfully matched
   */
  public parse(tokenBuffer: TokenBuffer, node: ASTNode): boolean {
    const token = tokenBuffer.currentToken();

    if (this.tokenTypes.has(token.tokenType)) {
      tokenBuffer.popToken();
      if (this.addNode) {
        const nodeType = TokenRule.getNodeType(token.tokenType);
        if (nodeType !== undefined) {
          node.addChild(new ASTNode(nodeType, token));
          // TODO-NG-COMPILER: warning if there is no valid mapping
        }
      }
      return true;
    }

    return false;
  }

  protected override computeFirst(): FirstSet {
    return { nullable: false, tokens: this.tokenTypes };
  }
}

/**
 * LOCAL PATCH 3: the parse() implementations whose success the FIRST sets
 * describe. A subclass that overrides parse() gets ANY_FIRST (never skipped).
 */
const KNOWN_PARSE: ReadonlySet<unknown> = new Set<unknown>([
  SingleChildRule.prototype.parse,
  SingleChildRuleWithASTRebuild.prototype.parse,
  SequenceRule.prototype.parse,
  AlternateRule.prototype.parse,
  OptionalRule.prototype.parse,
  ManyRule.prototype.parse,
  OneOrManyRule.prototype.parse,
  TokenRule.prototype.parse,
  AlternateTokenRule.prototype.parse,
]);

/**
 * Attempt to match a sequence of an expected number of tokens all of the same TokenType,
 * returning the matched tokens in a supplied array.  If there is no match, reset the
 * tokenBuffer to the position saved at the start of the function.
 *
 * @param tokenBuffer the TokenBuffer to parse
 * @param tokens the matched tokens (if any) are pushed onto this array
 * @param tokenType the TokenType to potentially match
 * @param numExpected the number of expected tokens of the same type
 * @returns true if the expected sequence of tokens was successfully matched
 */
export function tokenSequence(tokenBuffer: TokenBuffer, tokens: Token[], tokenType: TokenType, numExpected: number): boolean {
  let parseSuccess = true;
  const save = tokenBuffer.currentPosition;
  let token  = tokenBuffer.currentToken();
  const tmpTokens: Token[] = [];

  for (let num=0; num<numExpected; num++) {
    if (token.isTokenType(tokenType)) {
      tokenBuffer.popToken();
      tmpTokens.push(token);
      token = tokenBuffer.currentToken();
    } else {
      parseSuccess = false;
      break;
    }
  }

  if (parseSuccess) {
    tokens.push(...tmpTokens);
  } else {
    tokenBuffer.resetCurrentPosition(save);
  }

  return parseSuccess;
}

/**
 * Attempt to match a sequence of an expected number of PARAMETER tokens,
 * returning the matched tokens in a supplied array.  If there is no match, reset the
 * tokenBuffer to the position saved at the start of the function.
 *
 * @param tokenBuffer the TokenBuffer to parse
 * @param parameters the matched PARAMETER tokens (if any) are pushed onto this array
 * @param numExpected the number of expected PARAMETER tokens
 * @returns true if the expected sequence of PARAMETER tokens was successfully matched
 */
export function parameterSequence(tokenBuffer: TokenBuffer, parameters: Token[], numExpected: number): boolean {
  return tokenSequence(tokenBuffer, parameters, TokenType.PARAMETER, numExpected);
}
