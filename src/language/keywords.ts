/**
 * SmileBASIC 4 の予約語。
 *
 * 出典: プチコン4 公式リファレンス「言語仕様」
 *   https://sup4.smilebasic.com/doku.php?id=reference:言語仕様
 *
 * 公式が「予約語」として列挙しているのは RESERVED_WORDS の 44 語のみで、
 * これが変数名・命令名・関数名に使えない語の全体である。
 *
 * ただし次の語は予約語ではないものの、実質キーワードとして振る舞うため
 * ハイライト上は別枠で扱っている。
 *   - TO, STEP … FOR 構文の一部
 *   - DIV, MOD  … 演算子（出典: reference:演算子）
 */

/** 制御構文のキーワード。scope: keyword.control */
export const CONTROL_KEYWORDS = [
  'IF',
  'THEN',
  'ELSE',
  'ELSEIF',
  'ENDIF',
  'CASE',
  'WHEN',
  'OTHERWISE',
  'ENDCASE',
  'GOTO',
  'GOSUB',
  'RETURN',
  'ON',
  'LOOP',
  'ENDLOOP',
  'FOR',
  'TO', // 予約語ではないが FOR 構文の一部
  'STEP', // 同上
  'NEXT',
  'WHILE',
  'WEND',
  'REPEAT',
  'UNTIL',
  'BREAK',
  'CONTINUE',
  'DEF',
  'END',
] as const;

/** 単語として書く演算子。scope: keyword.operator.word */
export const WORD_OPERATORS = [
  'AND',
  'OR',
  'XOR',
  'NOT',
  'DIV', // 予約語ではないが整数除算演算子
  'MOD', // 予約語ではないが剰余演算子
] as const;

/**
 * 制御構文でも演算子でもない予約語。scope: keyword.other
 *
 * 変数宣言・入出力・サブプログラム呼び出しなど、言語機能として組み込まれた文。
 * これらは CALL による実行時参照ができない（PRINT / INPUT）など、
 * 通常の組み込み命令とは扱いが異なるため BUILTINS とは分けている。
 */
export const STATEMENT_KEYWORDS = [
  'VAR',
  'DIM',
  'COMMON',
  'DEFOUT',
  'OUT',
  'DATA',
  'READ',
  'RESTORE',
  'PRINT',
  'TPRINT',
  'INPUT',
  'LINPUT',
  'CALL',
  'SWAP',
  'EXEC',
] as const;

export type Keyword =
  | (typeof CONTROL_KEYWORDS)[number]
  | (typeof WORD_OPERATORS)[number]
  | (typeof STATEMENT_KEYWORDS)[number];

/** すべてのキーワード（大文字表記）。識別子がキーワードかの判定に使う。 */
export const ALL_KEYWORDS: readonly Keyword[] = [
  ...CONTROL_KEYWORDS,
  ...WORD_OPERATORS,
  ...STATEMENT_KEYWORDS,
];

const KEYWORD_SET: ReadonlySet<string> = new Set(ALL_KEYWORDS);

/**
 * 大文字化した綴りがキーワードなら、その正規化済みキーワードを返す。
 * SmileBASIC の識別子は大文字小文字を区別しない。
 */
export function asKeyword(text: string): Keyword | undefined {
  const upper = text.toUpperCase();
  return KEYWORD_SET.has(upper) ? (upper as Keyword) : undefined;
}
