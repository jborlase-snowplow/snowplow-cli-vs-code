// Re-export all functions from modular files
export { 
    detectFileType, 
    debugLogFileUri, 
    getFileStatus, 
    openContainingFolder, 
    copyFilePath, 
    debugFileContext 
} from './fileUtils';

export { 
    validateFile,
    publishFile,
    generateDataStructure,
    generateDataProduct,
    addEventSpec,
    downloadAllDataProducts,
    publishAllDataProducts,
    validateAllDataProducts,
    downloadAllDataStructures,
    publishAllDataStructuresToDev,
    publishAllDataStructuresToProd,
    validateAllDataStructures,
    validateDataProduct,
    validateDataStructure,
    validateCurrentFile,
    publishCurrentFile
} from './cliOperations';

export { editDataStructure } from './dataStructureEditor';

export { editDataProduct } from './dataProductEditor';

export { 
    createSnowplowWorkspace, 
    createVendorDirectory, 
    generateSourceApp 
} from './workspaceUtils';

// Additional utility functions that need special handling
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { getCredentials } from './auth';
import { debugLogFileUri, detectFileType } from './fileUtils';

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
    outputChannel.appendLine('--- Output ---');
    if (stdout) {
        outputChannel.appendLine(stdout);
    }
    
    if (stderr) {
        outputChannel.appendLine('--- Errors ---');
        outputChannel.appendLine(stderr);
    }
    
    if (error || stderr.toLowerCase().includes('error') || stderr.toLowerCase().includes('failed')) {
        vscode.window.showErrorMessage(`❌ ${options.failureMessage}`, 'Show Details').then(selection => {
            if (selection === 'Show Details') {
                outputChannel.show();
            }
        });
        return;
    }
    
    if (options.showSuccessNotification !== false) {
        vscode.window.showInformationMessage(`✅ ${options.successMessage}`);
    }
    
    if (options.refreshExplorerOnSuccess !== false) {
        vscode.commands.executeCommand('snowplow.refresh');
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

    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Validating Snowplow file",
        cancellable: false
    }, async (progress, token) => {
        
        progress.report({ increment: 0, message: "Checking credentials..." });
        
        const credentials = await getCredentials(context);
        if (!credentials) {
            throw new Error('Snowplow credentials not set up. Please run "Snowplow: Setup Credentials" first.');
        }

        progress.report({ increment: 20, message: "Detecting file type..." });
        
        const snowplowCliPath = await getSnowplowCliPath();
        const filePath = fileUri.fsPath;
        
        const fileType = detectFileType(filePath);
        let command: string;
        
        if (fileType === 'data-product') {
            command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else if (fileType === 'data-structure') {
            command = `${snowplowCliPath} data-structures validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else if (fileType === 'source-application') {
            command = `${snowplowCliPath} data-products validate ${filePath} --api-key-id ${credentials.apiKeyId} --api-key ${credentials.apiKey} --org-id ${credentials.orgId} --host ${credentials.host}`;
        } else {
            const choice = await vscode.window.showQuickPick(
                ['Data Structure', 'Data Product', 'Source Application'],
                { placeHolder: 'Could not auto-detect file type. Please select:' }
            );
            
            if (!choice) {
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
                
                if (error) {
                    outputChannel.show();
                    outputChannel.appendLine('--- Output ---');
                    if (stdout) outputChannel.appendLine(stdout);
                    if (stderr) outputChannel.appendLine('--- Errors ---');
                    if (stderr) outputChannel.appendLine(stderr);
                    
                    reject(new Error(`Validation failed: ${error.message}`));
                    return;
                }
                
                if (stdout) outputChannel.appendLine(stdout);
                if (stderr) outputChannel.appendLine(stderr);
                
                vscode.window.showInformationMessage('✅ Validation successful!');
                vscode.commands.executeCommand('snowplow.refresh');
                
                resolve();
            });
        });
    });
}
