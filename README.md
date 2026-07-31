# プチコン4 SmileBASIC 4 — VSCode 拡張機能

Nintendo Switch 用プログラミングソフト「プチコン4 SmileBASIC」の言語 **SmileBASIC 4** に、
VSCode 上での構文ハイライトと構文チェックを提供します。

## できること

### 構文ハイライト

| 対象 | 例 |
| --- | --- |
| 予約語（44 語） | `IF` `THEN` `ENDIF` `FOR` `NEXT` `CASE` `WHEN` `DEF` |
| 組み込み命令・関数（302 語） | `SPSET` `GFILL` `BGMPLAY` `ABS()` `CHR$()` `ARRAY%()` |
| 単語の演算子 | `AND` `OR` `XOR` `NOT` `DIV` `MOD` |
| コメント | `'コメント` `REM コメント` |
| 文字列・数値 | `"文字列"` `&HFF00` `&B1010` `1.5` `1E-3` |
| 閉じを省略した文字列 | `?"THE END`（行末までが文字列） |
| ラベル | `@MAIN`（定義）と `GOTO @MAIN`（参照）を色分け |
| 組み込み定数 | `#TRUE` `#C_RED` `#B_RRIGHT` |
| 型サフィックス | `A$` `B%` `C#` のサフィックスを個別に色分け |
| 略記 | `?`（PRINT）`T?`（TPRINT）`??`（INSPECT） |

大文字小文字は区別しません（`if` も `IF` も同じように色が付きます）。

#### 配色について

この拡張機能は色そのものを指定せず、`keyword.control` や `support.function` といった
**TextMate の標準的なスコープ名**を割り当てているだけです。
実際の色はお使いの VSCode テーマが決めるため、他の言語と同じ感覚で読めます。
一般的なテーマを使っていれば、そのまま今どきの配色になります。

### 構文チェック

誤りを波線で知らせます。

- **ブロックの対応** — `IF`↔`ENDIF`、`FOR`↔`NEXT`、`WHILE`↔`WEND`、`REPEAT`↔`UNTIL`、
  `LOOP`↔`ENDLOOP`、`CASE`↔`ENDCASE`、`DEF`↔`END`
  - `IF` の 3 つの形をすべて見分けます。`ENDIF` が必要なのは
    `THEN` で行が終わっているブロック形式だけで、`IF 式 THEN 処理` と
    `IF 式 GOTO @ラベル` の 1 行形式は要求しません
  - `DEF` の外の `END` はプログラム終了文なのでエラーになりません
- **節の位置** — `ELSE` / `ELSEIF` / `WHEN` / `OTHERWISE` が正しいブロックの中にあるか、
  `ELSE` が重複していないか
- **条件式の終わりの書き忘れ** — `IF` / `ELSEIF` に `THEN` も `GOTO` も無い、`FOR` に `TO` が無い
- **`BREAK` / `CONTINUE` の位置** — 繰り返しの中にあるか（`ON BREAK GOTO` は除外）
- **括弧の対応** — `(` `)` `[` `]` の対応と種類の一致
- **`DEF`** — 入れ子の `DEF`、定義名の重複、定義名の書き忘れ
- **ラベル** — 定義の重複と、飛び先が未定義でないか。
  ラベルの有効範囲は `DEF` の内と外で分かれるため、`DEF` をまたぐ
  `GOTO` / `GOSUB` も報告します（同名ラベルが別々の `DEF` にあるのは正当）
- **文字列で書いた飛び先** — `GOTO "TEST"` のように `@` で始まらない形、
  `ON`〜`GOTO` での文字列指定、`THEN` / `ELSE` 直後の `GOTO` 省略での文字列指定
- **字句の誤り** — 桁のない `&H` / `&B`、桁の欠けた指数表記、使用できない文字

情報レベル（青い波線）で知らせるもの:

- **`\` の後ろに書かれたコメント以外の文字** — `\` から行末までは実機でも読み飛ばされるので
  誤りではありませんが、書き間違いの可能性が高いため知らせます

意図的に検出していないもの（誤検出のほうが害が大きいため）:
未定義の変数・命令、変数名の重複（`OPTION STRICT` と配列かどうかで挙動が変わる）、
実行時にしか判明しない誤り（ゼロ除算、範囲外、スタックあふれ）。

チェックは設定 `smilebasic4.diagnostics.enable` で切れます。

## 使い方

`.prg` を開くと自動で有効になります。
別の拡張子を使っている場合は VSCode の設定に関連付けを足してください。

```jsonc
// settings.json
"files.associations": {
  "*.txt": "smilebasic4"
}
```

## 開発

```sh
npm install
npm run build   # TypeScript のコンパイル → TextMate 文法の生成
npm test        # 146 件のテスト
```

VSCode でこのフォルダを開いて **F5** を押すと、拡張機能を読み込んだ別ウィンドウが起動します。
`examples/sample.prg` を開けば、色付けと構文チェックの結果を目で確認できます。

## 構成

```
src/
  language/          言語の知識をまとめた「単一の情報源」
    keywords.ts        予約語 44 語（制御構文・演算子・その他に分類）
    builtins.ts        組み込み命令・関数 302 語
    blocks.ts          ブロック構造の対応表（IF↔ENDIF など）
    shorthands.ts      記号の略記の表（? / T? / ??）
  grammar/
    grammar.ts         TextMate 文法の組み立て（language/ の表を参照）
  parser/
    lexer.ts           字句解析
    diagnostic.ts      指摘 1 件を表す型
    diagnostics.ts     構文チェック（vscode に依存しない）
  tools/
    build-grammar.ts   syntaxes/*.tmLanguage.json の書き出し
  extension.ts       VSCode との接続（診断の登録と更新のみ）
syntaxes/
  smilebasic4.tmLanguage.json   ★自動生成。直接編集しないこと
```

### どこを直せばよいか

| やりたいこと | 直す場所 |
| --- | --- |
| コマンドを追加・修正する | `src/language/builtins.ts` の配列だけ |
| 予約語の分類を変える | `src/language/keywords.ts` |
| 新しいブロック構文に対応する | `src/language/blocks.ts` に 1 行足す |
| 記号の略記を追加する | `src/language/shorthands.ts` に 1 行足す |
| 色付けの規則を変える | `src/grammar/grammar.ts` |
| チェック項目を増やす | `src/parser/diagnostics.ts` |

キーワードの一覧は `src/language/` に 1 か所だけ置き、そこから TextMate 文法を生成しています。
組み込み命令が 302 語あるため、生成後の正規表現は 1 行 2000 文字を超えます。
これを手で書くと差分を読めなくなるうえ、構文チェック側との二重管理になるため、
**`syntaxes/smilebasic4.tmLanguage.json` は編集せず、必ず `npm run build` で作り直してください。**
（生成物はコミットします。clone しただけで動き、`vsce package` がそのまま通るようにするためです。）

### テスト

| ファイル | 見ているもの |
| --- | --- |
| `src/test/lexer.test.ts` | 字句解析（コメント・リテラル・略記・行継続） |
| `src/test/diagnostics.test.ts` | 構文チェックの検出と誤検出 |
| `src/test/grammar.test.ts` | 文法定義の不変条件（分類の重複、生成漏れ） |
| `src/test/highlight.test.ts` | 生成した文法を実際の Oniguruma に通した色付け結果 |

## 言語仕様の出典

実装は公式リファレンスに基づいています。

- [言語仕様](https://sup4.smilebasic.com/doku.php?id=reference:%E8%A8%80%E8%AA%9E%E4%BB%95%E6%A7%98)
- [演算子](https://sup4.smilebasic.com/doku.php?id=reference:%E6%BC%94%E7%AE%97%E5%AD%90)
- [制御命令](https://sup4.smilebasic.com/doku.php?id=reference:%E5%88%B6%E5%BE%A1%E5%91%BD%E4%BB%A4)
- [リファレンス目次](https://sup4.smilebasic.com/doku.php?id=reference:top)

## おことわり

このプログラムは人間の指示に基づき、主に AI によって作成されています。使用モデルはコミットメッセージを参照してください。 

## ライセンス

MIT
