/**
 * 文法生成の不変条件を確かめるテスト。
 *
 * キーワードの表を編集したときに壊れやすいところ（分類の重複、生成した
 * 正規表現の取りこぼし）を機械的に検出するのがねらい。
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGrammar } from '../grammar/grammar';
import { BUILTINS } from '../language/builtins';
import { ALL_KEYWORDS, CONTROL_KEYWORDS, STATEMENT_KEYWORDS, WORD_OPERATORS } from '../language/keywords';

function duplicates(words: readonly string[]): string[] {
  const seen = new Set<string>();
  const found: string[] = [];
  for (const word of words) {
    if (seen.has(word)) {
      found.push(word);
    }
    seen.add(word);
  }
  return found;
}

describe('キーワードの表', () => {
  it('同じ語が複数の分類に入っていない', () => {
    assert.deepEqual(duplicates([...CONTROL_KEYWORDS, ...WORD_OPERATORS, ...STATEMENT_KEYWORDS]), []);
  });

  it('組み込み命令とキーワードが重なっていない', () => {
    const keywords = new Set<string>(ALL_KEYWORDS);
    assert.deepEqual(
      BUILTINS.filter((builtin) => keywords.has(builtin)),
      [],
    );
  });

  it('組み込み命令に重複がない', () => {
    assert.deepEqual(duplicates([...BUILTINS]), []);
  });
});

describe('生成した文法', () => {
  const grammar = buildGrammar();

  it('先頭のルールがすべて repository に存在する', () => {
    for (const pattern of grammar.patterns) {
      const key = pattern.include!.replace(/^#/, '');
      assert.ok(key in grammar.repository, `repository に ${key} がありません`);
    }
  });

  /**
   * Oniguruma の (?i:...) は JavaScript の正規表現では書けないため、
   * ここでは i フラグに置き換えて同等の判定を行う。
   */
  function toJsRegExp(pattern: string): RegExp {
    return new RegExp(`^(?:${pattern.replace('(?i:', '(?:')})$`, 'i');
  }

  it('すべての組み込み命令が builtin ルールに一致する', () => {
    const builtinPattern = toJsRegExp(grammar.repository.builtin.match!);
    const unmatched = BUILTINS.filter((builtin) => !builtinPattern.test(builtin));
    assert.deepEqual(unmatched, []);
  });

  it('$ や % で終わる語も一致する（終端に \\b を使っていないことの確認）', () => {
    const builtinPattern = toJsRegExp(grammar.repository.builtin.match!);
    for (const word of ['BIN$', 'CHR$', 'ARRAY%', 'TIME$']) {
      assert.ok(builtinPattern.test(word), `${word} に一致しません`);
    }
  });

  it('長い語が短い語より先に並んでいる', () => {
    // SPCOL が SPCOLOR より先に試されると、途中までしか色が付かない
    const alternatives = grammar.repository.builtin.match!.match(/\(\?i:([^)]*)\)/)![1].split('|');
    // 正規表現用のエスケープ（BIN\$ など）は語の長さに数えない
    const lengths = alternatives.map((word) => word.replace(/\\/g, '').length);
    assert.deepEqual(
      lengths,
      [...lengths].sort((a, b) => b - a),
      '選択肢が長さの降順になっていません',
    );
  });

  it('すべてのキーワードが対応するルールに一致する', () => {
    const rules: Array<[readonly string[], string]> = [
      [CONTROL_KEYWORDS, grammar.repository['control-keyword'].match!],
      [WORD_OPERATORS, grammar.repository['word-operator'].match!],
      [STATEMENT_KEYWORDS, grammar.repository['statement-keyword'].match!],
    ];
    for (const [words, pattern] of rules) {
      const regexp = toJsRegExp(pattern);
      const unmatched = words.filter((word) => !regexp.test(word));
      assert.deepEqual(unmatched, []);
    }
  });
});
