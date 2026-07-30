/**
 * SmileBASIC 4 のブロック構造の定義。
 *
 * 出典: プチコン4 公式リファレンス「制御命令」
 *   https://sup4.smilebasic.com/doku.php?id=reference:制御命令
 *
 * 診断（parser/diagnostics.ts）がこの表を見てブロックの対応を検査する。
 * 新しいブロック構文が増えたらこの表に 1 行足せばよい。
 */

import type { Keyword } from './keywords';

export type BlockKind = 'if' | 'case' | 'loop' | 'for' | 'while' | 'repeat' | 'def';

export interface BlockDefinition {
  readonly kind: BlockKind;
  /** ブロックを開くキーワード */
  readonly opener: Keyword;
  /** ブロックを閉じるキーワード */
  readonly closer: Keyword;
  /**
   * ブロックの内側にだけ書けるキーワード（IF の ELSE、CASE の WHEN など）。
   * 直近のブロックがこの種類でないときにこれらが現れたらエラーにする。
   */
  readonly clauses: readonly Keyword[];
  /**
   * clauses のうち「最後に 1 度だけ書ける」もの。IF の ELSE、CASE の OTHERWISE。
   * 重複や、これより後に他の節が来ていないかを検査するために持つ。
   */
  readonly finalClause?: Keyword;
  /** BREAK / CONTINUE を書ける繰り返しブロックかどうか */
  readonly isLoop: boolean;
  /** エラーメッセージに使う日本語名 */
  readonly label: string;
}

export const BLOCK_DEFINITIONS: readonly BlockDefinition[] = [
  {
    kind: 'if',
    opener: 'IF',
    closer: 'ENDIF',
    clauses: ['ELSE', 'ELSEIF'],
    finalClause: 'ELSE',
    isLoop: false,
    label: 'IF',
  },
  {
    kind: 'case',
    opener: 'CASE',
    closer: 'ENDCASE',
    clauses: ['WHEN', 'OTHERWISE'],
    finalClause: 'OTHERWISE',
    isLoop: false,
    label: 'CASE',
  },
  {
    kind: 'loop',
    opener: 'LOOP',
    closer: 'ENDLOOP',
    clauses: [],
    isLoop: true,
    label: 'LOOP',
  },
  {
    kind: 'for',
    opener: 'FOR',
    closer: 'NEXT',
    clauses: [],
    isLoop: true,
    label: 'FOR',
  },
  {
    kind: 'while',
    opener: 'WHILE',
    closer: 'WEND',
    clauses: [],
    isLoop: true,
    label: 'WHILE',
  },
  {
    kind: 'repeat',
    opener: 'REPEAT',
    closer: 'UNTIL',
    clauses: [],
    isLoop: true,
    label: 'REPEAT',
  },
  {
    kind: 'def',
    opener: 'DEF',
    closer: 'END',
    clauses: [],
    isLoop: false,
    label: 'DEF',
  },
];

const BY_OPENER = new Map<Keyword, BlockDefinition>(
  BLOCK_DEFINITIONS.map((definition) => [definition.opener, definition]),
);

const BY_CLOSER = new Map<Keyword, BlockDefinition>(
  BLOCK_DEFINITIONS.map((definition) => [definition.closer, definition]),
);

const BY_CLAUSE = new Map<Keyword, BlockDefinition>(
  BLOCK_DEFINITIONS.flatMap((definition) =>
    definition.clauses.map((clause) => [clause, definition] as const),
  ),
);

export function blockByOpener(keyword: Keyword): BlockDefinition | undefined {
  return BY_OPENER.get(keyword);
}

export function blockByCloser(keyword: Keyword): BlockDefinition | undefined {
  return BY_CLOSER.get(keyword);
}

export function blockByClause(keyword: Keyword): BlockDefinition | undefined {
  return BY_CLAUSE.get(keyword);
}

/**
 * 飛び先ラベルを探せる範囲。
 *
 *   sameScope … DEF の内と外をまたげない。DEF の中からは同じ DEF のラベルだけが見える
 *   anyScope  … 有効範囲を問わない
 *
 * 「DEF～END範囲をまたがったGOTO,GOSUBはできない」と明記されているのは
 * GOTO / GOSUB（および THEN / ELSE 直後の省略形）だけなので、
 * DATA 行を指す RESTORE は anyScope にして誤検出を避けている。
 */
export type LabelJumpScope = 'sameScope' | 'anyScope';

/**
 * ラベルを飛び先として要求するキーワードと、その飛び先を探せる範囲。
 *
 * 言語仕様上、ラベルは文字列式の中に書くとラベル名そのものの文字列値になるため、
 * 「どこにも定義されていないラベル」が常にエラーとは限らない。
 * そこで未定義ラベルの検査は、必ず飛び先でなければならないこれらの直後に限定する。
 * THEN / ELSE が入っているのは「THEN や ELSE 直後の GOTO は省略可能」という仕様のため。
 */
export const LABEL_JUMP_KEYWORDS: ReadonlyMap<Keyword, LabelJumpScope> = new Map<
  Keyword,
  LabelJumpScope
>([
  ['GOTO', 'sameScope'],
  ['GOSUB', 'sameScope'],
  ['THEN', 'sameScope'],
  ['ELSE', 'sameScope'],
  ['RESTORE', 'anyScope'],
]);
