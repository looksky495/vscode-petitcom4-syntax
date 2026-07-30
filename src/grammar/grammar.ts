/**
 * SmileBASIC 4 の TextMate 文法を組み立てる。
 *
 * ここが syntaxes/smilebasic4.tmLanguage.json の元になる唯一の定義であり、
 * キーワードの一覧は language/ 配下の表をそのまま参照している。
 * つまりコマンドを追加するときに触るのは language/builtins.ts だけでよい。
 *
 * 書き出しは tools/build-grammar.ts が行う（`npm run build`）。
 */

import { BUILTINS } from '../language/builtins';
import { CONTROL_KEYWORDS, STATEMENT_KEYWORDS, WORD_OPERATORS } from '../language/keywords';
import { SHORTHANDS } from '../language/shorthands';

export interface TmPattern {
  readonly name?: string;
  readonly match?: string;
  readonly begin?: string;
  readonly end?: string;
  readonly captures?: Readonly<Record<string, { readonly name: string }>>;
  readonly patterns?: readonly TmPattern[];
  readonly include?: string;
}

export interface TmGrammar {
  readonly $schema: string;
  readonly name: string;
  readonly scopeName: string;
  readonly fileTypes: readonly string[];
  readonly patterns: readonly TmPattern[];
  readonly repository: Readonly<Record<string, TmPattern>>;
}

/** 識別子として続きうる文字。キーワードの直後にこれらが来たらキーワードではない。 */
const IDENTIFIER_CONTINUATION = '[A-Za-z0-9_%#$]';

/** 識別子の綴り。型サフィックス（% # $）を含む。 */
const IDENTIFIER = '[A-Za-z_][A-Za-z0-9_]*[%#$]?';

function escapeForRegExp(word: string): string {
  return word.replace(/[$^*+?.()|[\]{}\\]/g, '\\$&');
}

/**
 * 語の一覧を Oniguruma の選択（A|B|C）にする。
 *
 * 長い語を先に並べているのは、SPCOL が SPCOLOR より先に試されて
 * 途中までしか色が付かない事故を防ぐため。同じ長さなら綴り順にして、
 * 生成結果が実行ごとに変わらないようにしている。
 */
function alternation(words: readonly string[]): string {
  return [...words]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(escapeForRegExp)
    .join('|');
}

/**
 * 大文字小文字を区別せずに語の一覧と一致する正規表現。
 *
 * 終端に \b を使えないのは、BIN$ や ARRAY% のように記号で終わる語があるためで、
 * 代わりに「識別子の文字が続かないこと」を先読みで確かめている。
 */
function wordsPattern(words: readonly string[]): string {
  return `\\b(?i:${alternation(words)})(?!${IDENTIFIER_CONTINUATION})`;
}

/**
 * 略記（? / T? / ??）に一致する正規表現を shorthands.ts の表から作る。
 *
 * 表の順序をそのまま使うので ?? が ? 2 つに分かれない。英字で始まる
 * 略記（T?）だけは、AT? の T に食いつかないよう単語の境界を要求する。
 */
function shorthandPattern(): string {
  const alternatives = SHORTHANDS.map((shorthand) => {
    const escaped = escapeForRegExp(shorthand.symbol);
    return /^[A-Z]/.test(shorthand.symbol) ? `\\b${escaped}` : escaped;
  });
  return `(?i:${alternatives.join('|')})`;
}

export function buildGrammar(): TmGrammar {
  return {
    $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
    name: 'SmileBASIC 4',
    scopeName: 'source.smilebasic4',
    fileTypes: ['prg'],

    // 上から順に試される。コメントと文字列を先に置き、その中の記号を
    // 別のルールが拾ってしまわないようにしている。
    patterns: [
      { include: '#comment' },
      { include: '#string' },
      { include: '#number' },
      { include: '#line-continuation' },
      { include: '#label-definition' },
      { include: '#label-reference' },
      { include: '#constant' },
      { include: '#definition-name' },
      { include: '#control-keyword' },
      { include: '#word-operator' },
      { include: '#statement-keyword' },
      { include: '#shorthand' },
      { include: '#builtin' },
      { include: '#function-call' },
      { include: '#variable' },
      { include: '#operator' },
      { include: '#punctuation' },
    ],

    repository: {
      /** ' から行末まで、および REM から行末まで */
      comment: {
        patterns: [
          {
            name: 'comment.line.apostrophe.smilebasic4',
            match: "'.*$",
          },
          {
            name: 'comment.line.rem.smilebasic4',
            match: `\\b(?i:REM)(?!${IDENTIFIER_CONTINUATION}).*$`,
          },
        ],
      },

      /**
       * " で囲まれた文字列。
       *
       * 閉じの " は省略でき、その場合は行末までが文字列になる（PRINT "HELLO と書ける）。
       * エスケープ記法は無く行もまたげないので、1 つの match で表せる。
       */
      string: {
        name: 'string.quoted.double.smilebasic4',
        match: '"[^"\\n]*"?',
      },

      number: {
        patterns: [
          {
            name: 'constant.numeric.hex.smilebasic4',
            match: '(?i:&h)[0-9A-Fa-f]+',
          },
          {
            name: 'constant.numeric.binary.smilebasic4',
            match: '(?i:&b)[01]+',
          },
          {
            name: 'constant.numeric.decimal.smilebasic4',
            match: '(?<![A-Za-z0-9_])(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[Ee][+-]?\\d+)?',
          },
        ],
      },

      /**
       * バックスラッシュは次の行への継続で、そこから行末までは実機でも
       * 読み飛ばされる。読み飛ばされる部分はコメントとして色を付けると、
       * 実行されないことが見て分かる。
       */
      'line-continuation': {
        match: '(\\\\)[ \\t]*(.*)$',
        captures: {
          1: { name: 'punctuation.separator.continuation.smilebasic4' },
          2: { name: 'comment.line.ignored.smilebasic4' },
        },
      },

      /**
       * 行頭に置かれた @ラベル は飛び先の定義。
       * 先頭の空白まで色が付かないよう、name は付けずに捕獲だけに当てている。
       */
      'label-definition': {
        match: '^\\s*(@[A-Za-z_][A-Za-z0-9_]*)',
        captures: { 1: { name: 'entity.name.label.smilebasic4' } },
      },

      /** GOTO @LOOP のように式の中に現れる @ラベル */
      'label-reference': {
        name: 'variable.other.label.smilebasic4',
        match: '@[A-Za-z_][A-Za-z0-9_]*',
      },

      /** #TRUE や #C_RED など。定数は必ず # で始まるので一覧を持たなくてよい */
      constant: {
        name: 'constant.language.smilebasic4',
        match: '#[A-Za-z_][A-Za-z0-9_]*',
      },

      /**
       * DEF の直後の名前をユーザー定義命令・関数の名前として扱う。
       * DEF 自身も捕獲してキーワードの色を当てないと、このルールが
       * DEF を丸ごと飲み込んでしまい制御構文の色が付かなくなる。
       */
      'definition-name': {
        name: 'meta.function.smilebasic4',
        match: `\\b((?i:DEF))\\s+(${IDENTIFIER})`,
        captures: {
          1: { name: 'keyword.control.smilebasic4' },
          2: { name: 'entity.name.function.smilebasic4' },
        },
      },

      'control-keyword': {
        name: 'keyword.control.smilebasic4',
        match: wordsPattern(CONTROL_KEYWORDS),
      },

      'word-operator': {
        name: 'keyword.operator.word.smilebasic4',
        match: wordsPattern(WORD_OPERATORS),
      },

      /** 予約語のうち制御構文でも演算子でもないもの */
      'statement-keyword': {
        name: 'keyword.other.smilebasic4',
        match: wordsPattern(STATEMENT_KEYWORDS),
      },

      /** 記号で書いた命令の略記（? = PRINT、T? = TPRINT、?? = INSPECT） */
      shorthand: {
        name: 'keyword.other.shorthand.smilebasic4',
        match: shorthandPattern(),
      },

      /** 組み込み命令・関数（language/builtins.ts から生成） */
      builtin: {
        name: 'support.function.smilebasic4',
        match: wordsPattern(BUILTINS),
      },

      /**
       * 組み込みでない「名前(」はユーザー定義関数の呼び出しとみなす。
       * 変数と区別する手掛かりが括弧しかないため、あくまで見た目上の推定。
       */
      'function-call': {
        name: 'entity.name.function.smilebasic4',
        match: `\\b${IDENTIFIER}(?=\\s*\\()`,
      },

      /** 変数。型サフィックスには別のスコープを当てて見分けやすくする */
      variable: {
        match: '\\b([A-Za-z_][A-Za-z0-9_]*)([%#$])?',
        captures: {
          1: { name: 'variable.other.smilebasic4' },
          2: { name: 'storage.type.smilebasic4' },
        },
      },

      /** 記号の演算子。長いものから並べる必要があるため一覧の順序に意味がある */
      operator: {
        name: 'keyword.operator.smilebasic4',
        match: '<<<|>>>|<<\\+|>>\\+|<<|>>|==|!=|<=|>=|&&|\\|\\||[<>=+\\-*/!]',
      },

      punctuation: {
        patterns: [
          {
            name: 'punctuation.separator.statement.smilebasic4',
            match: ':',
          },
          {
            name: 'punctuation.separator.smilebasic4',
            match: '[,;]',
          },
          {
            name: 'meta.brace.square.smilebasic4',
            match: '[\\[\\]]',
          },
          {
            name: 'meta.brace.round.smilebasic4',
            match: '[()]',
          },
        ],
      },
    },
  };
}
