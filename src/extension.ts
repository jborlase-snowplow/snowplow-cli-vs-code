import * as vscode from 'vscode';
import { setupCredentials, clearCredentials } from './auth';
import { validateFile, publishFile, generateDataStructure, generateDataProduct, addEventSpec, downloadAllDataProducts, publishAllDataProducts, validateAllDataProducts, downloadAllDataStructures, publishAllDataStructuresToDev, publishAllDataStructuresToProd, validateAllDataStructures, validateCurrentFile, publishCurrentFile, debugFileContext, validateDataProduct, validateDataStructure, openContainingFolder, copyFilePath, publishDataStructureToProd, validateWithProgress, createSnowplowWorkspace, createVendorDirectory, generateSourceApp, editDataStructure, editDataProduct } from './snowplow';
import { SnowplowAssetProvider, SnowplowStatusManager, setupAutoRefresh } from './snowplowExplorer';
import { SnowplowLanguageFeatures } from './languageFeatures';
import { SchemaVisualizationManager } from './schemaVisualization';
import { SnowplowSchemaAnalyzer } from './schemaAnalyzer';
import * as linter from './lint';

export function activate(context: vscode.ExtensionContext) {

    console.log('Congratulations, your extension "snowplow-vscode-extension" is now active!');

    const snowplowAssetProvider = new SnowplowAssetProvider(vscode.workspace.rootPath);
    vscode.window.registerTreeDataProvider('snowplowAssets', snowplowAssetProvider);

    // Initialize status manager
    const statusManager = SnowplowStatusManager.getInstance();
    context.subscriptions.push(statusManager);

    // Initialize language features for Snowplow data structures
    const languageFeatures = new SnowplowLanguageFeatures();
    languageFeatures.activate(context);

    // Initialize schema visualization
    const schemaVisualization = new SchemaVisualizationManager();
    schemaVisualization.activate(context);

    // Initialize schema analyzer
    const schemaAnalyzer = new SnowplowSchemaAnalyzer();
    schemaAnalyzer.activate(context);

    // Setup auto-refresh
    const watchers = setupAutoRefresh(snowplowAssetProvider);
    watchers.forEach(watcher => context.subscriptions.push(watcher));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.refresh', () => {
        snowplowAssetProvider.refresh();
        statusManager.updateStatus('ready');
        vscode.window.showInformationMessage('🔄 Snowplow Explorer refreshed');
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.setup', () => {
        setupCredentials(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.clearCredentials', () => {
        clearCredentials(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateFile', (fileUri: vscode.Uri) => {
        console.log('validateFile command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            validateFile(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            validateFile(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No file selected for validation. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishFile', (fileUri: vscode.Uri) => {
        console.log('publishFile command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            publishFile(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            publishFile(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No file selected for publishing. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.generateDataStructure', () => {
        generateDataStructure(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.generateDataProduct', () => {
        generateDataProduct(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.addEventSpec', (fileUri: vscode.Uri) => {
        console.log('addEventSpec command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            addEventSpec(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            addEventSpec(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No file selected to add an event spec to. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.downloadAllDataProducts', () => {
        downloadAllDataProducts(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishAllDataProducts', () => {
        publishAllDataProducts(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateAllDataProducts', () => {
        validateAllDataProducts(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.downloadAllDataStructures', () => {
        downloadAllDataStructures(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishAllDataStructuresToDev', () => {
        publishAllDataStructuresToDev(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishAllDataStructuresToProd', () => {
        publishAllDataStructuresToProd(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateAllDataStructures', () => {
        validateAllDataStructures(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateCurrentFile', () => {
        validateCurrentFile(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishCurrentFile', () => {
        publishCurrentFile(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.openContainingFolder', (fileUri: vscode.Uri) => {
        if (fileUri && fileUri.fsPath) {
            openContainingFolder(context, fileUri);
        } else {
            vscode.window.showErrorMessage('No file selected to open containing folder.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.copyFilePath', (fileUri: vscode.Uri) => {
        if (fileUri && fileUri.fsPath) {
            copyFilePath(context, fileUri);
        } else {
            vscode.window.showErrorMessage('No file selected to copy path.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.debugFileContext', () => {
        debugFileContext(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateDataProduct', (fileUri: vscode.Uri) => {
        console.log('validateDataProduct command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            validateDataProduct(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            validateDataProduct(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No data product file selected for validation. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateDataStructure', (fileUri: vscode.Uri) => {
        console.log('validateDataStructure command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            validateDataStructure(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            validateDataStructure(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No data structure file selected for validation. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishDataStructureToProd', (fileUri: vscode.Uri) => {
        console.log('publishDataStructureToProd command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            publishDataStructureToProd(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            publishDataStructureToProd(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No data structure file selected to publish to production. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateWithProgress', (fileUri: vscode.Uri) => {
        console.log('validateWithProgress command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            validateWithProgress(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            validateWithProgress(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No file selected for validation. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.createSnowplowWorkspace', () => {
        createSnowplowWorkspace();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.createVendorDirectory', () => {
        createVendorDirectory();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.generateSourceApp', () => {
        generateSourceApp();
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateSourceApp', (fileUri: vscode.Uri) => {
        console.log('validateSourceApp command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            // Source apps are validated as part of data products
            validateFile(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            validateFile(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No source application file selected for validation. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishSourceApp', (fileUri: vscode.Uri) => {
        console.log('publishSourceApp command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            // Source apps are published as part of data products
            publishFile(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            publishFile(context, vscode.window.activeTextEditor.document.uri);
        } else {
            vscode.window.showErrorMessage('No source application file selected for publishing. Please open a file or right-click on a file in the explorer.');
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.downloadAllSourceApps', () => {
        // Source apps are downloaded as part of data products
        downloadAllDataProducts(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.publishAllSourceApps', () => {
        // Source apps are published as part of data products
        publishAllDataProducts(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.validateAllSourceApps', () => {
        // Source apps are validated as part of data products
        validateAllDataProducts(context);
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.editDataStructure', (fileUri: vscode.Uri) => {
        console.log('editDataStructure command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            editDataStructure(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            editDataStructure(context, vscode.window.activeTextEditor.document.uri);
        } else {
            // Create new data structure
            editDataStructure(context);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.editDataProduct', (fileUri: vscode.Uri) => {
        console.log('editDataProduct command called with fileUri:', fileUri);
        if (fileUri && fileUri.fsPath) {
            editDataProduct(context, fileUri);
        } else if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.uri.fsPath) {
            console.log('Using active editor:', vscode.window.activeTextEditor.document.uri.fsPath);
            editDataProduct(context, vscode.window.activeTextEditor.document.uri);
        } else {
            // Create new data product
            editDataProduct(context);
        }
    }));

    context.subscriptions.push(vscode.commands.registerCommand('snowplow.detectLanguage', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            await languageFeatures.detectSnowplowLanguage(activeEditor.document);
            vscode.window.showInformationMessage('✅ Language detection completed');
        } else {
            vscode.window.showErrorMessage('No active editor found');
        }
    }));

    // Register command for fixing vendor format (used by code actions)
    context.subscriptions.push(vscode.commands.registerCommand('snowplow.fixVendorFormat', (uri: vscode.Uri, range: vscode.Range) => {
        vscode.window.showInformationMessage('Vendor format fix command triggered - this would provide suggestions for correct vendor format.');
    }));

    // Register test command to verify LSP functionality 
    context.subscriptions.push(vscode.commands.registerCommand('snowplow.testLanguageFeatures', async () => {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            vscode.window.showErrorMessage('No active editor found');
            return;
        }
        
        const document = activeEditor.document;
        const position = activeEditor.selection.active;
        
        // Test completion
        const completions = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', 
            document.uri, position);
        
        // Test hover
        const hover = await vscode.commands.executeCommand('vscode.executeHoverProvider',
            document.uri, position);
        
        const message = `
Language: ${document.languageId}
File: ${document.uri.fsPath}
Position: ${position.line}:${position.character}
Completions: ${completions ? (completions as any).items?.length || 0 : 0}
Hover: ${hover ? (hover as any).length || 0 : 0}
IsSnowplow: ${languageFeatures.isSnowplowFile(document)}
        `.trim();
        
        vscode.window.showInformationMessage(message, { modal: true });
    }));

    linter.activate(context);

    // Store language features instance for cleanup
    context.subscriptions.push({ dispose: () => languageFeatures.dispose() });
    context.subscriptions.push({ dispose: () => schemaVisualization.dispose() });

}

export function deactivate() {}