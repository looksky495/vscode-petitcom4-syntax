import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyze } from '../parser/diagnostics';

function messages(source: string): string[] {
  return analyze(source).map((diagnostic) => diagnostic.message);
}

function assertNoProblem(source: string): void {
  assert.deepEqual(messages(source), []);
}

describe('IF の 2 つの形', () => {
  it('1 行形式は ENDIF を要求しない', () => {
    assertNoProblem('IF A==1 THEN PRINT "OK"');
  });

  it('1 行形式の ELSE も ENDIF を要求しない', () => {
    assertNoProblem('IF A>1 THEN PRINT "A" ELSE PRINT "B"');
  });

  it('THEN の後にコメントだけならブロック形式として ENDIF を要求する', () => {
    assert.deepEqual(messages("IF A==1 THEN 'ここから\nPRINT 1"), [
      'IF に対応する ENDIF がありません。',
    ]);
  });

  it('ブロック形式は ENDIF で閉じれば通る', () => {
    assertNoProblem('IF A==1 THEN\n  PRINT 1\nELSE\n  PRINT 2\nENDIF');
  });

  it('ELSEIF を挟んでも通る', () => {
    assertNoProblem('IF A==1 THEN\nELSEIF A==2 THEN\nELSE\nENDIF');
  });

  it('THEN も GOTO も無い IF を報告する', () => {
    assert.deepEqual(messages('IF A==1\nENDIF'), ['IF には THEN か GOTO が必要です。']);
  });

  it('THEN も GOTO も無い ELSEIF を報告する', () => {
    assert.deepEqual(messages('IF A==1 THEN\nELSEIF A==2\nENDIF'), [
      'ELSEIF には THEN か GOTO が必要です。',
    ]);
  });

  it('ELSE が重複していれば報告する', () => {
    assert.deepEqual(messages('IF A THEN\nELSE\nELSE\nENDIF'), ['ELSE が重複しています。']);
  });

  it('ELSE より後の ELSEIF を報告する', () => {
    assert.deepEqual(messages('IF A THEN\nELSE\nELSEIF B THEN\nENDIF'), [
      'ELSEIF は ELSE より後には書けません。',
    ]);
  });

  it('対応する IF が無い ELSE を報告する', () => {
    assert.deepEqual(messages('PRINT 1\nELSE\nPRINT 2'), ['ELSE に対応する IF がありません。']);
  });

  it('行継続を挟んだ THEN もブロック形式として扱う', () => {
    assert.deepEqual(messages('IF A==1 \\\nTHEN\nPRINT 1'), [
      'IF に対応する ENDIF がありません。',
    ]);
  });
});

describe('IF 式 GOTO @ラベル の形', () => {
  // 公式リファレンス「制御命令」に載っている 3 つ目の形。THEN を伴わず、
  // 必ず 1 行で完結するので ENDIF を要求してはいけない。
  it('THEN を伴わない GOTO 形が通る', () => {
    assertNoProblem('@MAIN\nIF A==1 GOTO @MAIN');
  });

  it('ELSE に処理を書く形が通る', () => {
    assertNoProblem('@JMP1\nIF X<0 GOTO @JMP1 ELSE PRINT A$');
  });

  it('ELSE 直後の GOTO 省略が通る', () => {
    assertNoProblem('@JMP1\n@JMP2\nIF Y==5 GOTO @JMP1 ELSE @JMP2');
  });

  it('飛び先に文字列を使う形が通る', () => {
    // 実行時に解決されるのでラベルの定義を要求しない
    assertNoProblem('@LABEL2\nIF A==0 GOTO "@LABEL1" ELSE @LABEL2');
  });

  it('GOTO 形でも飛び先ラベルの未定義は報告する', () => {
    assert.deepEqual(messages('IF A==1 GOTO @NOWHERE'), [
      'ラベル @NOWHERE が定義されていません。',
    ]);
  });

  it('ELSE 直後の省略された GOTO の飛び先も検査する', () => {
    assert.deepEqual(messages('@JMP1\nIF Y==5 GOTO @JMP1 ELSE @NOWHERE'), [
      'ラベル @NOWHERE が定義されていません。',
    ]);
  });

  it('THEN の後の GOTO は THEN 形として扱う', () => {
    assertNoProblem('@MAIN\nIF A==1 THEN GOTO @MAIN');
  });

  it('ブロック形式の中の GOTO は 1 行形式と誤認しない', () => {
    assert.deepEqual(messages('@MAIN\nIF A==1 THEN\n GOTO @MAIN\nPRINT 1'), [
      'IF に対応する ENDIF がありません。',
    ]);
  });
});

describe('VAR / DIM / CALL の命令形と関数形', () => {
  // VAR と DIM と CALL は、値を返さない命令としても、値を返す関数としても書ける。
  // 出典: 言語仕様「変数の実行時参照」「命令・関数の実行時参照」、
  //       reference:変数や配列の定義、操作に関する命令（DIM(配列)）
  it('変数と配列を定義する命令形が通る', () => {
    assertNoProblem('VAR A$');
    assertNoProblem('VAR A=0,B,C');
    assertNoProblem('DIM WORK[10,20]');
    assertNoProblem('VAR ATR[4]=[1,2,3,4]');
    assertNoProblem('DIM POS$[10,5]=["X","Y","Z","W"]');
    assertNoProblem('DIM IMAGE[]=[0,1,2,3,4]');
  });

  it('VAR("変数名") の実行時参照が通る', () => {
    assertNoProblem('VAR("FOO") = 3'); // 代入先として
    assertNoProblem('A = VAR("FOO")'); // 値として
  });

  it('スロット番号を付けた VAR("2:A$") が通る', () => {
    assertNoProblem('VAR("2:A$") = "X"');
    assertNoProblem('? VAR("2:A$")');
  });

  it('配列の次元を調べる DIM(配列) が通る', () => {
    assertNoProblem('DIM WORK[10,20]\n? DIM(WORK)\n? DIM(WORK,1)');
  });

  it('CALL の命令形（OUT 付き）と関数形が通る', () => {
    assertNoProblem('CALL "USERCD",X,Y OUT A,B');
    assertNoProblem('A = CALL("USERFC",X,Y)');
  });

  it('VAR に渡した文字列を飛び先ラベルと誤認しない', () => {
    // ラベル文字列の形（"@名前"）の検査が VAR まで及んではいけない
    assertNoProblem('VAR("FOO") = 3');
    assertNoProblem('DIM("X")');
  });

  it('VAR に渡した文字列の中身は検査しない', () => {
    // 実行時に解決される名前なので、静的に正しさを判断できない。
    // 添字を文字列の中に書けるかどうかも確認が取れていないため、
    // どちらの書き方も通す（誤って警告するより見逃す方を選ぶ）。
    assertNoProblem('VAR("4:A$[1]")');
    assertNoProblem('VAR("A$")[1] = "X"');
    assertNoProblem('VAR("") = 1');
  });
});

describe('ユーザー定義命令・関数', () => {
  it('DEF の入れ子を報告する', () => {
    assert.deepEqual(messages('DEF A\nDEF B\nEND\nEND'), ['DEF の中に DEF は定義できません。']);
  });

  it('定義名の重複を報告する', () => {
    assert.deepEqual(messages('DEF FOO\nEND\nDEF FOO\nEND'), [
      'ユーザー定義命令・関数 FOO が重複しています。',
    ]);
  });

  it('引数の形が違っても同じ名前なら重複とする', () => {
    assert.deepEqual(messages('DEF FOO(X)\nRETURN X\nEND\nDEF FOO X,Y\nEND'), [
      'ユーザー定義命令・関数 FOO が重複しています。',
    ]);
  });

  it('定義名の大文字小文字は区別しない', () => {
    assert.deepEqual(messages('DEF Foo\nEND\nDEF FOO\nEND'), [
      'ユーザー定義命令・関数 FOO が重複しています。',
    ]);
  });

  it('定義名の書き忘れを報告する', () => {
    assert.deepEqual(messages('DEF\nEND'), ['DEF に定義名がありません。']);
  });

  it('可変長引数や COMMON 付きの定義は通る', () => {
    assertNoProblem('DEF VARFUNC * OUT *\nEND');
    assertNoProblem('COMMON DEF FOO(X,Y,Z)\nRETURN X\nEND');
  });
});

describe('ラベルの有効範囲', () => {
  // 出典: DEF共通ルール「DEF～END範囲で定義された変数やラベルはDEF外から使用できない」
  //              「DEF～END範囲をまたがったGOTO,GOSUBはできない」
  it('DEF の中から外のラベルへは飛べない', () => {
    assert.deepEqual(messages('@G\nDEF F\nGOTO @G\nEND'), [
      'ラベル @G は DEF の外で定義されているため、DEF の中からは使えません。',
    ]);
  });

  it('DEF の外から中のラベルへは飛べない', () => {
    assert.deepEqual(messages('DEF F\n@L\nEND\nGOSUB @L'), [
      'ラベル @L は DEF の中で定義されているため、DEF の外からは使えません。',
    ]);
  });

  it('別の DEF のラベルへは飛べない', () => {
    assert.deepEqual(messages('DEF A\n@L\nEND\nDEF B\nGOTO @L\nEND'), [
      'ラベル @L は別の DEF の中で定義されているため、ここからは使えません。',
    ]);
  });

  it('別々の DEF に同じ名前のラベルがあってもよい', () => {
    assertNoProblem('DEF A\n@L\nGOTO @L\nEND\nDEF B\n@L\nGOTO @L\nEND');
  });

  it('同じ DEF の中での重複は報告する', () => {
    assert.deepEqual(messages('DEF A\n@L\n@L\nEND'), ['ラベル @L が重複しています。']);
  });

  it('RESTORE は DEF をまたいでも報告しない', () => {
    // DATA 行は DEF の外にあるのが普通で、またげないという明記が無いため許容する
    assertNoProblem('@D\nDATA 1,2\nDEF F\nRESTORE @D\nEND');
  });
});

describe('文字列で書いた飛び先', () => {
  it('@ で始まらないラベル文字列を報告する', () => {
    assert.deepEqual(messages('GOTO "TEST"'), [
      'ラベル文字列は "@名前" または "スロット番号:@名前" の形で書いてください。',
    ]);
  });

  it('正しい形のラベル文字列は通る', () => {
    assertNoProblem('GOTO "@TEST"');
    assertNoProblem('GOTO "1:@TEST"'); // スロット番号付き
    assertNoProblem('GOSUB "@SUB"');
    assertNoProblem('RESTORE "@DATA1"');
  });

  it('式の一部なら中身を判定しない', () => {
    assertNoProblem('GOTO "@"+NAME$');
  });

  it('ON ～ GOTO の飛び先の文字列を報告する', () => {
    // 出典: 「ON～GOTOのラベルには、文字列は使えない」
    assert.deepEqual(messages('@A\nON I GOTO "@A"'), [
      'ON ～ GOTO / GOSUB の飛び先に文字列は使えません。',
    ]);
  });

  it('THEN / ELSE 直後の GOTO 省略で文字列を使うのを報告する', () => {
    // 出典: 「ELSE直後でのGOTO省略時に文字列は使えない」
    assert.deepEqual(messages('IF A THEN "@X"'), [
      'THEN の直後で GOTO を省略するとき、飛び先に文字列は使えません。',
    ]);
    assert.deepEqual(messages('@X\nIF A==0 GOTO "@X" ELSE "@Y"'), [
      'ELSE の直後で GOTO を省略するとき、飛び先に文字列は使えません。',
    ]);
  });

  it('ELSE の後に GOTO を明示すれば文字列を使える', () => {
    assertNoProblem('@X\nIF A==0 GOTO "@X" ELSE GOTO "@Y"');
  });

  it('PRINT などの文字列を飛び先と誤認しない', () => {
    assertNoProblem('IF A THEN PRINT "HELLO"');
    assertNoProblem('@L\nGOTO @L\nA$="TEST"');
  });
});

describe('閉じの " を省略した文字列', () => {
  it('誤りとして報告しない', () => {
    assertNoProblem('PRINT "HELLO');
    assertNoProblem('A$="HELLO\nB$="WORLD');
  });

  it('文字列の中の括弧やキーワードを拾わない', () => {
    assertNoProblem('PRINT "((( ENDIF');
  });
});

describe('繰り返しのブロック', () => {
  it('FOR〜NEXT、WHILE〜WEND、REPEAT〜UNTIL、LOOP〜ENDLOOP が通る', () => {
    assertNoProblem('FOR I=0 TO 9\nNEXT');
    assertNoProblem('WHILE A<B\nWEND');
    assertNoProblem('REPEAT\nA=A+1\nUNTIL A>B');
    assertNoProblem('LOOP\nENDLOOP');
  });

  it('1 行に収めた FOR ループも通る', () => {
    assertNoProblem('FOR I=0 TO 9:PRINT I:NEXT');
  });

  it('TO が無い FOR を報告する', () => {
    assert.deepEqual(messages('FOR I=0\nNEXT'), ['FOR に対応する TO がありません。']);
  });

  it('閉じ忘れを報告する', () => {
    assert.deepEqual(messages('WHILE A<B\nPRINT 1'), ['WHILE に対応する WEND がありません。']);
  });

  it('対応する開きが無い閉じを報告する', () => {
    assert.deepEqual(messages('PRINT 1\nWEND'), ['WEND に対応する WHILE がありません。']);
  });
});

describe('CASE のブロック', () => {
  it('WHEN と OTHERWISE を含む CASE が通る', () => {
    assertNoProblem('CASE A\nWHEN 0: PRINT "A"\nWHEN 1: PRINT "B"\nOTHERWISE: PRINT "X"\nENDCASE');
  });

  it('CASE の外の WHEN を報告する', () => {
    assert.deepEqual(messages('WHEN 0'), ['WHEN に対応する CASE がありません。']);
  });

  it('OTHERWISE より後の WHEN を報告する', () => {
    assert.deepEqual(messages('CASE A\nOTHERWISE\nWHEN 1\nENDCASE'), [
      'WHEN は OTHERWISE より後には書けません。',
    ]);
  });
});

describe('DEF と END', () => {
  it('DEF〜END が通る', () => {
    assertNoProblem('DEF ADD(X,Y)\nRETURN X+Y\nEND');
  });

  it('COMMON DEF も通る', () => {
    assertNoProblem('COMMON DEF FOO(X)\nRETURN X\nEND');
  });

  it('DEF の外の END はプログラム終了なのでエラーにしない', () => {
    assertNoProblem('PRINT "HELLO"\nEND');
  });

  it('閉じられていない DEF を報告する', () => {
    assert.deepEqual(messages('DEF FOO\nPRINT 1'), ['DEF に対応する END がありません。']);
  });
});

describe('入れ子の閉じ忘れ', () => {
  it('内側の閉じ忘れを内側の位置で報告する', () => {
    const diagnostics = analyze('DEF FOO\nFOR I=0 TO 9\nIF A THEN\nEND');
    assert.deepEqual(
      diagnostics.map((d) => [d.line, d.message]),
      [
        [1, 'FOR に対応する NEXT がありません。'],
        [2, 'IF に対応する ENDIF がありません。'],
      ],
    );
  });
});

describe('BREAK と CONTINUE', () => {
  it('繰り返しの中なら通る', () => {
    assertNoProblem('FOR I=0 TO 9\nIF A THEN BREAK\nCONTINUE\nNEXT');
  });

  it('繰り返しの外なら報告する', () => {
    assert.deepEqual(messages('BREAK'), [
      'BREAK は FOR / WHILE / REPEAT / LOOP の中でのみ使えます。',
    ]);
  });

  it('ON BREAK GOTO の BREAK は繰り返しの脱出ではないので報告しない', () => {
    assertNoProblem('ON BREAK GOTO @FINISH\nLOOP\nENDLOOP\n@FINISH\nEND');
  });
});

describe('括弧の対応', () => {
  it('入れ子の括弧が通る', () => {
    assertNoProblem('A=ABS(B[1]*(C+2))');
  });

  it('閉じ忘れを報告する', () => {
    assert.deepEqual(messages('A=ABS(B'), ['( が閉じられていません。']);
  });

  it('余分な閉じ括弧を報告する', () => {
    assert.deepEqual(messages('A=B)'), [') に対応する開き括弧がありません。']);
  });

  it('括弧の種類の不一致を報告する', () => {
    assert.deepEqual(messages('A=B[1)'), ['[ は ] で閉じてください。']);
  });

  it('行継続で複数行に分けた括弧を閉じ忘れと誤認しない', () => {
    assertNoProblem(
      [
        'VAR SETTINGS[] = [\\',
        "1,\\ ' メモリ解放",
        "0,\\ ' 画面非表示",
        "0 \\ ' Joy-Con",
        ']',
      ].join('\n'),
    );
  });

  it('行継続が無ければ括弧の閉じ忘れとして報告する', () => {
    // 開いたままの [ と、行が変わって行き場を失った ] の両方を報告する。
    // どちらもバックスラッシュの書き忘れという同じ原因を指している。
    assert.deepEqual(messages('VAR SETTINGS[] = [\n1,\n0\n]'), [
      '[ が閉じられていません。',
      '] に対応する開き括弧がありません。',
    ]);
  });
});

describe('ラベル', () => {
  it('定義したラベルへの GOTO は通る', () => {
    assertNoProblem('@LOOP\nGOTO @LOOP');
  });

  it('前方参照も通る', () => {
    assertNoProblem('GOTO @FINISH\n@FINISH\nEND');
  });

  it('ON 式 GOTO の飛び先の並びを検査する', () => {
    assertNoProblem('ON I GOTO @A,@B\n@A\n@B');
    assert.deepEqual(messages('ON I GOTO @A,@B\n@A'), ['ラベル @B が定義されていません。']);
  });

  it('THEN 直後の暗黙の GOTO を検査する', () => {
    assert.deepEqual(messages('IF A THEN @NOWHERE'), ['ラベル @NOWHERE が定義されていません。']);
  });

  it('重複したラベルを報告する', () => {
    assert.deepEqual(messages('@A\n@A'), ['ラベル @A が重複しています。']);
  });

  it('ラベルの大文字小文字は区別しない', () => {
    assertNoProblem('@loop\nGOTO @LOOP');
  });

  it('式の中のラベルは文字列値なので未定義でも報告しない', () => {
    // 言語仕様: ラベルが文字列式中に現れると、そのラベル名の文字列値になる
    assertNoProblem('A$=@SOMETHING');
    assertNoProblem('IF A THEN PRINT @SOMETHING');
  });

  it('GOTO に文字列を渡す形は実行時に解決されるので報告しない', () => {
    assertNoProblem('GOTO "@RUNTIME"');
  });
});

describe('現実に近いプログラム', () => {
  it('一通りの構文を含むプログラムに誤検出しない', () => {
    assertNoProblem(
      [
        "' スプライトを動かす例",
        'ACLS',
        'VAR X=200,Y=120',
        'SPSET 0,500',
        '',
        '@MAIN',
        'LOOP',
        ' VAR B=BUTTON(0)',
        ' IF B AND #B_LLEFT THEN X=X-2',
        ' IF B AND #B_RRIGHT THEN X=X+2',
        ' IF B AND #B_RUP THEN',
        '  Y=Y-2',
        ' ELSEIF B AND #B_RDOWN THEN',
        '  Y=Y+2',
        ' ENDIF',
        ' SPOFS 0,X,Y',
        ' CASE FLOOR(MAINCNT()/60) MOD 3',
        '  WHEN 0: SPCOLOR 0,#C_RED',
        '  WHEN 1: SPCOLOR 0,#C_LIME',
        '  OTHERWISE: SPCOLOR 0,#C_WHITE',
        ' ENDCASE',
        ' IF B AND #B_RRIGHT THEN GOSUB @BEEP',
        ' VSYNC 1',
        'ENDLOOP',
        '',
        '@BEEP',
        'BEEP 1',
        'RETURN',
        '',
        'DEF DISTANCE(X1,Y1,X2,Y2)',
        ' VAR DX=X2-X1, DY=Y2-Y1',
        ' RETURN SQR(DX*DX+DY*DY)',
        'END',
      ].join('\n'),
    );
  });
});
