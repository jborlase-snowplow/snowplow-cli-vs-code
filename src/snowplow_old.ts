import * as vscode from 'vscode';
import { getCredentials } from './auth';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

function debugLogFileUri(functionName: string, fileUri: vscode.Uri | undefined) {
    console.log(`[${functionName}] fileUri:`, fileUri);
    console.log(`[${functionName}] fileUri.fsPath:`, fileUri?.fsPath);
    console.log(`[${functionName}] active editor:`, vscode.window.activeTextEditor?.document.uri.fsPath);
    if (fileUri?.fsPath) {
        const detectedType = detectFileType(fileUri.fsPath);
        console.log(`[${functionName}] detected file type:`, detectedType);
    }
}

export function detectFileType(filePath: string): 'data-structure' | 'data-product' | 'source-application' | 'unknown' {
    // Check if the file is in a data-structures, data-products, or source-apps directory
    if (filePath.includes('/data-structures/') || filePath.includes('\\data-structures\\')) {
        return 'data-structure';
    }
    if (filePath.includes('/data-products/') || filePath.includes('\\data-products\\')) {
        // Check if it's specifically in a source-apps subdirectory
        if (filePath.includes('/source-apps/') || filePath.includes('\\source-apps\\')) {
            return 'source-application';
        }
        return 'data-product';
    }
    if (filePath.includes('/source-apps/') || filePath.includes('\\source-apps\\')) {
        return 'source-application';
    }
    
    // Check by filename patterns
    if (filePath.includes('data_product') || filePath.includes('data-product')) {
        return 'data-product';
    }
    if (filePath.includes('data_structure') || filePath.includes('data-structure')) {
        return 'data-structure';
    }
    if (filePath.includes('source_app') || filePath.includes('source-app')) {
        return 'source-application';
    }
    
    // Try to read the file content to detect the resourceType
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Look for resourceType in the content
            if (content.includes('"resourceType": "data-product"') || content.includes('resourceType: data-product')) {
                return 'data-product';
            }
            if (content.includes('"resourceType": "data-structure"') || content.includes('resourceType: data-structure')) {
                return 'data-structure';
            }
            if (content.includes('"resourceType": "source-application"') || content.includes('resourceType: source-application')) {
                return 'source-application';
            }
            
            // Additional heuristics based on content
            if (content.includes('eventSpecifications') || content.includes('sourceApplications')) {
                return 'data-product';
            }
            if (content.includes('appIds') || content.includes('applicationId')) {
                return 'source-application';
            }
            if (content.includes('"$schema"') && content.includes('jsonschema') && !content.includes('eventSpecifications')) {
                return 'data-structure';
            }
        }
    } catch (error) {
        console.log('Error reading file for type detection:', error);
    }
    
    // Fallback: file extension based detection
    if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        return 'data-product'; // Most YAML files are likely data products
    }
    if (filePath.endsWith('.json')) {
        return 'data-structure'; // Most JSON files are likely data structures
    }
    
    return 'unknown';
}

async function getSnowplowCliPath(): Promise<string> {
    return vscode.workspace.getConfiguration('snowplow').get('snowplowCliPath', 'snowplow-cli');
}

interface CliExecutionOptions {
    commandName: string;
    successMessage: string;
    failureMessage: string;
    showSuccessNotification?: boolean;
    refreshExplorerOnSuccess?: boolean;
}

function handleCliResult(
    error: any, 
    stdout: string, 
    stderr: string, 
    outputChannel: vscode.OutputChannel, 
    options: CliExecutionOptions
) {
    outputChannel.appendLine(`=== ${options.commandName} Results ===`);
    
    // Always show stdout first as it contains primary results
    if (stdout) {
        outputChannel.appendLine(`Output:`);
        outputChannel.appendLine(stdout);
    }
    
    // Show stderr which may contain warnings or additional info
    if (stderr) {
        outputChannel.appendLine(`Stderr:`);
        outputChannel.appendLine(stderr);
    }
    
    if (error) {
        outputChannel.appendLine(`=== Error Details ===`);
        outputChannel.appendLine(`Error Code: ${error.code || 'Unknown'}`);
        outputChannel.appendLine(`Error Message: ${error.message}`);
        
        // Check if this is a validation/operation failure vs a command execution error
        if (error.code === 1 && (stdout || stderr)) {
            // This is likely an operation failure (validation, publish, etc.), not a command error
            outputChannel.show();
            vscode.window.showWarningMessage(`❌ ${options.failureMessage} - check output for details`, 'Show Output').then(selection => {
                if (selection === 'Show Output') {
                    outputChannel.show();
                }
            });
        } else if (error.code === 127 || error.message.includes('command not found') || error.message.includes('ENOENT')) {
            // Command not found error
            outputChannel.show();
            vscode.window.showErrorMessage('❌ Snowplow CLI not found. Please check your installation and configuration.', 'Show Output', 'Setup').then(selection => {
                if (selection === 'Show Output') {
                    outputChannel.show();
                } else if (selection === 'Setup') {
                    vscode.commands.executeCommand('snowplow.setup');
                }
            });
        } else {
            // Other command execution errors
            outputChannel.show();
            vscode.window.showErrorMessage(`❌ Command execution failed: ${error.message}`, 'Show Output').then(selection => {
                if (selection === 'Show Output') {
                    outputChannel.show();
                }
            });
        }
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

    debugLogFileUri('validateFile', fileUri);

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

    debugLogFileUri('publishFile', fileUri);

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

    debugLogFileUri('addEventSpec', fileUri);

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

export async function debugFileContext(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    const debugInfo = {
        activeEditor: activeEditor ? {
            fileName: activeEditor.document.fileName,
            uri: activeEditor.document.uri.toString(),
            fsPath: activeEditor.document.uri.fsPath,
            detectedFileType: detectFileType(activeEditor.document.uri.fsPath)
        } : null,
        workspaceFolders: workspaceFolders ? workspaceFolders.map(folder => ({
            name: folder.name,
            uri: folder.uri.toString(),
            fsPath: folder.uri.fsPath
        })) : null
    };
    
    const outputChannel = vscode.window.createOutputChannel('Snowplow Debug');
    outputChannel.show();
    outputChannel.appendLine('=== Debug File Context ===');
    outputChannel.appendLine(JSON.stringify(debugInfo, null, 2));
    
    vscode.window.showInformationMessage('Debug info written to Snowplow Debug output channel.');
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

export async function openContainingFolder(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided.');
        return;
    }

    const folderPath = path.dirname(fileUri.fsPath);
    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(folderPath));
}

export async function copyFilePath(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided.');
        return;
    }

    await vscode.env.clipboard.writeText(fileUri.fsPath);
    vscode.window.showInformationMessage(`File path copied to clipboard: ${fileUri.fsPath}`);
}

export function getFileStatus(filePath: string): 'valid' | 'invalid' | 'unknown' {
    // This is a placeholder - in a real implementation, you might:
    // 1. Check if the file has been validated recently
    // 2. Parse the file to check for basic syntax errors
    // 3. Check against a cache of validation results
    // For now, we'll do basic file existence and format checks
    
    if (!fs.existsSync(filePath)) {
        return 'invalid';
    }
    
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Basic validation - check if it's valid JSON or YAML structure
        if (filePath.endsWith('.json')) {
            JSON.parse(content);
        } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
            // Basic YAML validation - check for basic structure
            if (!content.trim() || !content.includes(':')) {
                return 'invalid';
            }
        }
        
        return 'valid';
    } catch (error) {
        return 'invalid';
    }
}

export async function publishDataStructureToProd(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('publishDataStructureToProd', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for publishing to production.');
        return;
    }

    const credentials = await getCredentials(context);
    if (!credentials) {
        vscode.window.showErrorMessage('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        return;
    }

    // Confirm production publish
    const confirmation = await vscode.window.showWarningMessage(
        'Are you sure you want to publish this data structure to PRODUCTION?',
        { modal: true },
        'Yes, Publish to Production',
        'Cancel'
    );
    
    if (confirmation !== 'Yes, Publish to Production') {
        return;
    }

    const snowplowCliPath = await getSnowplowCliPath();
    const filePath = fileUri.fsPath;
    
    const command = `${snowplowCliPath} data-structures publish prod ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;

    const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
    outputChannel.show();
    outputChannel.appendLine(`Running command: ${command}`);

    exec(command, (error, stdout, stderr) => {
        handleCliResult(error, stdout, stderr, outputChannel, {
            commandName: 'Publish Data Structure to Production',
            successMessage: 'Data structure published to production successfully!',
            failureMessage: 'Failed to publish data structure to prod'
        });
    });
}

export async function validateWithProgress(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    debugLogFileUri('validateWithProgress', fileUri);
    
    if (!fileUri || !fileUri.fsPath) {
        vscode.window.showErrorMessage('No valid file path provided for validation.');
        return;
    }

    // Import status manager dynamically to avoid circular dependency
    const { SnowplowStatusManager } = await import('./snowplowExplorer');
    const statusManager = SnowplowStatusManager.getInstance();

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Validating Snowplow file",
        cancellable: false
    }, async (progress, token) => {
        
        statusManager.updateStatus('validating');
        progress.report({ increment: 0, message: "Checking credentials..." });
        
        const credentials = await getCredentials(context);
        if (!credentials) {
            statusManager.updateStatus('error', 'Credentials not set up');
            throw new Error('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        }

        progress.report({ increment: 20, message: "Detecting file type..." });
        
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
            command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else {
            // If we can't detect the type, ask the user
            const choice = await vscode.window.showQuickPick(
                ['Data Structure', 'Data Product', 'Source Application'],
                { placeHolder: 'Could not auto-detect file type. Please select:' }
            );
            
            if (!choice) {
                statusManager.updateStatus('ready');
                return;
            }
            
            if (choice === 'Data Product') {
                command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
            } else if (choice === 'Source Application') {
                command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
            } else {
                command = `${snowplowCliPath} data-structures validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
            }
        }

        progress.report({ increment: 40, message: "Running validation..." });

        const outputChannel = vscode.window.createOutputChannel('Snowplow CLI');
        outputChannel.appendLine(`Running command: ${command}`);

        return new Promise<void>((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                progress.report({ increment: 100, message: "Validation complete" });
                
                // Use the centralized error handling
                const tempOutputChannel = vscode.window.createOutputChannel('Snowplow CLI');
                
                if (error) {
                    // Handle errors using our centralized handler
                    handleCliResult(error, stdout, stderr, tempOutputChannel, {
                        commandName: 'Validation',
                        successMessage: 'Validation successful!',
                        failureMessage: 'Validation failed',
                        showSuccessNotification: false // We'll show our own below
                    });
                    
                    statusManager.updateStatus('error', `Validation failed: ${error.message}`);
                    reject(new Error(`Validation failed: ${error.message}`));
                    return;
                }
                
                // Success case - show minimal output since we're in progress mode
                if (stdout) {
                    tempOutputChannel.appendLine(`Output: ${stdout}`);
                }
                if (stderr) {
                    tempOutputChannel.appendLine(`Stderr: ${stderr}`);
                }
                
                statusManager.updateStatus('ready');
                vscode.window.showInformationMessage('✅ Validation successful!');
                
                // Refresh explorer to update status indicators
                vscode.commands.executeCommand('snowplow.refresh');
                
                resolve();
            });
        });
    });
}

export async function createSnowplowWorkspace() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a folder first to create a Snowplow workspace.');
        return;
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    
    const dataProductsDir = path.join(workspaceRoot, 'data-products');
    const dataStructuresDir = path.join(workspaceRoot, 'data-structures');
    const sourceAppsDir = path.join(dataProductsDir, 'source-apps');
    const exampleVendorDir = path.join(dataStructuresDir, 'com.example');
    
    try {
        // Create directories if they don't exist
        if (!fs.existsSync(dataProductsDir)) {
            fs.mkdirSync(dataProductsDir, { recursive: true });
        }
        if (!fs.existsSync(exampleVendorDir)) {
            fs.mkdirSync(exampleVendorDir, { recursive: true });
        }
        if (!fs.existsSync(sourceAppsDir)) {
            fs.mkdirSync(sourceAppsDir, { recursive: true });
        }
        
        // Create example files
        const exampleDataProduct = `apiVersion: v1
kind: DataProduct
metadata:
  name: example-data-product
  version: "1.0.0"
  description: "Example data product"
spec:
  domain: example
  owner: your-team
  eventSpecifications:
    - name: example_event
      url: schemas/example_event.json
`;

        const exampleDataStructure = `{
  "$schema": "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#",
  "description": "Example data structure for tracking user events",
  "self": {
    "vendor": "com.example",
    "name": "example_event",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "object",
  "properties": {
    "eventName": {
      "type": "string",
      "description": "Name of the event"
    },
    "userId": {
      "type": "string",
      "description": "Unique identifier for the user"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "When the event occurred"
    },
    "properties": {
      "type": "object",
      "description": "Additional event properties",
      "additionalProperties": true
    }
  },
  "required": ["eventName", "userId", "timestamp"],
  "additionalProperties": false
}`;

        const exampleSourceApp = `{
  "apiVersion": "v1",
  "resourceType": "source-application",
  "resourceName": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "name": "Example Website",
    "description": "Example website source application",
    "domain": "example",
    "owner": "your-team@example.com",
    "appIds": ["web", "web-qa"],
    "entities": {
      "tracked": [
        {
          "source": "iglu:org.schema/WebPage/jsonschema/1-0-0",
          "minCardinality": 1
        }
      ],
      "enriched": []
    }
  }
}`;

        fs.writeFileSync(path.join(dataProductsDir, 'example-data-product.yaml'), exampleDataProduct);
        fs.writeFileSync(path.join(exampleVendorDir, 'example_event.json'), exampleDataStructure);
        fs.writeFileSync(path.join(sourceAppsDir, 'example-website.json'), exampleSourceApp);
        
        // Create a README file with instructions
        const readmeContent = `# Snowplow Workspace

This workspace is set up for Snowplow data products, data structures, and source applications.

## Structure

- \`data-products/\` - Contains data product definitions (YAML files)
  - \`data-products/source-apps/\` - Contains source application definitions (JSON/YAML files)
- \`data-structures/\` - Contains data structure schemas organized by vendor
  - \`data-structures/com.example/\` - Example vendor namespace
  - \`data-structures/your.company/\` - Your company's schemas

## Getting Started

1. Set up your Snowplow credentials: **Snowplow: Setup Credentials**
2. Create new data products: **Snowplow: Generate a new Data Product**
3. Create new data structures: **Snowplow: Generate a new Data Structure**
4. Create new source applications: **Snowplow: Generate a new Source Application**
5. Validate your files: **Snowplow: Validate File** or use Ctrl+Shift+V
6. Publish to your pipeline: **Snowplow: Publish File** or use Ctrl+Shift+P

## Source Applications

Source applications represent systems that generate Snowplow events (websites, mobile apps, backend services). They define:
- Application identifiers (appIds)
- Global entities that are consistent across ALL events from this source
- Metadata about the application

Source applications are referenced by data products and are validated/published as part of the data product workflow. They support both JSON and YAML formats.

## Vendor Organization

Data structures are organized by vendor namespace following the reverse domain pattern:
- \`com.yourcompany\` for your company's schemas
- \`io.github.username\` for personal projects
- \`org.projectname\` for open source projects

Each schema file should include the vendor in its \`self.vendor\` field.
`;

        fs.writeFileSync(path.join(workspaceRoot, 'README.md'), readmeContent);
        
        vscode.window.showInformationMessage('✅ Snowplow workspace created successfully with example files and vendor structure!');
        
        // Refresh the explorer
        vscode.commands.executeCommand('snowplow.refresh');
        
        // Open the README file
        const readmeUri = vscode.Uri.file(path.join(workspaceRoot, 'README.md'));
        vscode.window.showTextDocument(readmeUri);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create Snowplow workspace: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function createVendorDirectory() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a folder first to create a vendor directory.');
        return;
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const dataStructuresDir = path.join(workspaceRoot, 'data-structures');
    
    // Check if data-structures directory exists
    if (!fs.existsSync(dataStructuresDir)) {
        fs.mkdirSync(dataStructuresDir, { recursive: true });
    }
    
    // Ask for vendor name
    const vendorName = await vscode.window.showInputBox({
        prompt: 'Enter vendor name (e.g., com.yourcompany, io.github.username)',
        placeHolder: 'com.example',
        validateInput: (value) => {
            if (!value) {
                return 'Vendor name is required';
            }
            if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/.test(value)) {
                return 'Vendor name must follow reverse domain notation (e.g., com.example)';
            }
            return null;
        }
    });
    
    if (!vendorName) {
        return;
    }
    
    const vendorDir = path.join(dataStructuresDir, vendorName);
    
    try {
        if (fs.existsSync(vendorDir)) {
            vscode.window.showWarningMessage(`Vendor directory '${vendorName}' already exists.`);
            return;
        }
        
        fs.mkdirSync(vendorDir, { recursive: true });
        
        // Create a sample schema file
        const sampleSchema = `{
  "$schema": "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#",
  "description": "Sample schema for ${vendorName}",
  "self": {
    "vendor": "${vendorName}",
    "name": "sample_event",
    "format": "jsonschema",
    "version": "1-0-0"
  },
  "type": "object",
  "properties": {
    "eventName": {
      "type": "string",
      "description": "Name of the event"
    },
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "When the event occurred"
    }
  },
  "required": ["eventName", "timestamp"],
  "additionalProperties": false
}`;
        
        const sampleFilePath = path.join(vendorDir, 'sample_event.json');
        fs.writeFileSync(sampleFilePath, sampleSchema);
        
        vscode.window.showInformationMessage(`✅ Vendor directory '${vendorName}' created successfully with sample schema!`);
        
        // Refresh the explorer
        vscode.commands.executeCommand('snowplow.refresh');
        
        // Open the sample file
        const sampleUri = vscode.Uri.file(sampleFilePath);
        vscode.window.showTextDocument(sampleUri);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create vendor directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// Source Application Functions

export async function generateSourceApp() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a folder first to create a source application.');
        return;
    }
    
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const dataProductsDir = path.join(workspaceRoot, 'data-products');
    const sourceAppsDir = path.join(dataProductsDir, 'source-apps');
    
    // Create directories if they don't exist
    if (!fs.existsSync(sourceAppsDir)) {
        fs.mkdirSync(sourceAppsDir, { recursive: true });
    }
    
    // Ask for source app details
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the source application (e.g., "Website", "Mobile App")',
        placeHolder: 'Website'
    });
    if (!name) { return; }

    const domain = await vscode.window.showInputBox({
        prompt: 'Enter the domain/team for this source application',
        placeHolder: 'marketing'
    });
    if (!domain) { return; }

    const owner = await vscode.window.showInputBox({
        prompt: 'Enter the owner email for this source application',
        placeHolder: 'team@example.com'
    });
    if (!owner) { return; }

    // Generate UUID for resourceName
    const resourceName = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });

    // Choose file format
    const format = await vscode.window.showQuickPick(['JSON', 'YAML'], {
        placeHolder: 'Select file format for the source application'
    });
    if (!format) { return; }

    try {
        let fileName: string;
        let content: string;
        
        if (format === 'JSON') {
            fileName = `${name.toLowerCase().replace(/\s+/g, '-')}.json`;
            content = JSON.stringify({
                apiVersion: "v1",
                resourceType: "source-application",
                resourceName: resourceName,
                data: {
                    name: name,
                    description: `${name} source application`,
                    domain: domain,
                    owner: owner,
                    appIds: [name.toLowerCase().replace(/\s+/g, '-')],
                    entities: {
                        tracked: [],
                        enriched: []
                    }
                }
            }, null, 2);
        } else {
            fileName = `${name.toLowerCase().replace(/\s+/g, '-')}.yaml`;
            content = `apiVersion: v1
resourceType: source-application
resourceName: ${resourceName}
data:
  name: ${name}
  description: ${name} source application
  domain: ${domain}
  owner: ${owner}
  appIds:
    - ${name.toLowerCase().replace(/\s+/g, '-')}
  entities:
    tracked: []
    enriched: []
`;
        }
        
        const filePath = path.join(sourceAppsDir, fileName);
        
        if (fs.existsSync(filePath)) {
            vscode.window.showWarningMessage(`Source application file '${fileName}' already exists.`);
            return;
        }
        
        fs.writeFileSync(filePath, content);
        
        vscode.window.showInformationMessage(`✅ Source application '${name}' created successfully!`);
        
        // Refresh the explorer
        vscode.commands.executeCommand('snowplow.refresh');
        
        // Open the file
        const fileUri = vscode.Uri.file(filePath);
        vscode.window.showTextDocument(fileUri);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create source application: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function editDataStructure(context: vscode.ExtensionContext, fileUri?: vscode.Uri) {
    // Determine if we're editing an existing file or creating a new one
    let existingData: any = null;
    let filePath: string | null = null;
    let currentFormat: 'json' | 'yaml' = 'json';
    
    if (fileUri && fileUri.fsPath) {
        filePath = fileUri.fsPath;
        currentFormat = filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? 'yaml' : 'json';
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (currentFormat === 'yaml') {
                // Import yaml dynamically
                const yaml = require('js-yaml');
                existingData = yaml.load(content);
            } else {
                existingData = JSON.parse(content);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read data structure file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
        }
    }

    // Create and show webview panel
    const panel = vscode.window.createWebviewPanel(
        'snowplowDataStructureEditor',
        existingData ? 'Edit Data Structure' : 'Create Data Structure',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
    );

    // Set the webview's HTML content
    panel.webview.html = getDataStructureEditorHtml(context, panel.webview, existingData, currentFormat);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'save':
                    await saveDataStructure(context, message.data, filePath);
                    panel.dispose();
                    break;
                case 'preview':
                    // Show preview of generated JSON/YAML
                    const previewData = generateDataStructureJson(message.data);
                    panel.webview.postMessage({
                        command: 'showPreview',
                        data: previewData,
                        format: message.format || 'json'
                    });
                    break;
                case 'validate':
                    // Validate the data structure
                    const validation = validateDataStructureData(message.data);
                    panel.webview.postMessage({
                        command: 'validationResult',
                        data: validation
                    });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

async function saveDataStructure(context: vscode.ExtensionContext, data: any, existingFilePath?: string | null) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a folder first to save the data structure.');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const dataStructuresDir = path.join(workspaceRoot, 'data-structures');
    const vendorDir = path.join(dataStructuresDir, data.vendor);

    // Create directories if they don't exist
    if (!fs.existsSync(vendorDir)) {
        fs.mkdirSync(vendorDir, { recursive: true });
    }

    // Generate the schema
    const schemaData = generateDataStructureJson(data);
    
    // Determine file format and content
    const format = data.outputFormat || 'json';
    let fileContent: string;
    let fileExtension: string;
    
    if (format === 'yaml') {
        const yaml = require('js-yaml');
        fileContent = yaml.dump(schemaData, { 
            indent: 2, 
            lineWidth: -1,
            noRefs: true,
            sortKeys: false
        });
        fileExtension = '.yaml';
    } else {
        fileContent = JSON.stringify(schemaData, null, 2);
        fileExtension = '.json';
    }

    // Determine file path
    let filePath: string;
    if (existingFilePath) {
        filePath = existingFilePath;
        
        // If changing format, update the file extension
        const currentExtension = path.extname(existingFilePath);
        if ((currentExtension === '.json' && format === 'yaml') || 
            ((currentExtension === '.yaml' || currentExtension === '.yml') && format === 'json')) {
            const baseName = path.basename(existingFilePath, currentExtension);
            filePath = path.join(path.dirname(existingFilePath), baseName + fileExtension);
            
            const changeFormat = await vscode.window.showWarningMessage(
                `This will change the file format from ${currentExtension.slice(1)} to ${format}. Continue?`,
                'Yes', 'No'
            );
            if (changeFormat !== 'Yes') {
                return;
            }
        }
    } else {
        const fileName = `${data.name.toLowerCase().replace(/\s+/g, '_')}${fileExtension}`;
        filePath = path.join(vendorDir, fileName);
        
        if (fs.existsSync(filePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `File '${fileName}' already exists. Do you want to overwrite it?`,
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                return;
            }
        }
    }

    try {
        fs.writeFileSync(filePath, fileContent);
        vscode.window.showInformationMessage(`✅ Data structure saved successfully as ${format.toUpperCase()}!`);
        
        // Delete old file if format changed
        if (existingFilePath && existingFilePath !== filePath && fs.existsSync(existingFilePath)) {
            fs.unlinkSync(existingFilePath);
            vscode.window.showInformationMessage(`🗑️ Old file removed: ${path.basename(existingFilePath)}`);
        }
        
        // Refresh the explorer
        vscode.commands.executeCommand('snowplow.refresh');
        
        // Open the file
        const fileUri = vscode.Uri.file(filePath);
        vscode.window.showTextDocument(fileUri);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save data structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function generateDataStructureJson(data: any) {
    // Build the inner JSON schema
    const schema: any = {
        "$schema": "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#",
        "description": data.description || `Schema for ${data.name}`,
        "self": {
            "vendor": data.vendor,
            "name": data.name.toLowerCase().replace(/\s+/g, '_'),
            "format": "jsonschema",
            "version": data.version || "1-0-0"
        },
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": data.allowAdditionalProperties !== false
    };

    // Add properties from the form
    if (data.properties && Array.isArray(data.properties)) {
        for (const prop of data.properties) {
            if (prop.name && prop.type) {
                const property: any = {
                    "type": prop.type,
                    "description": prop.description || `${prop.name} field`
                };

                // Add type-specific constraints
                switch (prop.type) {
                    case 'string':
                        if (prop.minLength) property.minLength = parseInt(prop.minLength);
                        if (prop.maxLength) property.maxLength = parseInt(prop.maxLength);
                        if (prop.pattern) property.pattern = prop.pattern;
                        if (prop.format) property.format = prop.format;
                        if (prop.enumValues) {
                            property.enum = prop.enumValues.split(',').map((v: string) => v.trim());
                        }
                        break;
                    case 'number':
                    case 'integer':
                        if (prop.minimum !== undefined) property.minimum = parseFloat(prop.minimum);
                        if (prop.maximum !== undefined) property.maximum = parseFloat(prop.maximum);
                        if (prop.multipleOf) property.multipleOf = parseFloat(prop.multipleOf);
                        break;
                    case 'array':
                        if (prop.itemType) {
                            property.items = { type: prop.itemType };
                        }
                        if (prop.minItems) property.minItems = parseInt(prop.minItems);
                        if (prop.maxItems) property.maxItems = parseInt(prop.maxItems);
                        break;
                }

                schema.properties[prop.name] = property;

                // Add to required if specified
                if (prop.required) {
                    schema.required.push(prop.name);
                }
            }
        }
    }

    // Wrap in the Snowplow CLI data structure format
    const dataStructure = {
        "apiVersion": "v1",
        "resourceType": "data-structure",
        "meta": {
            "hidden": data.hidden || false,
            "schemaType": data.schemaType || "event",
            "customData": {}
        },
        "data": schema
    };

    return dataStructure;
}

function validateDataStructureData(data: any) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!data.name || data.name.trim() === '') {
        errors.push('Name is required');
    } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(data.name.replace(/\s+/g, '_'))) {
        errors.push('Name must start with a letter and contain only letters, numbers, and underscores');
    }

    if (!data.vendor || data.vendor.trim() === '') {
        errors.push('Vendor is required');
    } else if (!/^[a-zA-Z0-9-_.]+$/.test(data.vendor)) {
        errors.push('Vendor must follow the pattern (e.g., com.example, io.snowplow)');
    }

    if (!data.version || data.version.trim() === '') {
        warnings.push('Version not specified, will default to 1-0-0');
    } else if (!/^[1-9][0-9]*-[0-9]+-[0-9]+$/.test(data.version)) {
        errors.push('Version must be in SchemaVer format (e.g., 1-0-0, 2-1-0)');
    }

    if (!data.schemaType) {
        warnings.push('Schema type not specified, will default to "event"');
    } else if (!['event', 'entity'].includes(data.schemaType)) {
        errors.push('Schema type must be either "event" or "entity"');
    }

    // Properties validation
    if (data.properties && Array.isArray(data.properties)) {
        const propertyNames = new Set();
        for (let i = 0; i < data.properties.length; i++) {
            const prop = data.properties[i];
            if (!prop.name || prop.name.trim() === '') {
                errors.push(`Property ${i + 1}: Name is required`);
            } else if (propertyNames.has(prop.name)) {
                errors.push(`Property ${i + 1}: Duplicate property name '${prop.name}'`);
            } else {
                propertyNames.add(prop.name);
            }

            if (!prop.type) {
                errors.push(`Property ${i + 1} (${prop.name}): Type is required`);
            }

            // Type-specific validation
            if (prop.type === 'string' && prop.enumValues) {
                if (!prop.enumValues.trim()) {
                    warnings.push(`Property ${prop.name}: Empty enum values`);
                }
            }

            if ((prop.type === 'number' || prop.type === 'integer') && prop.minimum && prop.maximum) {
                if (parseFloat(prop.minimum) >= parseFloat(prop.maximum)) {
                    errors.push(`Property ${prop.name}: Minimum must be less than maximum`);
                }
            }
        }
    }

    return { errors, warnings, isValid: errors.length === 0 };
}

function getDataStructureEditorHtml(context: vscode.ExtensionContext, webview: vscode.Webview, existingData?: any, currentFormat: 'json' | 'yaml' = 'json') {
    const data = existingData?.data || existingData || {};
    const meta = existingData?.meta || {};
    
    const properties = data.properties ? Object.entries(data.properties).map(([name, prop]: [string, any]) => {
        // Handle type which can be a string or an array
        let propType = prop.type;
        if (Array.isArray(propType)) {
            // Take the first non-null type
            propType = propType.find(t => t !== 'null') || propType[0];
        }
        
        const propertyData: any = {
            name,
            type: propType,
            description: prop.description,
            required: data.required?.includes(name) || false
        };

        // Extract type-specific constraints
        if (propType === 'string') {
            if (prop.minLength !== undefined) propertyData.minLength = prop.minLength;
            if (prop.maxLength !== undefined) propertyData.maxLength = prop.maxLength;
            if (prop.pattern) propertyData.pattern = prop.pattern;
            if (prop.format) propertyData.format = prop.format;
            if (prop.enum) propertyData.enumValues = prop.enum.join(', ');
        } else if (propType === 'number' || propType === 'integer') {
            if (prop.minimum !== undefined) propertyData.minimum = prop.minimum;
            if (prop.maximum !== undefined) propertyData.maximum = prop.maximum;
            if (prop.multipleOf !== undefined) propertyData.multipleOf = prop.multipleOf;
        } else if (propType === 'array') {
            if (prop.items && prop.items.type) propertyData.itemType = prop.items.type;
            if (prop.minItems !== undefined) propertyData.minItems = prop.minItems;
            if (prop.maxItems !== undefined) propertyData.maxItems = prop.maxItems;
        }

        return propertyData;
    }) : [];

    // Load HTML template
    const htmlTemplatePath = path.join(context.extensionPath, 'media', 'data-structure-editor.html');
    let htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');

    // Load property template for JavaScript
    const propertyTemplatePath = path.join(context.extensionPath, 'media', 'property-template.html');
    const propertyTemplate = fs.readFileSync(propertyTemplatePath, 'utf8');

    // Get URIs for resources (using proper webview scheme)
    const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'data-structure-editor.css')));
    const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'data-structure-editor.js')));

    // Generate properties HTML
    const propertiesHtml = properties.map((prop, index) => generatePropertyHtml(prop, index, context)).join('');

    // Escape property template for JavaScript (properly escape for template literal)
    const escapedPropertyTemplate = propertyTemplate
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\${/g, '\\${')
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, '\\n');

    // Generate initial schema for preview
    const initialSchema = existingData ? existingData : {
        "$schema": "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#",
        "description": "Schema description",
        "self": {
            "vendor": "com.example",
            "name": "example_schema",
            "format": "jsonschema",
            "version": "1-0-0"
        },
        "type": "object",
        "properties": {},
        "required": [],
        "additionalProperties": true
    };

    // Replace placeholders in HTML template
    htmlTemplate = htmlTemplate
        .replace(/{{CSS_URI}}/g, cssUri.toString())
        .replace(/{{JS_URI}}/g, jsUri.toString())
        .replace(/{{EDITOR_TITLE}}/g, existingData ? 'Edit' : 'Create')
        .replace(/{{JSON_CHECKED}}/g, currentFormat === 'json' ? 'checked' : '')
        .replace(/{{YAML_CHECKED}}/g, currentFormat === 'yaml' ? 'checked' : '')
        .replace(/{{DATA_NAME}}/g, data.self?.name || 'example_schema')
        .replace(/{{DATA_VENDOR}}/g, data.self?.vendor || 'com.example')
        .replace(/{{DATA_VERSION}}/g, data.self?.version || '1-0-0')
        .replace(/{{DATA_DESCRIPTION}}/g, (data.description || 'Schema description').replace(/"/g, '&quot;'))
        .replace(/{{SCHEMA_TYPE_EVENT_ACTIVE}}/g, (meta.schemaType || 'event') === 'event' ? 'active' : '')
        .replace(/{{SCHEMA_TYPE_ENTITY_ACTIVE}}/g, meta.schemaType === 'entity' ? 'active' : '')
        .replace(/{{PROPERTIES_HTML}}/g, propertiesHtml)
        .replace(/{{PROPERTY_COUNTER}}/g, properties.length.toString())
        .replace(/{{PROPERTY_TEMPLATE}}/g, `"${escapedPropertyTemplate}"`)
        .replace(/{{INITIAL_SCHEMA}}/g, JSON.stringify(initialSchema, null, 2).replace(/"/g, '&quot;'));

    return htmlTemplate;
}

function generatePropertyHtml(prop: any, index: number | string, context: vscode.ExtensionContext) {
    const propertyTemplatePath = path.join(context.extensionPath, 'media', 'property-template.html');
    let template = fs.readFileSync(propertyTemplatePath, 'utf8');
    
    // Replace placeholders with actual values
    template = template
        .replace(/COUNTER/g, index.toString())
        .replace(/COUNTER_DISPLAY/g, typeof index === 'number' ? (index + 1).toString() : '')
        .replace(/PROP_NAME/g, prop.name || '')
        .replace(/PROP_DESCRIPTION/g, prop.description || '')
        .replace(/PROP_REQUIRED/g, prop.required ? 'checked' : '')
        .replace(/PROP_NULLABLE/g, prop.nullable ? 'checked' : '')
        .replace(/SELECTED_STRING/g, prop.type === 'string' ? 'selected' : '')
        .replace(/SELECTED_NUMBER/g, prop.type === 'number' ? 'selected' : '')
        .replace(/SELECTED_INTEGER/g, prop.type === 'integer' ? 'selected' : '')
        .replace(/SELECTED_BOOLEAN/g, prop.type === 'boolean' ? 'selected' : '')
        .replace(/SELECTED_ARRAY/g, prop.type === 'array' ? 'selected' : '')
        .replace(/SELECTED_OBJECT/g, prop.type === 'object' ? 'selected' : '');
    
    return template;
}

export async function editDataProduct(context: vscode.ExtensionContext, fileUri?: vscode.Uri) {
    // Determine if we're editing an existing file or creating a new one
    let existingData: any = null;
    let filePath: string | null = null;
    let currentFormat: 'json' | 'yaml' = 'yaml';
    
    if (fileUri && fileUri.fsPath) {
        filePath = fileUri.fsPath;
        currentFormat = filePath.endsWith('.json') ? 'json' : 'yaml';
        
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (currentFormat === 'yaml') {
                // Import yaml dynamically
                const yaml = require('js-yaml');
                existingData = yaml.load(content);
            } else {
                existingData = JSON.parse(content);
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to read data product file: ${error instanceof Error ? error.message : 'Unknown error'}`);
            return;
        }
    }

    // Create and show webview panel
    const panel = vscode.window.createWebviewPanel(
        'snowplowDataProductEditor',
        existingData ? 'Edit Data Product' : 'Create Data Product',
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
        }
    );

    // Set the webview's HTML content
    panel.webview.html = getDataProductEditorHtml(context, panel.webview, existingData, currentFormat);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(
        async (message) => {
            switch (message.command) {
                case 'save':
                    await saveDataProduct(context, message.data, filePath, currentFormat);
                    panel.dispose();
                    break;
                case 'preview':
                    // Show preview of generated JSON/YAML
                    const previewData = message.data;
                    panel.webview.postMessage({
                        command: 'showPreview',
                        data: previewData,
                        format: message.format || 'yaml'
                    });
                    break;
                case 'validate':
                    // Validate the data product
                    const validation = validateDataProductData(message.data);
                    panel.webview.postMessage({
                        command: 'validationResult',
                        data: validation
                    });
                    break;
            }
        },
        undefined,
        context.subscriptions
    );
}

async function saveDataProduct(context: vscode.ExtensionContext, data: any, existingFilePath?: string | null, currentFormat: 'json' | 'yaml' = 'yaml') {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a folder first to save the data product.');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const dataProductsDir = path.join(workspaceRoot, 'data-products');

    // Create directory if it doesn't exist
    if (!fs.existsSync(dataProductsDir)) {
        fs.mkdirSync(dataProductsDir, { recursive: true });
    }

    // Determine file format and content
    const format: 'yaml' | 'json' = currentFormat === 'json' ? 'json' : 'yaml'; // Default to YAML for data products
    let fileContent: string;
    let fileExtension: string;
    
    if (format === 'json') {
        fileContent = JSON.stringify(data, null, 2);
        fileExtension = '.json';
    } else {
        const yaml = require('js-yaml');
        fileContent = yaml.dump(data, { 
            indent: 2, 
            lineWidth: -1,
            noRefs: true,
            sortKeys: false
        });
        fileExtension = '.yaml';
    }

    // Determine file path
    let filePath: string;
    if (existingFilePath) {
        filePath = existingFilePath;
    } else {
        const fileName = `${data.data.name.toLowerCase().replace(/\s+/g, '-')}${fileExtension}`;
        filePath = path.join(dataProductsDir, fileName);
        
        if (fs.existsSync(filePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `File '${fileName}' already exists. Do you want to overwrite it?`,
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                return;
            }
        }
    }

    try {
        fs.writeFileSync(filePath, fileContent);
        vscode.window.showInformationMessage(`✅ Data product saved successfully!`);
        
        // Refresh the explorer
        vscode.commands.executeCommand('snowplow.refresh');
        
        // Open the file
        const fileUri = vscode.Uri.file(filePath);
        vscode.window.showTextDocument(fileUri);
        
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to save data product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function validateDataProductData(data: any) {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields validation
    if (!data.resourceName || data.resourceName.trim() === '') {
        errors.push('Resource Name (UUID) is required');
    } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.resourceName)) {
        errors.push('Resource Name must be a valid UUID v4');
    }

    if (!data.data.name || data.data.name.trim() === '') {
        errors.push('Product name is required');
    }

    if (data.data.owner && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.data.owner)) {
        warnings.push('Owner should be a valid email address');
    }

    // Event specifications validation
    if (!data.data.eventSpecifications || data.data.eventSpecifications.length === 0) {
        errors.push('At least one event specification is required');
    } else {
        data.data.eventSpecifications.forEach((spec: any, index: number) => {
            if (!spec.resourceName || spec.resourceName.trim() === '') {
                errors.push(`Event specification ${index + 1}: Resource Name is required`);
            }
            if (!spec.name || spec.name.trim() === '') {
                errors.push(`Event specification ${index + 1}: Name is required`);
            }
            if (!spec.event.source || spec.event.source.trim() === '') {
                errors.push(`Event specification ${index + 1}: Event source is required`);
            }
        });
    }

    return { errors, warnings, isValid: errors.length === 0 };
}

function getDataProductEditorHtml(context: vscode.ExtensionContext, webview: vscode.Webview, existingData?: any, currentFormat: 'json' | 'yaml' = 'yaml') {
    const data = existingData?.data || {};
    
    // Extract existing data
    const name = data.name || '';
    const domain = data.domain || '';
    const owner = data.owner || '';
    const description = data.description || '';
    const resourceName = existingData?.resourceName || '';
    const sourceApps = data.sourceApplications || [];
    const eventSpecs = data.eventSpecifications || [];

    // Load HTML template
    const htmlTemplatePath = path.join(context.extensionPath, 'media', 'data-product-editor.html');
    let htmlTemplate = fs.readFileSync(htmlTemplatePath, 'utf8');

    // Load templates for dynamic content
    const sourceAppTemplatePath = path.join(context.extensionPath, 'media', 'source-app-template.html');
    const sourceAppTemplate = fs.readFileSync(sourceAppTemplatePath, 'utf8');
    
    const eventSpecTemplatePath = path.join(context.extensionPath, 'media', 'event-spec-template.html');
    const eventSpecTemplate = fs.readFileSync(eventSpecTemplatePath, 'utf8');
    
    const entityTemplatePath = path.join(context.extensionPath, 'media', 'entity-template.html');
    const entityTemplate = fs.readFileSync(entityTemplatePath, 'utf8');

    // Get URIs for resources
    const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'data-product-editor.css')));
    const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'data-product-editor.js')));

    // Generate source apps HTML
    const sourceAppsHtml = sourceApps.map((app: any, index: number) => 
        generateSourceAppHtml(app, index, context)
    ).join('');

    // Generate event specs HTML
    const eventSpecsHtml = eventSpecs.map((spec: any, index: number) => 
        generateEventSpecHtml(spec, index, context)
    ).join('');

    // Escape templates for JavaScript
    const escapedSourceAppTemplate = sourceAppTemplate
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\${/g, '\\${')
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, '\\n');

    const escapedEventSpecTemplate = eventSpecTemplate
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\${/g, '\\${')
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, '\\n');

    const escapedEntityTemplate = entityTemplate
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\${/g, '\\${')
        .replace(/"/g, '\\"')
        .replace(/\r?\n/g, '\\n');

    // Generate initial data product for preview
    const initialDataProduct = existingData || {
        apiVersion: 'v1',
        resourceType: 'data-product',
        resourceName: 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
        data: {
            name: 'Example Data Product',
            domain: 'Analytics',
            owner: 'owner@example.com',
            description: 'Description of the data product',
            sourceApplications: [],
            eventSpecifications: []
        }
    };

    // Replace placeholders in HTML template
    htmlTemplate = htmlTemplate
        .replace(/{{CSS_URI}}/g, cssUri.toString())
        .replace(/{{JS_URI}}/g, jsUri.toString())
        .replace(/{{DATA_NAME}}/g, name.replace(/"/g, '&quot;'))
        .replace(/{{DATA_DOMAIN}}/g, domain.replace(/"/g, '&quot;'))
        .replace(/{{DATA_OWNER}}/g, owner.replace(/"/g, '&quot;'))
        .replace(/{{DATA_DESCRIPTION}}/g, description.replace(/"/g, '&quot;'))
        .replace(/{{RESOURCE_NAME}}/g, resourceName.replace(/"/g, '&quot;'))
        .replace(/{{SOURCE_APPS_HTML}}/g, sourceAppsHtml)
        .replace(/{{EVENT_SPECS_HTML}}/g, eventSpecsHtml)
        .replace(/{{SOURCE_APP_COUNTER}}/g, sourceApps.length.toString())
        .replace(/{{EVENT_SPEC_COUNTER}}/g, eventSpecs.length.toString())
        .replace(/{{ENTITY_COUNTER}}/g, '0')
        .replace(/{{SOURCE_APP_TEMPLATE}}/g, `"${escapedSourceAppTemplate}"`)
        .replace(/{{EVENT_SPEC_TEMPLATE}}/g, `"${escapedEventSpecTemplate}"`)
        .replace(/{{ENTITY_TEMPLATE}}/g, `"${escapedEntityTemplate}"`)
        .replace(/{{INITIAL_DATAPRODUCT}}/g, JSON.stringify(initialDataProduct, null, 2).replace(/"/g, '&quot;'));

    return htmlTemplate;
}

function generateSourceAppHtml(app: any, index: number, context: vscode.ExtensionContext) {
    const sourceAppTemplatePath = path.join(context.extensionPath, 'media', 'source-app-template.html');
    let template = fs.readFileSync(sourceAppTemplatePath, 'utf8');
    
    template = template
        .replace(/COUNTER/g, index.toString())
        .replace(/SOURCE_APP_REF/g, app.$ref || '');
    
    return template;
}

function generateEventSpecHtml(spec: any, index: number, context: vscode.ExtensionContext) {
    const eventSpecTemplatePath = path.join(context.extensionPath, 'media', 'event-spec-template.html');
    let template = fs.readFileSync(eventSpecTemplatePath, 'utf8');
    
    // Generate tracked entities HTML
    const trackedEntitiesHtml = (spec.entities?.tracked || []).map((entity: any, entityIndex: number) => 
        generateEntityHtml(entity, index, 'tracked', entityIndex, context)
    ).join('');
    
    // Generate enriched entities HTML
    const enrichedEntitiesHtml = (spec.entities?.enriched || []).map((entity: any, entityIndex: number) => 
        generateEntityHtml(entity, index, 'enriched', entityIndex, context)
    ).join('');
    
    template = template
        .replace(/COUNTER/g, index.toString())
        .replace(/EVENTSPEC_RESOURCE_NAME/g, spec.resourceName || '')
        .replace(/EVENTSPEC_NAME/g, spec.name || '')
        .replace(/EVENTSPEC_DESCRIPTION/g, spec.description || '')
        .replace(/EVENTSPEC_SOURCE/g, spec.event?.source || '')
        .replace(/TRACKED_ENTITIES_HTML/g, trackedEntitiesHtml)
        .replace(/ENRICHED_ENTITIES_HTML/g, enrichedEntitiesHtml);
    
    return template;
}

function generateEntityHtml(entity: any, eventSpecIndex: number, entityType: string, entityIndex: number, context: vscode.ExtensionContext) {
    const entityTemplatePath = path.join(context.extensionPath, 'media', 'entity-template.html');
    let template = fs.readFileSync(entityTemplatePath, 'utf8');
    
    template = template
        .replace(/EVENTSPEC_COUNTER/g, eventSpecIndex.toString())
        .replace(/ENTITY_TYPE/g, entityType)
        .replace(/ENTITY_COUNTER/g, entityIndex.toString())
        .replace(/ENTITY_SOURCE/g, entity.source || '')
        .replace(/ENTITY_MIN_CARDINALITY/g, entity.minCardinality?.toString() || '')
        .replace(/ENTITY_MAX_CARDINALITY/g, entity.maxCardinality?.toString() || '')
        .replace(/ENTITY_MIN_CARDINALITY_STYLE/g, entityType === 'enriched' ? 'style="display: none;"' : '')
        .replace(/ENTITY_MAX_CARDINALITY_STYLE/g, entityType === 'enriched' ? 'style="display: none;"' : '');
    
    return template;
}