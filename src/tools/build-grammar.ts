/**
 * syntaxes/smilebasic4.tmLanguage.json を書き出す。
 *
 *   npm run build       … コンパイルしてから生成
 *   npm run build:grammar … 生成だけ（先に npm run compile が必要）
 *
 * 生成物はリポジトリにコミットする。clone しただけで拡張機能が動き、
 * vsce package もそのまま通るようにするため。
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { buildGrammar } from '../grammar/grammar';

const BANNER =
  'このファイルは自動生成です。編集しても次のビルドで上書きされます。' +
  'src/grammar/grammar.ts と src/language/ を直してから npm run build を実行してください。';

function main(): void {
  // out/tools/build-grammar.js から見て 2 つ上がリポジトリのルート
  const repositoryRoot = join(__dirname, '..', '..');
  const outputPath = join(repositoryRoot, 'syntaxes', 'smilebasic4.tmLanguage.json');

  // JSON にコメントは書けないため、先頭のキーで自動生成であることを伝える
  const grammar = { _readme: BANNER, ...buildGrammar() };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(grammar, null, 2)}\n`, 'utf8');

  console.log(`生成しました: ${outputPath}`);
}

main();
