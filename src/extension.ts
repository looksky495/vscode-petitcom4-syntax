/**
 * 拡張機能の入口。
 *
 * 構文の解析そのものは parser/ が行い、vscode モジュールに依存しない。
 * このファイルの役目は、その結果を VSCode の診断（波線表示）に変換して
 * ドキュメントの開閉・編集に合わせて更新することだけ。
 */

import * as vscode from 'vscode';

import { analyze, type Diagnostic } from './parser/diagnostics';

const LANGUAGE_ID = 'smilebasic4';
const ENABLE_SETTING = 'smilebasic4.diagnostics.enable';

export function activate(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection(LANGUAGE_ID);

  const refresh = (document: vscode.TextDocument): void => {
    if (document.languageId !== LANGUAGE_ID) {
      return;
    }
    if (!isDiagnosticsEnabled(document)) {
      collection.delete(document.uri);
      return;
    }
    collection.set(document.uri, analyze(document.getText()).map(toVscodeDiagnostic));
  };

  const refreshAll = (): void => {
    vscode.workspace.textDocuments.forEach(refresh);
  };

  context.subscriptions.push(
    collection,
    vscode.workspace.onDidOpenTextDocument(refresh),
    vscode.workspace.onDidChangeTextDocument((event) => refresh(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(ENABLE_SETTING)) {
        refreshAll();
      }
    }),
  );

  // 拡張機能が有効になった時点で開かれているファイルにも波線を付ける
  refreshAll();
}

export function deactivate(): void {
  // createDiagnosticCollection は context.subscriptions に登録済みなので、
  // ここで後片付けすることは無い。
}

function isDiagnosticsEnabled(document: vscode.TextDocument): boolean {
  return vscode.workspace.getConfiguration(undefined, document).get<boolean>(ENABLE_SETTING, true);
}

const SEVERITIES: Record<Diagnostic['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

function toVscodeDiagnostic(diagnostic: Diagnostic): vscode.Diagnostic {
  const start = new vscode.Position(diagnostic.line, diagnostic.column);
  const end = new vscode.Position(diagnostic.line, diagnostic.column + diagnostic.length);

  const result = new vscode.Diagnostic(
    new vscode.Range(start, end),
    diagnostic.message,
    SEVERITIES[diagnostic.severity],
  );
  result.source = 'SmileBASIC 4';
  return result;
}
