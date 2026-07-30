/**
 * 記号で書ける命令の略記。
 *
 * 出典: プチコン4 公式リファレンス
 *   ?  → PRINT    「省略形として、?と書いても良い」
 *   T? → TPRINT   「省略形として、T?と書いても良い」
 *   ?? → INSPECT  「INSPECTのかわりに??と省略可能」
 *
 * 長い記号から先に試さなければならない。実機でも `???"ABC"` は
 * `??`（INSPECT）と `?`（PRINT）に分かれ、INSPECT の引数不足でエラーになる。
 * この表の順序がその挙動を決めているので、並べ替えてはいけない。
 *
 * 字句解析器とハイライト用の文法の両方がこの表を参照する。
 */

export interface Shorthand {
  /** 原文に現れる記号。英字は大文字で書く（実際の照合は大文字小文字を区別しない） */
  readonly symbol: string;
  /** 略さずに書いた命令名 */
  readonly command: string;
}

export const SHORTHANDS: readonly Shorthand[] = [
  { symbol: '??', command: 'INSPECT' },
  { symbol: 'T?', command: 'TPRINT' },
  { symbol: '?', command: 'PRINT' },
];

/**
 * text の offset の位置から始まる略記を返す。無ければ undefined。
 * 表の順に試すので、常に最も長い略記が選ばれる。
 */
export function matchShorthand(text: string, offset: number): Shorthand | undefined {
  return SHORTHANDS.find(
    (shorthand) =>
      text.slice(offset, offset + shorthand.symbol.length).toUpperCase() === shorthand.symbol,
  );
}
