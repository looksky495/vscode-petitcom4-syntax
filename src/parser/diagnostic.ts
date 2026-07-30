/**
 * 解析結果として報告する 1 件の指摘。
 *
 * 字句解析器（lexer.ts）と構文チェック（diagnostics.ts）の両方が
 * この形で結果を返す。VSCode 向けの変換は extension.ts が行うため、
 * ここでは vscode モジュールに依存しない。
 */

export type DiagnosticSeverity =
  /** 実機でも動かない誤り */
  | 'error'
  /** 動くが意図と違う可能性が高いもの */
  | 'warning'
  /** 動作に影響しないが知らせておきたいこと */
  | 'information';

export interface Diagnostic {
  readonly message: string;
  /** 0 起点の行番号 */
  readonly line: number;
  /** 0 起点の桁番号 */
  readonly column: number;
  readonly length: number;
  readonly severity: DiagnosticSeverity;
}
