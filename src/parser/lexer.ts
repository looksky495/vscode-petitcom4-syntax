/**
 * SmileBASIC 4 の字句解析器。
 *
 * 出典: プチコン4 公式リファレンス「言語仕様」「演算子」「その他（REM）」「Ver3とVer4の違い（行の継続）」
 *   https://sup4.smilebasic.com/doku.php?id=reference:言語仕様
 *
 * 仕様のうち、この解析器の形を決めている点:
 *   - 識別子は [_A-Za-z][_A-Za-z0-9]* で、大文字小文字を区別しない
 *   - 識別子の末尾には型サフィックス % # $ が付くことがある
 *   - '@' で始まる語はラベル、'#' で始まる語は定数
 *   - コメントは ' または REM から行末まで
 *   - 文字列は " で始まり、閉じの " は省略できる（省略時は行末まで）
 *   - バックスラッシュ \ から行末までは読み飛ばされ、次の行が現在行の続きになる
 *   - ':' は文の区切り（PRINT "A":END のように 1 行に複数の文を書ける）
 *   - ? / T? / ?? は命令の略記（shorthands.ts）
 */

import { asKeyword, type Keyword } from '../language/keywords';
import { matchShorthand } from '../language/shorthands';
import type { Diagnostic, DiagnosticSeverity } from './diagnostic';

export enum TokenKind {
  Comment = 'comment',
  String = 'string',
  Number = 'number',
  /** @NAME 形式のラベル */
  Label = 'label',
  /** #NAME 形式の定数 */
  Constant = 'constant',
  Keyword = 'keyword',
  Identifier = 'identifier',
  Operator = 'operator',
  /** ( と [ */
  Open = 'open',
  /** ) と ] */
  Close = 'close',
  Comma = 'comma',
  Semicolon = 'semicolon',
  /** 文の区切り ':' */
  StatementSeparator = 'statementSeparator',
  /** 継続されていない改行。ファイル末尾にも必ず 1 つ入る */
  LineBreak = 'lineBreak',
}

export interface Token {
  readonly kind: TokenKind;
  /** 原文の綴り。大文字小文字はそのまま保持する */
  readonly text: string;
  /** kind が Keyword のときだけ入る、大文字に正規化した綴り */
  readonly keyword?: Keyword;
  /** 0 起点の行番号 */
  readonly line: number;
  /** 0 起点の桁番号 */
  readonly column: number;
  readonly length: number;
}

export interface LexResult {
  readonly tokens: readonly Token[];
  /** 字句の段階で分かった指摘。誤りだけでなく情報レベルのものも含む */
  readonly problems: readonly Diagnostic[];
}

/** 記号の演算子。長いものから先に試すため、この順序に意味がある。 */
const OPERATORS = [
  '<<<',
  '>>>',
  '<<+',
  '>>+',
  '<<',
  '>>',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '<',
  '>',
  '=',
  '+',
  '-',
  '*',
  '/',
  '!',
] as const;

const TYPE_SUFFIXES = '%#$';

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isHexDigit(char: string | undefined): boolean {
  return isDigit(char) || (char !== undefined && /^[A-Fa-f]$/.test(char));
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /^[A-Za-z_]$/.test(char);
}

function isIdentifierPart(char: string | undefined): boolean {
  return char !== undefined && /^[A-Za-z0-9_]$/.test(char);
}

/** text がコメントの始まり（' または REM）かどうか。 */
function startsComment(text: string): boolean {
  return text.startsWith("'") || /^REM(?![A-Za-z0-9_])/i.test(text);
}

export function tokenize(source: string): LexResult {
  return new Lexer(source).run();
}

class Lexer {
  private index = 0;
  private line = 0;
  private column = 0;

  private readonly tokens: Token[] = [];
  private readonly problems: Diagnostic[] = [];

  /**
   * 行継続のバックスラッシュを読んだ直後かどうか。
   * これが立っている間に来る改行は、LineBreak トークンにしない。
   */
  private continuing = false;

  constructor(private readonly source: string) {}

  run(): LexResult {
    while (this.index < this.source.length) {
      this.readToken();
    }
    // 末尾に必ず改行を置く。こうしておくと、これを読む側が
    // 「ファイル末尾」と「行末」を別扱いしなくて済む。
    if (this.tokens.at(-1)?.kind !== TokenKind.LineBreak) {
      this.push(TokenKind.LineBreak, '', this.line, this.column);
    }
    return { tokens: this.tokens, problems: this.problems };
  }

  // ---- 文字単位の操作 ----------------------------------------------------

  private peek(offset = 0): string | undefined {
    return this.source[this.index + offset];
  }

  /** 現在位置から count 文字進める。改行を含めてはいけない。 */
  private advance(count = 1): void {
    this.index += count;
    this.column += count;
  }

  private push(kind: TokenKind, text: string, line: number, column: number, keyword?: Keyword): void {
    this.tokens.push({ kind, text, line, column, length: text.length, keyword });
  }

  private report(
    severity: DiagnosticSeverity,
    message: string,
    line: number,
    column: number,
    length: number,
  ): void {
    this.problems.push({ severity, message, line, column, length });
  }

  private error(message: string, line: number, column: number, length: number): void {
    this.report('error', message, line, column, length);
  }

  /** 現在行の残りを返す（改行は含まない）。 */
  private restOfLine(): string {
    const end = this.source.slice(this.index).search(/[\r\n]/);
    return end === -1 ? this.source.slice(this.index) : this.source.slice(this.index, this.index + end);
  }

  // ---- トークンの読み取り ------------------------------------------------

  private readToken(): void {
    const char = this.peek();

    if (char === ' ' || char === '\t') {
      this.advance();
      return;
    }
    if (char === '\r' || char === '\n') {
      this.readLineBreak();
      return;
    }
    if (char === '\\') {
      this.readLineContinuation();
      return;
    }
    if (char === "'") {
      this.readComment();
      return;
    }
    if (char === '"') {
      this.readString();
      return;
    }
    if (char === '&') {
      this.readRadixNumberOrOperator();
      return;
    }
    if (isDigit(char) || (char === '.' && isDigit(this.peek(1)))) {
      this.readDecimalNumber();
      return;
    }
    if (char === '@') {
      this.readPrefixed(TokenKind.Label, '@', 'ラベル名');
      return;
    }
    if (char === '#') {
      this.readPrefixed(TokenKind.Constant, '#', '定数名');
      return;
    }
    // 略記（? / T? / ??）は識別子より先に見る。T? の T を変数名として
    // 読んでしまわないようにするためで、?? が ? 2 つに分かれるのも防げる。
    if (this.readShorthand()) {
      return;
    }
    if (isIdentifierStart(char)) {
      this.readIdentifier();
      return;
    }
    this.readPunctuationOrOperator();
  }

  private readLineBreak(): void {
    const text = this.peek() === '\r' && this.peek(1) === '\n' ? '\r\n' : this.peek()!;
    if (this.continuing) {
      // 直前の行がバックスラッシュで継続されているので、論理行は途切れない
      this.continuing = false;
    } else {
      this.push(TokenKind.LineBreak, text, this.line, this.column);
    }
    this.index += text.length;
    this.line += 1;
    this.column = 0;
  }

  /**
   * バックスラッシュによる行継続。
   *
   * 実機ではバックスラッシュから行末までが読み飛ばされ、次の行が現在行の
   * 続きになる。読み飛ばされるので、そこに何を書いても実行時エラーにはならない。
   *
   *   VAR A=1, \ ' 続きは次の行     ← 本来の使い方
   *   VAR A=1, \ @@$$5              ← 実機でもエラーにならない
   *
   * そのため誤りとしては扱わず、コメント以外が書かれている場合にだけ
   * 「無視される」ことを情報として知らせる。改行に着いた時点で
   * readLineBreak が LineBreak を出さないことで、1 つの論理行として続く。
   */
  private readLineContinuation(): void {
    this.advance(); // '\'
    while (this.peek() === ' ' || this.peek() === '\t') {
      this.advance();
    }

    const trailer = this.restOfLine();
    if (startsComment(trailer)) {
      this.readComment(); // コメントは通常どおりトークンとして残す
    } else if (trailer !== '') {
      this.report(
        'information',
        "バックスラッシュより後ろは無視されます。コメントにするなら ' を付けてください。",
        this.line,
        this.column,
        trailer.trimEnd().length,
      );
      this.advance(trailer.length);
    }
    this.continuing = true;
  }

  /** ' から行末まで。REM から行末までも同じ扱い。 */
  private readComment(): void {
    const text = this.restOfLine();
    this.push(TokenKind.Comment, text, this.line, this.column);
    this.advance(text.length);
  }

  /**
   * " で囲まれた文字列。
   *
   * 閉じの " は省略でき、その場合は行末までが文字列になる（PRINT "HELLO と書ける）。
   * このため文字列は必ず 1 行で終わり、閉じ忘れという誤りは存在しない。
   */
  private readString(): void {
    const line = this.line;
    const column = this.column;
    const rest = this.restOfLine();

    // 開き " の次から閉じ " を探す。無ければ行末までが文字列。
    const closing = rest.indexOf('"', 1);
    const text = closing === -1 ? rest : rest.slice(0, closing + 1);

    this.push(TokenKind.String, text, line, column);
    this.advance(text.length);
  }

  /** &H で始まる 16 進数、&B で始まる 2 進数、または && 演算子。 */
  private readRadixNumberOrOperator(): void {
    const line = this.line;
    const column = this.column;

    if (this.peek(1) === '&') {
      this.push(TokenKind.Operator, '&&', line, column);
      this.advance(2);
      return;
    }

    const prefix = this.peek(1);
    const kind = prefix === 'H' || prefix === 'h' ? 'hex' : prefix === 'B' || prefix === 'b' ? 'binary' : undefined;
    if (kind === undefined) {
      this.error('& の後には H（16進数）か B（2進数）を書いてください。', line, column, 1);
      this.advance();
      return;
    }

    let length = 2;
    const accepts = kind === 'hex' ? isHexDigit : (char: string | undefined) => char === '0' || char === '1';
    while (accepts(this.peek(length))) {
      length += 1;
    }
    if (length === 2) {
      const label = kind === 'hex' ? '16進数' : '2進数';
      this.error(`${label}の桁がありません。`, line, column, 2);
    }
    this.push(TokenKind.Number, this.source.slice(this.index, this.index + length), line, column);
    this.advance(length);
  }

  /** 10 進の整数リテラルと実数リテラル（小数点・指数表記を含む）。 */
  private readDecimalNumber(): void {
    const line = this.line;
    const column = this.column;
    const rest = this.source.slice(this.index);

    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/.exec(rest)!;
    const text = match[0];

    // 「1E」「1E+」のように指数部の桁が欠けている場合を拾う
    const danglingExponent = /^(?:\d+(?:\.\d*)?|\.\d+)[Ee][+-]?/.exec(rest);
    if (danglingExponent !== null && danglingExponent[0].length > text.length) {
      this.error('指数部の桁がありません。', line, column, danglingExponent[0].length);
      this.push(TokenKind.Number, danglingExponent[0], line, column);
      this.advance(danglingExponent[0].length);
      return;
    }

    this.push(TokenKind.Number, text, line, column);
    this.advance(text.length);
  }

  /** @ラベル と #定数。どちらも記号 1 文字＋識別子。 */
  private readPrefixed(kind: TokenKind, prefix: string, what: string): void {
    const line = this.line;
    const column = this.column;

    if (!isIdentifierStart(this.peek(1))) {
      this.error(`${prefix} の後に${what}がありません。`, line, column, 1);
      this.advance();
      return;
    }
    let length = 2;
    while (isIdentifierPart(this.peek(length))) {
      length += 1;
    }
    this.push(kind, this.source.slice(this.index, this.index + length), line, column);
    this.advance(length);
  }

  /**
   * ? / T? / ?? のような記号の略記を読む。読めたら true。
   *
   * 略記が表す命令名を keyword に正規化できる場合（PRINT, TPRINT）は
   * Keyword として、予約語でない組み込み命令（INSPECT）の場合は
   * Identifier として扱う。綴って書いたときと同じ種類のトークンになる。
   */
  private readShorthand(): boolean {
    const shorthand = matchShorthand(this.source, this.index);
    if (shorthand === undefined) {
      return false;
    }
    const text = this.source.slice(this.index, this.index + shorthand.symbol.length);
    const keyword = asKeyword(shorthand.command);

    this.push(
      keyword !== undefined ? TokenKind.Keyword : TokenKind.Identifier,
      text,
      this.line,
      this.column,
      keyword,
    );
    this.advance(text.length);
    return true;
  }

  private readIdentifier(): void {
    const line = this.line;
    const column = this.column;

    let length = 1;
    while (isIdentifierPart(this.peek(length))) {
      length += 1;
    }
    const name = this.source.slice(this.index, this.index + length);

    // REM は行末までのコメント
    if (name.toUpperCase() === 'REM') {
      this.readComment();
      return;
    }

    // 型サフィックスは識別子の一部。キーワードにサフィックスは付かないため、
    // 付いていればキーワード判定にはかけない。
    const following = this.peek(length);
    const suffix = following !== undefined && TYPE_SUFFIXES.includes(following) ? following : '';
    if (suffix === '') {
      const keyword = asKeyword(name);
      if (keyword !== undefined) {
        this.push(TokenKind.Keyword, name, line, column, keyword);
        this.advance(length);
        return;
      }
    }
    this.push(TokenKind.Identifier, name + suffix, line, column);
    this.advance(length + suffix.length);
  }

  private readPunctuationOrOperator(): void {
    const line = this.line;
    const column = this.column;
    const char = this.peek()!;

    const simple: Record<string, TokenKind> = {
      '(': TokenKind.Open,
      '[': TokenKind.Open,
      ')': TokenKind.Close,
      ']': TokenKind.Close,
      ',': TokenKind.Comma,
      ';': TokenKind.Semicolon,
      ':': TokenKind.StatementSeparator,
    };
    const kind = simple[char];
    if (kind !== undefined) {
      this.push(kind, char, line, column);
      this.advance();
      return;
    }

    const operator = OPERATORS.find((candidate) => this.source.startsWith(candidate, this.index));
    if (operator !== undefined) {
      this.push(TokenKind.Operator, operator, line, column);
      this.advance(operator.length);
      return;
    }

    this.error(`使用できない文字 '${char}' があります。`, line, column, 1);
    this.advance();
  }
}
