import * as vscode from 'vscode';
import { getCredentials } from './auth';
import { exec } from 'child_process';
import { detectFileType, debugLogFileUri } from './fileUtils';

interface CliResultOptions {
    commandName: string;
    successMessage: string;
    failureMessage: string;
    showSuccessNotification?: boolean;
    refreshExplorerOnSuccess?: boolean;
}

async function getSnowplowCliPath(): Promise<string> {
    const config = vscode.workspace.getConfiguration('snowplow');
    const cliPath = config.get<string>('snowplowCliPath');
    
    if (cliPath) {
        return cliPath;
    }

    // Default to 'snowplow-cli' if not configured
    return 'snowplow-cli';
}

function handleCliResult(
    error: any,
    stdout: string,
    stderr: string,
    outputChannel: vscode.OutputChannel,
    options: CliResultOptions
) {
    outputChannel.appendLine('--- Output ---');
    if (stdout) {
        outputChannel.appendLine(stdout);
    }
    
    if (stderr) {
        outputChannel.appendLine('--- Errors ---');
        outputChannel.appendLine(stderr);
    }
    
    // Check for failure conditions
    if (error || stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
        vscode.window.showErrorMessage(`❌ ${options.failureMessage}`, 'Show Details').then(selection => {
            if (selection === 'Show Details') {
                outputChannel.show();
            }
        });
        return;
    }
    
    // Success case
    if (options.showSuccessNotification !== false) {
        vscode.window.showInformationMessage(`✅ ${options.successMessage}`);
    }
    
    // Refresh explorer to update status indicators
    if (options.refreshExplorerOnSuccess !== false) {
        vscode.commands.executeCommand('snowplow.refresh');
    }
}

export async function validateFile(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('validateFile', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for validation.');
        return;
    }

    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const filePath = fileUri.fsPath;
    
    // Detect file type to use the correct command
    const fileType = detectFileType(filePath);
    let command: string;
    
    if (fileType === 'data-product') {
        command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
    } else if (fileType === 'data-structure') {
        command = `${snowplowCliPath} data-structures validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
    } else if (fileType === 'source-application') {
        // Source applications are validated as part of data products
        command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
    } else {
        // If we can't detect the type, ask the user
        const choice = await vscode.window.showQuickPick(
            ['Data Structure', 'Data Product', 'Source Application'],
            { placeHolder: 'Could not auto-detect file type. Please select:' }
        );
        
        if (!choice) return;
        
        if (choice === 'Data Product') {
            command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else if (choice === 'Source Application') {
            command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else {
            command = `${snowplowCliPath} data-structures validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        }
    }

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Validation',
            successMessage: 'Validation successful!',
            failureMessage: 'Validation failed'
        });
    });
}

export async function publishFile(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('publishFile', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for publishing.');
        return;
    }

    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const filePath = fileUri.fsPath;
    
    // Detect file type to use the correct command
    const fileType = detectFileType(filePath);
    let command: string;
    
    if (fileType === 'data-product') {
        command = `${snowplowCliPath} data-products publish ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
    } else if (fileType === 'data-structure') {
        command = `${snowplowCliPath} data-structures publish dev ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
    } else if (fileType === 'source-application') {
        // Source applications are published as part of data products, so we treat them as data products
        command = `${snowplowCliPath} data-products publish ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
    } else {
        // If we can't detect the type, ask the user
        const choice = await vscode.window.showQuickPick(
            ['Data Structure', 'Data Product', 'Source Application'],
            { placeHolder: 'Could not auto-detect file type. Please select:' }
        );
        
        if (!choice) return;
        
        if (choice === 'Data Product') {
            command = `${snowplowCliPath} data-products publish ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else if (choice === 'Source Application') {
            command = `${snowplowCliPath} data-products publish ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else {
            command = `${snowplowCliPath} data-structures publish dev ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        }
    }

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Publish',
            successMessage: 'Publish successful!',
            failureMessage: 'Publish failed'
        });
    });
}

export async function generateDataStructure(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const name = await vscode.window.showInputBox({ prompt: 'Enter a name for the data structure' });
    if (!name) { return; }

    const vendor = await vscode.window.showInputBox({ prompt: 'Enter a vendor for the data structure' });
    if (!vendor) { return; }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-structures generate ${name} --vendor ${vendor}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Data Structure Generation',
            successMessage: 'Data structure generated successfully!',
            failureMessage: 'Data structure generation failed'
        });
    });
}

export async function generateDataProduct(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const name = await vscode.window.showInputBox({ prompt: 'Enter a name for the data product' });
    if (!name) { return; }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-products generate --data-product ${name}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Data Product Generation',
            successMessage: 'Data product generated successfully!',
            failureMessage: 'Data product generation failed'
        });
    });
}

export async function addEventSpec(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('addEventSpec', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for adding event spec.');
        return;
    }

    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const eventSpec = await vscode.window.showInputBox({ prompt: 'Enter the name of the event spec to add' });
    if (!eventSpec) { return; }

    const snowplowCliPath = await getSnowplowCliPath();
    const filePath = fileUri.fsPath;

    const command = `${snowplowCliPath} data-products add-event-spec ${filePath} --event-spec ${eventSpec}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Add Event Spec',
            successMessage: 'Event spec added successfully!',
            failureMessage: 'Failed to add event spec'
        });
    });
}

// Data Products batch operations
export async function downloadAllDataProducts(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-products download --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Download All Data Products',
            successMessage: 'Data products downloaded successfully!',
            failureMessage: 'Failed to download data products'
        });
    });
}

export async function publishAllDataProducts(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-products publish --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Publish All Data Products',
            successMessage: 'Data products published successfully!',
            failureMessage: 'Failed to publish data products'
        });
    });
}

export async function validateAllDataProducts(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-products validate --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Validate All Data Products',
            successMessage: 'Data products validated successfully!',
            failureMessage: 'Failed to validate data products'
        });
    });
}

// Data Structures batch operations
export async function downloadAllDataStructures(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-structures download --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Download All Data Structures',
            successMessage: 'Data structures downloaded successfully!',
            failureMessage: 'Failed to download data structures'
        });
    });
}

export async function publishAllDataStructuresToDev(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-structures publish dev --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Publish All Data Structures to Dev',
            successMessage: 'Data structures published to dev successfully!',
            failureMessage: 'Failed to publish data structures to dev'
        });
    });
}

export async function publishAllDataStructuresToProd(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-structures publish prod --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Publish All Data Structures to Prod',
            successMessage: 'Data structures published to prod successfully!',
            failureMessage: 'Failed to publish data structures to prod'
        });
    });
}

export async function validateAllDataStructures(context: vscode.ExtensionContext) {
    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) { return; }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    const command = `${snowplowCliPath} data-structures validate --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, { cwd: workspaceRoot }, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Validate All Data Structures',
            successMessage: 'Data structures validated successfully!',
            failureMessage: 'Failed to validate data structures'
        });
    });
}

// Specific validation functions
export async function validateDataProduct(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('validateDataProduct', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for data product validation.');
        return;
    }

    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const filePath = fileUri.fsPath;
    
    const command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Data Product Validation',
            successMessage: 'Data product validation successful!',
            failureMessage: 'Data product validation failed'
        });
    });
}

export async function validateDataStructure(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('validateDataStructure', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for data structure validation.');
        return;
    }

    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const filePath = fileUri.fsPath;
    
    const command = `${snowplowCliPath} data-structures validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Data Structure Validation',
            successMessage: 'Data structure validation successful!',
            failureMessage: 'Data structure validation failed'
        });
    });
}

// Current file operations
export async function validateCurrentFile(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active file to validate. Please open a file first.');
        return;
    }
    
    validateFile(context, activeEditor.document.uri);
}

export async function publishCurrentFile(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active file to publish. Please open a file first.');
        return;
    }
    
    publishFile(context, activeEditor.document.uri);
}
