' 拡張機能の動作確認用サンプル。
' 色付けと構文チェックの結果を目で確かめるために置いてある。
' このファイル自体に構文エラーは無い（波線が出ないのが正しい状態）。

ACLS
XSCREEN 1
VAR X=200, Y=120
VAR SPEED#=2.0
VAR NAME$="PETITCOM"
VAR MASK=&HFF00 OR &B1010

' バックスラッシュの後にコメントを書いて行を継続できる
VAR NUM_FIRST%=1, \ ' 最初の文字かの判定(0判定用)
    NUM_SECOND%=2

' 括弧を複数行にまたがせる場合も各行を継続する
VAR SETTINGS[] = [\
 1,\ ' メモリ解放
 0,\ ' 画面非表示
 0 \ ' Joy-Con
]

SPSET 0,500
SPCOLOR 0,#C_WHITE

@MAIN
LOOP
 VAR B=BUTTON(0)

 ' 1 行形式の IF は ENDIF を必要としない
 IF B AND #B_LLEFT THEN X=X-SPEED#
 IF B AND #B_RRIGHT THEN X=X+SPEED#

 ' THEN の直後で改行するブロック形式は ENDIF で閉じる
 IF B AND #B_RUP THEN
  Y=Y-SPEED#
 ELSEIF B AND #B_RDOWN THEN
  Y=Y+SPEED#
 ELSE
  Y=Y
 ENDIF

 CASE FLOOR(MAINCNT()/60) MOD 3
  WHEN 0: SPCOLOR 0,#C_RED
  WHEN 1: SPCOLOR 0,#C_LIME
  OTHERWISE: SPCOLOR 0,#C_WHITE
 ENDCASE

 SPOFS 0,X,Y

 ' 長い行は行末のバックスラッシュで折り返せる
 TPRINT 4,"POS=";STR$(X);",";STR$(Y);" DIST=";\
  STR$(DISTANCE(X,Y,200,120))

 IF B AND #B_RRIGHT THEN GOSUB @SOUND

 ' 1 行に収めた繰り返し
 FOR I=0 TO 3:GPSET X+I,Y,#C_AQUA:NEXT

 ' THEN を使わず GOTO で分岐する形。ENDIF は不要
 IF X<0 GOTO @OUT_OF_SCREEN
 IF X>399 GOTO @OUT_OF_SCREEN ELSE @IN_SCREEN
 @IN_SCREEN

 IF B AND #B_L THEN BREAK
 VSYNC 1
ENDLOOP

' 閉じの " は省略でき、行末までが文字列になる
?"FINISHED ";NAME$
?"THE END

' ?? は INSPECT の略記（?? は ? 2 つではない）
?? SETTINGS
?? NAME$
END

@OUT_OF_SCREEN
X=MAX(0,MIN(399,X))
GOTO @MAIN

@SOUND
BEEP 1
RETURN

' ユーザー定義関数
DEF DISTANCE(X1,Y1,X2,Y2)
 VAR DX=X2-X1, DY=Y2-Y1
 RETURN SQR(DX*DX+DY*DY)
END

' 多値を返すユーザー定義命令
DEF MINMAX A,B OUT LO,HI
 IF A<B THEN
  LO=A: HI=B
 ELSE
  LO=B: HI=A
 ENDIF
END
