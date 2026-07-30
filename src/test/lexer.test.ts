import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TokenKind, tokenize } from '../parser/lexer';

/** kind と text の組だけを取り出す。末尾に必ず入る改行は落とす。 */
function shape(source: string): Array<[TokenKind, string]> {
  const { tokens } = tokenize(source);
  return tokens
    .filter((token) => token.kind !== TokenKind.LineBreak)
    .map((token) => [token.kind, token.text]);
}

function messages(source: string): string[] {
  return tokenize(source).problems.map((problem) => problem.message);
}

function severities(source: string): string[] {
  return tokenize(source).problems.map((problem) => problem.severity);
}

describe('コメント', () => {
  it("' から行末までがコメントになる", () => {
    assert.deepEqual(shape("A=1 'メモ"), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1'],
      [TokenKind.Comment, "'メモ"],
    ]);
  });

  it('REM から行末までがコメントになる', () => {
    assert.deepEqual(shape('REM これはコメント'), [[TokenKind.Comment, 'REM これはコメント']]);
  });

  it('REMOVE は REM として扱わない', () => {
    assert.deepEqual(shape('REMOVE A,0'), [
      [TokenKind.Identifier, 'REMOVE'],
      [TokenKind.Identifier, 'A'],
      [TokenKind.Comma, ','],
      [TokenKind.Number, '0'],
    ]);
  });

  it("文字列の中の ' はコメントにならない", () => {
    assert.deepEqual(shape('PRINT "IT\'S"'), [
      [TokenKind.Keyword, 'PRINT'],
      [TokenKind.String, '"IT\'S"'],
    ]);
  });
});

describe('リテラル', () => {
  it('16進数と2進数を読む', () => {
    assert.deepEqual(shape('A=&HFF00 B=&B1010'), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '&HFF00'],
      [TokenKind.Identifier, 'B'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '&B1010'],
    ]);
  });

  it('桁のない &H を誤りとして報告する', () => {
    assert.deepEqual(messages('A=&H'), ['16進数の桁がありません。']);
  });

  it('小数点と指数表記を読む', () => {
    assert.deepEqual(shape('A=1.5 B=.5 C=1E-3'), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1.5'],
      [TokenKind.Identifier, 'B'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '.5'],
      [TokenKind.Identifier, 'C'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1E-3'],
    ]);
  });

  it('指数部の桁が欠けているのを誤りとして報告する', () => {
    assert.deepEqual(messages('A=1E+'), ['指数部の桁がありません。']);
  });

  it('閉じの " を省略すると行末までが文字列になる', () => {
    assert.deepEqual(shape('PRINT "ABC'), [
      [TokenKind.Keyword, 'PRINT'],
      [TokenKind.String, '"ABC'],
    ]);
    assert.deepEqual(messages('PRINT "ABC'), []);
  });

  it('閉じを省略した文字列は次の行に続かない', () => {
    assert.deepEqual(shape('PRINT "ABC\nEND'), [
      [TokenKind.Keyword, 'PRINT'],
      [TokenKind.String, '"ABC'],
      [TokenKind.Keyword, 'END'],
    ]);
  });

  it('閉じを省略した文字列は行継続のバックスラッシュも飲み込む', () => {
    // 文字列の中身なので行継続として解釈してはいけない
    assert.deepEqual(shape('PRINT "ABC\\\nEND'), [
      [TokenKind.Keyword, 'PRINT'],
      [TokenKind.String, '"ABC\\'],
      [TokenKind.Keyword, 'END'],
    ]);
  });
});

describe('識別子', () => {
  it('型サフィックスを識別子の一部として読む', () => {
    assert.deepEqual(shape('A$="X":B%=1:C#=1.0'), [
      [TokenKind.Identifier, 'A$'],
      [TokenKind.Operator, '='],
      [TokenKind.String, '"X"'],
      [TokenKind.StatementSeparator, ':'],
      [TokenKind.Identifier, 'B%'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1'],
      [TokenKind.StatementSeparator, ':'],
      [TokenKind.Identifier, 'C#'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1.0'],
    ]);
  });

  it('キーワードは大文字小文字を区別せず正規化する', () => {
    const { tokens } = tokenize('if');
    assert.equal(tokens[0].kind, TokenKind.Keyword);
    assert.equal(tokens[0].text, 'if');
    assert.equal(tokens[0].keyword, 'IF');
  });

  it('型サフィックスが付いた語はキーワードにしない', () => {
    assert.deepEqual(shape('END$'), [[TokenKind.Identifier, 'END$']]);
  });

  it('ラベルと定数を区別して読む', () => {
    assert.deepEqual(shape('GOTO @LOOP'), [
      [TokenKind.Keyword, 'GOTO'],
      [TokenKind.Label, '@LOOP'],
    ]);
    assert.deepEqual(shape('A=#TRUE'), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Constant, '#TRUE'],
    ]);
  });
});

describe('略記', () => {
  it('? を PRINT として読む', () => {
    const { tokens } = tokenize('?"HELLO"');
    assert.equal(tokens[0].keyword, 'PRINT');
    assert.equal(tokens[0].text, '?');
  });

  it('T? を TPRINT として読む', () => {
    const { tokens } = tokenize('T? 1,"HELLO"');
    assert.equal(tokens[0].keyword, 'TPRINT');
    assert.equal(tokens[0].text, 'T?');
  });

  it('t? と小文字で書いても TPRINT として読む', () => {
    assert.equal(tokenize('t? 1,"A"').tokens[0].keyword, 'TPRINT');
  });

  it('?? を INSPECT として読む', () => {
    // INSPECT は予約語ではなく組み込み命令なので、綴ったときと同じ Identifier になる
    assert.deepEqual(shape('?? "12345"*10'), [
      [TokenKind.Identifier, '??'],
      [TokenKind.String, '"12345"'],
      [TokenKind.Operator, '*'],
      [TokenKind.Number, '10'],
    ]);
  });

  it('??? は ??（INSPECT）と ?（PRINT）に分かれる', () => {
    // 実機でも INSPECT の引数不足エラーになる並び
    assert.deepEqual(shape('???"abc"'), [
      [TokenKind.Identifier, '??'],
      [TokenKind.Keyword, '?'],
      [TokenKind.String, '"abc"'],
    ]);
  });

  it('AT? の T? は略記にしない', () => {
    assert.deepEqual(shape('AT?'), [
      [TokenKind.Identifier, 'AT'],
      [TokenKind.Keyword, '?'],
    ]);
  });
});

describe('行の扱い', () => {
  it('行末のバックスラッシュで改行を挟まず同じ論理行にする', () => {
    const { tokens, problems } = tokenize('A=1+\\\n2');
    assert.deepEqual(problems, []);
    // 継続された改行は LineBreak にならないので、末尾の 1 つだけが残る
    assert.equal(tokens.filter((token) => token.kind === TokenKind.LineBreak).length, 1);
  });

  it('バックスラッシュの後にコメントを書いても継続として扱う', () => {
    const source = "VAR A%=1, \\ ' 最初の値\nVAR B%=2";
    assert.deepEqual(tokenize(source).problems, []);
    assert.deepEqual(shape(source), [
      [TokenKind.Keyword, 'VAR'],
      [TokenKind.Identifier, 'A%'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1'],
      [TokenKind.Comma, ','],
      [TokenKind.Comment, "' 最初の値"],
      [TokenKind.Keyword, 'VAR'],
      [TokenKind.Identifier, 'B%'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '2'],
    ]);
    // 継続されたので論理行は 1 つ。末尾の 1 つだけが LineBreak になる
    assert.equal(
      tokenize(source).tokens.filter((token) => token.kind === TokenKind.LineBreak).length,
      1,
    );
  });

  it('バックスラッシュの後の REM コメントも継続として扱う', () => {
    assert.deepEqual(tokenize('A=1+\\ REM つづく\n2').problems, []);
  });

  it('複数行にわたる配列リテラルが 1 つの論理行になる', () => {
    const source = [
      'VAR SETTINGS[] = [\\',
      "1,\\ ' メモリ解放",
      "0,\\ ' 画面非表示",
      "0 \\ ' Joy-Con",
      ']',
    ].join('\n');
    assert.deepEqual(tokenize(source).problems, []);
    assert.equal(
      tokenize(source).tokens.filter((token) => token.kind === TokenKind.LineBreak).length,
      1,
    );
  });

  it('バックスラッシュより後ろは読み飛ばし、情報として知らせる', () => {
    // 実機では読み飛ばされるため誤りではない。ただし書き間違いの可能性が高い。
    const source = 'A=1+\\ @@$$5\n2';
    assert.deepEqual(messages(source), [
      "バックスラッシュより後ろは無視されます。コメントにするなら ' を付けてください。",
    ]);
    assert.deepEqual(severities(source), ['information']);
    // 読み飛ばされた部分はトークンにしない
    assert.deepEqual(shape(source), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Number, '1'],
      [TokenKind.Operator, '+'],
      [TokenKind.Number, '2'],
    ]);
  });

  it('読み飛ばす部分の位置は記号の後ろを指す', () => {
    const [problem] = tokenize('A=1\\ @@$$5').problems;
    assert.equal(problem.line, 0);
    assert.equal(problem.column, 5); // '\' が 3 桁目、空白を飛ばして 5 桁目から
    assert.equal(problem.length, 5); // '@@$$5'
  });

  it('REMOVE のような語も読み飛ばすが、REM とは混同しない', () => {
    assert.deepEqual(severities('A=1\\ REMOVE\n2'), ['information']);
  });

  it('継続していない改行の後は行番号が進む', () => {
    const { tokens } = tokenize('A=1\nB=2');
    const b = tokens.find((token) => token.text === 'B');
    assert.equal(b?.line, 1);
    assert.equal(b?.column, 0);
  });

  it('ファイル末尾には必ず改行トークンが入る', () => {
    const { tokens } = tokenize('A=1');
    assert.equal(tokens.at(-1)?.kind, TokenKind.LineBreak);
  });
});

describe('演算子', () => {
  it('長い演算子を優先して読む', () => {
    assert.deepEqual(shape('A=B<<<1'), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Identifier, 'B'],
      [TokenKind.Operator, '<<<'],
      [TokenKind.Number, '1'],
    ]);
    assert.deepEqual(shape('A=B<<+1'), [
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '='],
      [TokenKind.Identifier, 'B'],
      [TokenKind.Operator, '<<+'],
      [TokenKind.Number, '1'],
    ]);
  });

  it('&& を数値リテラルと混同しない', () => {
    assert.deepEqual(shape('IF A&&B THEN END'), [
      [TokenKind.Keyword, 'IF'],
      [TokenKind.Identifier, 'A'],
      [TokenKind.Operator, '&&'],
      [TokenKind.Identifier, 'B'],
      [TokenKind.Keyword, 'THEN'],
      [TokenKind.Keyword, 'END'],
    ]);
  });
});
