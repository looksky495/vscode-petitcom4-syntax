/**
 * 生成した TextMate 文法を、VSCode が実際に使うのと同じ
 * vscode-textmate + Oniguruma で読み込んで色付けを確かめるテスト。
 *
 * grammar.test.ts が「定義の形が正しいか」を見るのに対し、こちらは
 * 「本物のエンジンに通したときに意図したスコープが付くか」を見る。
 * (?i:...) や後読みのような Oniguruma 固有の記法は、ここで初めて検証される。
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { before, describe, it } from 'node:test';

import * as oniguruma from 'vscode-oniguruma';
import * as textmate from 'vscode-textmate';

import { buildGrammar } from '../grammar/grammar';

const SCOPE_NAME = 'source.smilebasic4';

let grammar: textmate.IGrammar;

before(async () => {
  const wasm = readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
  await oniguruma.loadWASM(wasm);

  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
      createOnigString: (text) => new oniguruma.OnigString(text),
    }),
    loadGrammar: async (scopeName) =>
      scopeName === SCOPE_NAME
        ? textmate.parseRawGrammar(JSON.stringify(buildGrammar()), 'smilebasic4.tmLanguage.json')
        : null,
  });

  const loaded = await registry.loadGrammar(SCOPE_NAME);
  assert.ok(loaded, '文法の読み込みに失敗しました');
  grammar = loaded;
});

/** 1 行を色付けし、[文字列, 最も内側のスコープ] の並びを返す。空白だけの部分は除く。 */
function tokensOf(line: string): Array<[string, string]> {
  return grammar
    .tokenizeLine(line, textmate.INITIAL)
    .tokens.map(
      (token) => [line.slice(token.startIndex, token.endIndex), token.scopes.at(-1)!] as [string, string],
    )
    .filter(([text]) => text.trim() !== '');
}

/** 行の中の word にちょうど対応するトークンの、最も内側のスコープを返す。 */
function scopeOf(line: string, word: string): string {
  const found = tokensOf(line).filter(([text]) => text === word);
  assert.equal(found.length, 1, `${line} の中で「${word}」が 1 つのトークンになっていません`);
  return found[0][1];
}

describe('キーワードの色付け', () => {
  it('制御構文に keyword.control が付く', () => {
    for (const word of ['IF', 'THEN', 'ENDIF', 'FOR', 'TO', 'NEXT', 'ENDCASE', 'ENDLOOP']) {
      assert.equal(
        scopeOf(`${word} `, word),
        'keyword.control.smilebasic4',
        `${word} のスコープが違います`,
      );
    }
  });

  it('単語の演算子に keyword.operator.word が付く', () => {
    assert.equal(scopeOf('A AND B', 'AND'), 'keyword.operator.word.smilebasic4');
    assert.equal(scopeOf('A DIV B', 'DIV'), 'keyword.operator.word.smilebasic4');
    assert.equal(scopeOf('A MOD B', 'MOD'), 'keyword.operator.word.smilebasic4');
  });

  it('PRINT など制御構文でない予約語に keyword.other が付く', () => {
    assert.equal(scopeOf('PRINT "A"', 'PRINT'), 'keyword.other.smilebasic4');
    assert.equal(scopeOf('VAR A=1', 'VAR'), 'keyword.other.smilebasic4');
  });

  it('小文字で書いてもキーワードとして色が付く', () => {
    assert.equal(scopeOf('if a then', 'if'), 'keyword.control.smilebasic4');
    assert.equal(scopeOf('print "a"', 'print'), 'keyword.other.smilebasic4');
  });

  it('記号の略記に色を付ける', () => {
    assert.equal(scopeOf('?"HELLO"', '?'), 'keyword.other.shorthand.smilebasic4');
    assert.equal(scopeOf('T? 1,"HELLO"', 'T?'), 'keyword.other.shorthand.smilebasic4');
    assert.equal(scopeOf('?? A', '??'), 'keyword.other.shorthand.smilebasic4');
  });

  it('??? を ?? と ? の 2 つに分けて色付けする', () => {
    const tokens = tokensOf('???"abc"');
    assert.deepEqual(
      tokens.map(([text]) => text),
      ['??', '?', '"abc"'],
    );
  });

  it('AT? の T? を略記にしない', () => {
    assert.equal(scopeOf('AT?', 'AT'), 'variable.other.smilebasic4');
    assert.equal(scopeOf('AT?', '?'), 'keyword.other.shorthand.smilebasic4');
  });
});

describe('組み込み命令の色付け', () => {
  it('組み込み命令に support.function が付く', () => {
    assert.equal(scopeOf('SPSET 0,500', 'SPSET'), 'support.function.smilebasic4');
    assert.equal(scopeOf('A=ABS(B)', 'ABS'), 'support.function.smilebasic4');
  });

  it('$ や % で終わる組み込み関数も丸ごと色が付く', () => {
    assert.equal(scopeOf('A$=CHR$(65)', 'CHR$'), 'support.function.smilebasic4');
    assert.equal(scopeOf('A=ARRAY%(10)', 'ARRAY%'), 'support.function.smilebasic4');
  });

  it('前方が一致する短い命令に食われず、長い命令が丸ごと色が付く', () => {
    // SPCOL が先に一致すると SPCOLOR の OR だけ色が変わってしまう
    assert.equal(scopeOf('SPCOLOR 0,#C_RED', 'SPCOLOR'), 'support.function.smilebasic4');
    assert.equal(scopeOf('SPCOL 0,1', 'SPCOL'), 'support.function.smilebasic4');
    assert.equal(scopeOf('SPCOLVEC 0,1,2', 'SPCOLVEC'), 'support.function.smilebasic4');
  });

  it('型サフィックスが付くと組み込み命令ではなく変数になる', () => {
    // 名前空間が別なので INT% は INT 関数ではなく変数
    assert.equal(scopeOf('INT%=1', 'INT'), 'variable.other.smilebasic4');
    assert.equal(scopeOf('INT%=1', '%'), 'storage.type.smilebasic4');
  });
});

describe('リテラルとコメント', () => {
  it('コメントに comment.line が付く', () => {
    assert.equal(scopeOf("A=1 'メモ", "'メモ"), 'comment.line.apostrophe.smilebasic4');
    assert.equal(scopeOf('REM メモ', 'REM メモ'), 'comment.line.rem.smilebasic4');
  });

  it('REMOVE をコメントにしない', () => {
    assert.equal(scopeOf('REMOVE A,0', 'REMOVE'), 'support.function.smilebasic4');
  });

  it('文字列に string.quoted が付き、中の記号を拾わない', () => {
    assert.equal(scopeOf('PRINT "IT\'S OK"', '"IT\'S OK"'), 'string.quoted.double.smilebasic4');
    assert.equal(scopeOf('PRINT "IF THEN"', '"IF THEN"'), 'string.quoted.double.smilebasic4');
  });

  it('閉じの " を省略した文字列も行末まで色が付く', () => {
    assert.equal(scopeOf('PRINT "HELLO', '"HELLO'), 'string.quoted.double.smilebasic4');
    assert.equal(scopeOf('PRINT "((( ENDIF', '"((( ENDIF'), 'string.quoted.double.smilebasic4');
    // ? の略記と組み合わせても両方が正しく分かれる
    assert.equal(scopeOf('?"THE END', '?'), 'keyword.other.shorthand.smilebasic4');
    assert.equal(scopeOf('?"THE END', '"THE END'), 'string.quoted.double.smilebasic4');
  });

  it('数値リテラルの種類ごとにスコープを分ける', () => {
    assert.equal(scopeOf('A=&HFF00', '&HFF00'), 'constant.numeric.hex.smilebasic4');
    assert.equal(scopeOf('A=&B1010', '&B1010'), 'constant.numeric.binary.smilebasic4');
    assert.equal(scopeOf('A=1.5', '1.5'), 'constant.numeric.decimal.smilebasic4');
    assert.equal(scopeOf('A=1E-3', '1E-3'), 'constant.numeric.decimal.smilebasic4');
  });

  it('識別子の中の数字を数値にしない', () => {
    assert.equal(scopeOf('X1=1', 'X1'), 'variable.other.smilebasic4');
  });
});

describe('ラベル・定数・定義', () => {
  it('行頭のラベルを定義、式中のラベルを参照として区別する', () => {
    assert.equal(scopeOf('@MAIN', '@MAIN'), 'entity.name.label.smilebasic4');
    assert.equal(scopeOf('  @MAIN', '@MAIN'), 'entity.name.label.smilebasic4');
    assert.equal(scopeOf('GOTO @MAIN', '@MAIN'), 'variable.other.label.smilebasic4');
  });

  it('# で始まる語に constant.language が付く', () => {
    assert.equal(scopeOf('A=#TRUE', '#TRUE'), 'constant.language.smilebasic4');
    assert.equal(scopeOf('SPCOLOR 0,#C_RED', '#C_RED'), 'constant.language.smilebasic4');
  });

  it('DEF はキーワードのまま、直後の名前が関数名になる', () => {
    assert.equal(scopeOf('DEF ADD(X,Y)', 'DEF'), 'keyword.control.smilebasic4');
    assert.equal(scopeOf('DEF ADD(X,Y)', 'ADD'), 'entity.name.function.smilebasic4');
    assert.equal(scopeOf('DEF REVERSE$(T$)', 'REVERSE$'), 'entity.name.function.smilebasic4');
  });

  it('組み込みでない「名前(」を関数呼び出しとみなす', () => {
    assert.equal(scopeOf('A=MYFUNC(1)', 'MYFUNC'), 'entity.name.function.smilebasic4');
  });

  it('VAR / DIM / CALL は関数形でも予約語のまま色を付ける', () => {
    // 括弧が続くと function-call ルールに拾われてしまわないことの確認
    assert.equal(scopeOf('VAR("FOO") = 3', 'VAR'), 'keyword.other.smilebasic4');
    assert.equal(scopeOf('? DIM(WORK)', 'DIM'), 'keyword.other.smilebasic4');
    assert.equal(scopeOf('A = CALL("USERFC",X)', 'CALL'), 'keyword.other.smilebasic4');
  });

  it('VAR("2:A$") の引数は文字列として色を付ける', () => {
    // 中の $ を型サフィックスとして拾ってしまわないことの確認
    assert.equal(scopeOf('VAR("2:A$") = "X"', '"2:A$"'), 'string.quoted.double.smilebasic4');
  });

  it('変数の型サフィックスに別のスコープを当てる', () => {
    assert.equal(scopeOf('A$="X"', 'A'), 'variable.other.smilebasic4');
    assert.equal(scopeOf('A$="X"', '$'), 'storage.type.smilebasic4');
  });
});

describe('演算子と行継続', () => {
  it('記号の演算子は長いものを優先する', () => {
    assert.equal(scopeOf('A=B<<<1', '<<<'), 'keyword.operator.smilebasic4');
    assert.equal(scopeOf('A=B<<+1', '<<+'), 'keyword.operator.smilebasic4');
    assert.equal(scopeOf('IF A<=B THEN END', '<='), 'keyword.operator.smilebasic4');
  });

  it('行末のバックスラッシュを行継続として色付けする', () => {
    assert.equal(scopeOf('A=1+\\', '\\'), 'punctuation.separator.continuation.smilebasic4');
  });

  it('バックスラッシュより後ろは読み飛ばされるのでコメントとして色を付ける', () => {
    // 実機では読み飛ばされる部分なので、実行されないことが見て分かるようにする
    const line = "VAR A%=1, \\ ' 最初の値";
    assert.equal(scopeOf(line, '\\'), 'punctuation.separator.continuation.smilebasic4');
    assert.equal(scopeOf(line, "' 最初の値"), 'comment.line.ignored.smilebasic4');

    const garbage = 'A=1+\\ @@$$5';
    assert.equal(scopeOf(garbage, '\\'), 'punctuation.separator.continuation.smilebasic4');
    assert.equal(scopeOf(garbage, '@@$$5'), 'comment.line.ignored.smilebasic4');
  });

  it(': を文の区切りとして色付けする', () => {
    assert.equal(scopeOf('PRINT 1:END', ':'), 'punctuation.separator.statement.smilebasic4');
  });
});
