/**
 * SmileBASIC 4 の構文チェック。
 *
 * ここでは式の構造までは解析せず、書き間違いとして頻度が高く、かつ
 * 誤検出なく判定できるものに絞って検査している。
 *
 *   1. 字句レベルの誤り（桁のない &H など）… lexer.ts が検出
 *   2. ブロックの対応（IF に対する ENDIF、FOR に対する NEXT など）
 *   3. 括弧の対応
 *   4. DEF の入れ子と定義名の重複
 *   5. ラベルの重複、飛び先ラベルの未定義、DEF をまたぐ GOTO / GOSUB
 *
 * vscode モジュールには依存しない。VSCode 向けの変換は extension.ts が行う。
 */

import {
  blockByClause,
  blockByCloser,
  blockByOpener,
  LABEL_JUMP_KEYWORDS,
  type BlockDefinition,
  type LabelJumpScope,
} from '../language/blocks';
import type { Keyword } from '../language/keywords';
import { TokenKind, tokenize, type Token } from './lexer';

export type { Diagnostic, DiagnosticSeverity } from './diagnostic';

import type { Diagnostic, DiagnosticSeverity } from './diagnostic';

export function analyze(source: string): Diagnostic[] {
  const { tokens, problems } = tokenize(source);

  const diagnostics: Diagnostic[] = [...problems];
  diagnostics.push(...new BlockChecker(tokens).run());
  diagnostics.push(...checkBrackets(tokens));
  diagnostics.push(...checkDefinitions(tokens));
  diagnostics.push(...new LabelChecker(tokens).run());

  return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
}

// ---- 共通のヘルパー -------------------------------------------------------

function at(token: Token, message: string, severity: DiagnosticSeverity = 'error'): Diagnostic {
  return { message, line: token.line, column: token.column, length: token.length, severity };
}

// ---- ブロックの対応 -------------------------------------------------------

interface OpenBlock {
  readonly definition: BlockDefinition;
  /** ブロックを開いたキーワードのトークン */
  readonly token: Token;
  /** ELSE / OTHERWISE を既に見たか。重複と、その後の ELSEIF を検出するために持つ */
  hasElseClause: boolean;
  /**
   * ブロックを開く行そのものに誤りを報告済みか（THEN の無い IF など）。
   * この場合の「閉じられていません」は最初の誤りの副作用にすぎないので報告しない。
   */
  readonly hasOpenerError: boolean;
}

/**
 * ブロックの開き・閉じの対応を検査する。
 *
 * トークンを 1 つずつ見て、開くキーワードでスタックに積み、閉じるキーワードで降ろす。
 * 行ではなくトークンの順で処理しているので、`FOR I=0 TO 9:PRINT I:NEXT` のように
 * 1 行に収めたブロックも正しく扱える。
 */
class BlockChecker {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly stack: OpenBlock[] = [];

  /**
   * この論理行にある「IF 式 THEN 処理」の 1 行形式の数。
   * 1 行形式は ENDIF を必要とせず、同じ行の ELSE はその IF のものになるため、
   * スタックには積まずにここで数える。
   */
  private singleLineIfs = 0;
  private previousKeyword: Keyword | undefined;

  constructor(private readonly tokens: readonly Token[]) {}

  run(): Diagnostic[] {
    for (let i = 0; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];

      if (token.kind === TokenKind.LineBreak) {
        this.singleLineIfs = 0;
        this.previousKeyword = undefined;
        continue;
      }
      if (token.kind === TokenKind.Keyword) {
        this.handleKeyword(token, i);
        this.previousKeyword = token.keyword;
      }
    }

    // 閉じられずに残ったブロックは、内側から順に報告する
    for (const block of this.stack.slice().reverse()) {
      this.reportUnclosed(block);
    }
    return this.diagnostics;
  }

  private handleKeyword(token: Token, index: number): void {
    const keyword = token.keyword!;

    if (keyword === 'IF') {
      this.handleIf(token, index);
      return;
    }

    const clauseOf = blockByClause(keyword);
    if (clauseOf !== undefined) {
      this.handleClause(keyword, token, clauseOf, index);
      return;
    }

    const opener = blockByOpener(keyword);
    if (opener !== undefined) {
      const missingTo = keyword === 'FOR' && this.findOnLine(index, 'TO') === -1;
      if (missingTo) {
        this.report(token, 'FOR に対応する TO がありません。');
      }
      this.open(opener, token, missingTo);
      return;
    }

    const closer = blockByCloser(keyword);
    if (closer !== undefined) {
      this.handleCloser(keyword, token, closer);
      return;
    }

    if (keyword === 'BREAK' || keyword === 'CONTINUE') {
      this.handleLoopEscape(keyword, token);
    }
  }

  /**
   * IF には 3 つの形がある。
   *   IF 式 THEN 処理              … 1 行形式。ENDIF は不要
   *   IF 式 THEN [改行] 処理 ENDIF  … ブロック形式
   *   IF 式 GOTO @ラベル [ELSE 処理] … 1 行形式。ENDIF は不要
   *
   * ブロック形式になるのは「THEN で行が終わっている」場合だけ。
   * GOTO 形は必ず 1 行で完結するので、ENDIF を要求してはいけない。
   */
  private handleIf(token: Token, index: number): void {
    const definition = blockByOpener('IF')!;
    const condition = this.findThenOrGoto(index);

    if (condition === undefined) {
      // どちらも無い場合もブロック形式とみなして積んでおく。そうしないと
      // この後の ENDIF が「対応する IF が無い」と二重に報告されてしまう。
      this.report(token, 'IF には THEN か GOTO が必要です。');
      this.open(definition, token, true);
      return;
    }
    if (condition.keyword === 'GOTO' || this.tokenAfter(condition.index) !== undefined) {
      this.singleLineIfs += 1;
      return;
    }
    this.open(definition, token);
  }

  private open(definition: BlockDefinition, token: Token, hasOpenerError = false): void {
    this.stack.push({ definition, token, hasElseClause: false, hasOpenerError });
  }

  /** ELSE / ELSEIF / WHEN / OTHERWISE が正しいブロックの中にあるか検査する。 */
  private handleClause(
    keyword: Keyword,
    token: Token,
    clauseOf: BlockDefinition,
    index: number,
  ): void {
    // 1 行形式の IF に付く ELSE は、その IF のものなのでブロックとしては扱わない
    if (keyword === 'ELSE' && this.singleLineIfs > 0) {
      this.singleLineIfs -= 1;
      return;
    }

    const current = this.stack.at(-1);
    if (current === undefined || current.definition.kind !== clauseOf.kind) {
      this.report(token, `${keyword} に対応する ${clauseOf.label} がありません。`);
      return;
    }

    const isFinalClause = keyword === clauseOf.finalClause;
    if (current.hasElseClause) {
      this.report(
        token,
        isFinalClause
          ? `${keyword} が重複しています。`
          : `${keyword} は ${clauseOf.finalClause} より後には書けません。`,
      );
    }
    if (isFinalClause) {
      current.hasElseClause = true;
    }
    // 公式リファレンスに載っているのは「ELSEIF 式 THEN」だけだが、
    // IF に合わせて GOTO も許している。誤って警告を出すより見逃す方を選ぶ。
    if (keyword === 'ELSEIF' && this.findThenOrGoto(index) === undefined) {
      this.report(token, 'ELSEIF には THEN か GOTO が必要です。');
    }
  }

  private handleCloser(keyword: Keyword, token: Token, closer: BlockDefinition): void {
    const matchIndex = this.stack.findLastIndex((block) => block.definition.kind === closer.kind);
    if (matchIndex === -1) {
      // END は DEF の終わりでもあり、プログラムを終了する文でもある。
      // DEF の中でなければ後者なのでエラーにしない。
      if (keyword !== 'END') {
        this.report(token, `${keyword} に対応する ${closer.label} がありません。`);
      }
      return;
    }
    // 対応するブロックより内側に閉じ忘れたブロックがあれば、それを報告する
    for (const inner of this.stack.slice(matchIndex + 1)) {
      this.reportUnclosed(inner);
    }
    this.stack.length = matchIndex;
  }

  private handleLoopEscape(keyword: Keyword, token: Token): void {
    // 「ON BREAK GOTO @ラベル」の BREAK は繰り返しの脱出ではない
    if (keyword === 'BREAK' && this.previousKeyword === 'ON') {
      return;
    }
    if (!this.stack.some((block) => block.definition.isLoop)) {
      this.report(token, `${keyword} は FOR / WHILE / REPEAT / LOOP の中でのみ使えます。`);
    }
  }

  private report(token: Token, message: string): void {
    this.diagnostics.push(at(token, message));
  }

  private reportUnclosed(block: OpenBlock): void {
    if (block.hasOpenerError) {
      return; // 既に報告した誤りの副作用なので黙っておく
    }
    this.report(
      block.token,
      `${block.definition.label} に対応する ${block.definition.closer} がありません。`,
    );
  }

  /**
   * この論理行で、index より後にある THEN か GOTO のうち先に現れる方を返す。
   * IF と ELSEIF はどちらでも条件式を終われるため、どちらが使われたかで
   * ブロックを開くかどうかが変わる。
   */
  private findThenOrGoto(index: number): { keyword: 'THEN' | 'GOTO'; index: number } | undefined {
    for (let i = index + 1; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];
      if (token.kind === TokenKind.LineBreak) {
        return undefined;
      }
      if (token.keyword === 'THEN' || token.keyword === 'GOTO') {
        return { keyword: token.keyword, index: i };
      }
    }
    return undefined;
  }

  /** index より後で、同じ論理行にある keyword の位置を返す。無ければ -1。 */
  private findOnLine(index: number, keyword: Keyword): number {
    for (let i = index + 1; i < this.tokens.length; i += 1) {
      if (this.tokens[i].kind === TokenKind.LineBreak) {
        return -1;
      }
      if (this.tokens[i].keyword === keyword) {
        return i;
      }
    }
    return -1;
  }

  /**
   * index の次にある意味のあるトークンを返す。コメントは読み飛ばし、
   * 論理行の終わりに達したら undefined を返す。
   */
  private tokenAfter(index: number): Token | undefined {
    for (let i = index + 1; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];
      if (token.kind === TokenKind.Comment) {
        continue;
      }
      return token.kind === TokenKind.LineBreak ? undefined : token;
    }
    return undefined;
  }
}

// ---- 括弧の対応 -----------------------------------------------------------

const CLOSING_OF: Record<string, string> = { '(': ')', '[': ']' };

function checkBrackets(tokens: readonly Token[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let open: Token[] = [];

  for (const token of tokens) {
    if (token.kind === TokenKind.LineBreak) {
      // 括弧は論理行をまたげないので、行が変わった時点で閉じ忘れが確定する
      for (const unclosed of open) {
        diagnostics.push(at(unclosed, `${unclosed.text} が閉じられていません。`));
      }
      open = [];
      continue;
    }
    if (token.kind === TokenKind.Open) {
      open.push(token);
      continue;
    }
    if (token.kind === TokenKind.Close) {
      const opened = open.pop();
      if (opened === undefined) {
        diagnostics.push(at(token, `${token.text} に対応する開き括弧がありません。`));
      } else if (CLOSING_OF[opened.text] !== token.text) {
        diagnostics.push(at(token, `${opened.text} は ${CLOSING_OF[opened.text]} で閉じてください。`));
      }
    }
  }
  return diagnostics;
}

// ---- ユーザー定義命令・関数 -----------------------------------------------

/**
 * DEF の検査。
 *
 * 出典: 「DEF共通ルール」DEF～END までが定義範囲。
 * DEF を入れ子にすることはできず、同じ名前を 2 度定義することもできない。
 */
function checkDefinitions(tokens: readonly Token[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const declared = new Set<string>();
  let insideDef = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.keyword === 'END' && insideDef) {
      insideDef = false;
      continue;
    }
    if (token.keyword !== 'DEF') {
      continue;
    }
    if (insideDef) {
      diagnostics.push(at(token, 'DEF の中に DEF は定義できません。'));
    }
    insideDef = true;

    const name = tokens[i + 1];
    if (name === undefined || name.kind !== TokenKind.Identifier) {
      diagnostics.push(at(token, 'DEF に定義名がありません。'));
      continue;
    }
    const key = name.text.toUpperCase();
    if (declared.has(key)) {
      diagnostics.push(at(name, `ユーザー定義命令・関数 ${name.text} が重複しています。`));
    } else {
      declared.add(key);
    }
  }
  return diagnostics;
}

// ---- ラベル ---------------------------------------------------------------

/** ラベルの有効範囲。0 は DEF の外、1 以上はそれぞれの DEF の中を表す。 */
const GLOBAL_SCOPE = 0;

/** ラベル文字列として書ける形。"@名前" と "スロット番号:@名前" */
const LABEL_STRING = /^(?:\d+:)?@[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * ラベルの定義と飛び先の検査。
 *
 * 「DEF～END範囲で定義された変数やラベルはDEF外から使用できない」
 * 「DEF～END範囲をまたがったGOTO,GOSUBはできない」（出典: DEF共通ルール）
 * のため、ラベルは DEF ごとに別の有効範囲として集める。
 * 別々の DEF に同じ名前のラベルがあっても重複ではない。
 */
class LabelChecker {
  private readonly diagnostics: Diagnostic[] = [];
  /** 有効範囲ごとの「大文字化したラベル名 → 定義トークン」 */
  private readonly definitions = new Map<number, Map<string, Token>>();
  /** ラベルの定義であるトークンの位置 */
  private readonly definitionIndexes = new Set<number>();

  constructor(private readonly tokens: readonly Token[]) {}

  run(): Diagnostic[] {
    this.collectDefinitions();
    this.checkJumpTargets();
    return this.diagnostics;
  }

  /**
   * トークンを順に返しつつ、その位置がどの有効範囲かを教える。
   * DEF で新しい範囲に入り、対応する END で DEF の外に戻る。コメントは飛ばす。
   */
  private *walk(): Generator<{ index: number; token: Token; scope: number }> {
    let scope = GLOBAL_SCOPE;
    let lastScopeId = GLOBAL_SCOPE;

    for (let index = 0; index < this.tokens.length; index += 1) {
      const token = this.tokens[index];
      if (token.kind === TokenKind.Comment) {
        continue;
      }
      if (token.keyword === 'DEF') {
        lastScopeId += 1;
        scope = lastScopeId;
      }
      yield { index, token, scope };
      if (token.keyword === 'END' && scope !== GLOBAL_SCOPE) {
        scope = GLOBAL_SCOPE;
      }
    }
  }

  /** 文の先頭に置かれたラベルを、その位置の有効範囲の定義として集める。 */
  private collectDefinitions(): void {
    let atStatementStart = true;

    for (const { index, token, scope } of this.walk()) {
      if (token.kind === TokenKind.LineBreak || token.kind === TokenKind.StatementSeparator) {
        atStatementStart = true;
        continue;
      }
      if (atStatementStart && token.kind === TokenKind.Label) {
        this.definitionIndexes.add(index);
        this.define(scope, token);
      }
      atStatementStart = false;
    }
  }

  private define(scope: number, token: Token): void {
    let scoped = this.definitions.get(scope);
    if (scoped === undefined) {
      scoped = new Map<string, Token>();
      this.definitions.set(scope, scoped);
    }
    const name = token.text.toUpperCase();
    if (scoped.has(name)) {
      this.diagnostics.push(at(token, `ラベル ${token.text} が重複しています。`));
      return;
    }
    scoped.set(name, token);
  }

  /** name が定義されている有効範囲を返す。定義が無ければ undefined。 */
  private scopeOf(name: string): number | undefined {
    for (const [scope, scoped] of this.definitions) {
      if (scoped.has(name)) {
        return scope;
      }
    }
    return undefined;
  }

  /**
   * 飛び先として書かれたラベルを検査する。
   *
   * 言語仕様では、ラベルを式の中に書くとラベル名そのものの文字列値になるため、
   * 「定義されていないラベル」が常に誤りとは限らない。そこで検査するのは
   * GOTO / GOSUB / RESTORE と、THEN / ELSE 直後の省略された GOTO の飛び先だけ。
   */
  private checkJumpTargets(): void {
    let jumpKeyword: Keyword | undefined;
    let statementStartsWithOn = false;
    let atStatementStart = true;

    for (const { index, token, scope } of this.walk()) {
      if (token.kind === TokenKind.LineBreak || token.kind === TokenKind.StatementSeparator) {
        jumpKeyword = undefined;
        atStatementStart = true;
        continue;
      }
      if (atStatementStart) {
        statementStartsWithOn = token.keyword === 'ON';
        atStatementStart = false;
      }

      // ラベルとカンマは「ON 式 GOTO @A,@B」の並びを続けて見るため状態を保つ
      if (token.kind === TokenKind.Label) {
        if (jumpKeyword !== undefined && !this.definitionIndexes.has(index)) {
          this.checkLabelTarget(token, scope, LABEL_JUMP_KEYWORDS.get(jumpKeyword)!);
        }
        continue;
      }
      if (token.kind === TokenKind.Comma) {
        continue;
      }
      if (token.kind === TokenKind.String) {
        if (jumpKeyword !== undefined) {
          this.checkStringTarget(token, index, jumpKeyword, statementStartsWithOn);
        }
        continue;
      }
      jumpKeyword =
        token.kind === TokenKind.Keyword && LABEL_JUMP_KEYWORDS.has(token.keyword!)
          ? token.keyword
          : undefined;
    }
  }

  private checkLabelTarget(token: Token, scope: number, jumpScope: LabelJumpScope): void {
    const name = token.text.toUpperCase();

    // まず自分と同じ有効範囲を見る。別の DEF に同じ名前のラベルがあっても構わない。
    if (this.definitions.get(scope)?.has(name) === true) {
      return;
    }
    const definedScope = this.scopeOf(name);
    if (definedScope === undefined) {
      this.diagnostics.push(at(token, `ラベル ${token.text} が定義されていません。`));
      return;
    }
    if (jumpScope === 'anyScope') {
      return;
    }
    this.diagnostics.push(
      at(
        token,
        definedScope === GLOBAL_SCOPE
          ? `ラベル ${token.text} は DEF の外で定義されているため、DEF の中からは使えません。`
          : scope === GLOBAL_SCOPE
            ? `ラベル ${token.text} は DEF の中で定義されているため、DEF の外からは使えません。`
            : `ラベル ${token.text} は別の DEF の中で定義されているため、ここからは使えません。`,
      ),
    );
  }

  /** GOTO "@ラベル" のように文字列で飛び先を書いた場合の検査。 */
  private checkStringTarget(
    token: Token,
    index: number,
    jumpKeyword: Keyword,
    statementStartsWithOn: boolean,
  ): void {
    if (statementStartsWithOn) {
      // 出典: 「ON～GOTOのラベルには、文字列は使えない」
      this.diagnostics.push(at(token, 'ON ～ GOTO / GOSUB の飛び先に文字列は使えません。'));
      return;
    }
    if (jumpKeyword === 'THEN' || jumpKeyword === 'ELSE') {
      // 出典: 「ELSE直後でのGOTO省略時に文字列は使えない」
      this.diagnostics.push(
        at(token, `${jumpKeyword} の直後で GOTO を省略するとき、飛び先に文字列は使えません。`),
      );
      return;
    }
    if (!this.isWholeArgument(index)) {
      return; // "@"+NAME$ のように式の一部なら、書かれた文字列だけでは判断できない
    }
    const literal = token.text.replace(/^"/, '').replace(/"$/, '');
    if (!LABEL_STRING.test(literal)) {
      this.diagnostics.push(
        at(token, 'ラベル文字列は "@名前" または "スロット番号:@名前" の形で書いてください。'),
      );
    }
  }

  /** index のトークンが引数の全体かどうか。演算子などが続くなら式の一部。 */
  private isWholeArgument(index: number): boolean {
    for (let i = index + 1; i < this.tokens.length; i += 1) {
      const token = this.tokens[i];
      if (token.kind === TokenKind.Comment) {
        continue;
      }
      return (
        token.kind === TokenKind.LineBreak ||
        token.kind === TokenKind.StatementSeparator ||
        token.kind === TokenKind.Comma ||
        token.kind === TokenKind.Keyword
      );
    }
    return true;
  }
}
