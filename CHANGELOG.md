# 変更履歴

このファイルの書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に従い、
バージョン番号は [セマンティックバージョニング](https://semver.org/lang/ja/) に従います。

## [1.0.0] - 2026-07-31

最初の公開。

### 追加

**構文ハイライト**

- 予約語 44 語、組み込み命令・関数 302 語に対応（大文字小文字を区別しない）
- コメント（`'` と `REM`）、文字列、数値（`&H` / `&B` / 小数 / 指数表記）
- ラベルを定義（`@MAIN`）と参照（`GOTO @MAIN`）で色分け
- 組み込み定数（`#TRUE` など）、型サフィックス（`A$` の `$` など）
- 記号の略記（`?` = PRINT、`T?` = TPRINT、`??` = INSPECT）
- 行継続のバックスラッシュと、その後ろの読み飛ばされる部分

**構文チェック**

- ブロックの対応（`IF`↔`ENDIF`、`FOR`↔`NEXT`、`WHILE`↔`WEND`、`REPEAT`↔`UNTIL`、
  `LOOP`↔`ENDLOOP`、`CASE`↔`ENDCASE`、`DEF`↔`END`）
- `IF` の 3 つの形（`THEN` の 1 行形式、`THEN` のブロック形式、`GOTO` 形）の判別
- `ELSE` / `ELSEIF` / `WHEN` / `OTHERWISE` の位置と重複
- `BREAK` / `CONTINUE` が繰り返しの中にあるか
- 括弧の対応と種類の一致
- `DEF` の入れ子、定義名の重複・書き忘れ
- ラベルの重複と未定義。ラベルの有効範囲は `DEF` の内と外で分かれるため、
  `DEF` をまたぐ `GOTO` / `GOSUB` も検出する
- 文字列で書いた飛び先の書式（`GOTO "TEST"` など）
- 字句の誤り（桁のない `&H` / `&B`、桁の欠けた指数表記、使用できない文字）
- バックスラッシュより後ろに書かれたコメント以外の文字を情報レベルで通知

**エディタ支援**

- コメントの切り替え、括弧の対応、ブロックに応じた自動インデント

### 設定

- `smilebasic4.diagnostics.enable` — 構文チェックの有効・無効

### 備考

- 対象ファイルは `.prg` です。別の拡張子を使っている場合は `files.associations` を設定してください。
- 実装は [公式リファレンス](https://sup4.smilebasic.com/doku.php?id=reference:top) に基づいています。
- 未定義の変数・命令、変数名の重複は、誤検出を避けるため意図的に検出していません。

[1.0.0]: https://github.com/looksky495/vscode-petitcom4-syntax/releases/tag/v1.0.0
