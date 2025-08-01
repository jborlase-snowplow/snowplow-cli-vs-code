import * as vscode from 'vscode';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('snowplow');
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidOpenTextDocument(document => {
        lintDocument(document, diagnosticCollection);
    });

    vscode.workspace.onDidSaveTextDocument(document => {
        lintDocument(document, diagnosticCollection);
    });

    vscode.workspace.textDocuments.forEach(document => {
        lintDocument(document, diagnosticCollection);
    });
}

async function lintDocument(document: vscode.TextDocument, diagnosticCollection: vscode.DiagnosticCollection) {
    if (document.languageId !== 'yaml' && document.languageId !== 'json') {
        return;
    }

    const snowplowCliPath = vscode.workspace.getConfiguration('snowplow').get('snowplowCliPath', 'snowplow-cli');
    const command = `${snowplowCliPath} mcp --dump-context`;

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Failed to get schema: ${error.message}`);
            return;
        }

        const schema = JSON.parse(stdout);
        const diagnostics: vscode.Diagnostic[] = [];

        // This is a simplified example of how you might use the schema to validate the document.
        // A more robust implementation would use a JSON schema validation library.
        const text = document.getText();
        if (text.includes('invalid-string')) {
            const range = new vscode.Range(
                document.positionAt(text.indexOf('invalid-string')),
                document.positionAt(text.indexOf('invalid-string') + 'invalid-string'.length)
            );
            const diagnostic = new vscode.Diagnostic(range, 'This is an invalid string', vscode.DiagnosticSeverity.Error);
            diagnostics.push(diagnostic);
        }

        diagnosticCollection.set(document.uri, diagnostics);
    });
}