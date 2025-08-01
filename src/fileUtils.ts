import * as vscode from 'vscode';
import * as fs from 'fs';

export function debugLogFileUri(functionName: string, fileUri: vscode.Uri | undefined) {
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
            
            // Look for schema patterns to identify data structures
            if (content.includes('"$schema"') && content.includes('iglu:')) {
                return 'data-structure';
            }
            
            // Look for data product patterns
            if (content.includes('sourceApplications') || content.includes('eventSpecifications')) {
                return 'data-product';
            }
        }
    } catch (error) {
        console.error('Error reading file to detect type:', error);
    }
    
    return 'unknown';
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

export async function openContainingFolder(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected');
        return;
    }
    
    const folderPath = fileUri.with({ path: fileUri.path.substring(0, fileUri.path.lastIndexOf('/')) });
    vscode.commands.executeCommand('revealFileInOS', folderPath);
}

export async function copyFilePath(context: vscode.ExtensionContext, fileUri: vscode.Uri) {
    if (!fileUri) {
        vscode.window.showErrorMessage('No file selected');
        return;
    }
    
    await vscode.env.clipboard.writeText(fileUri.fsPath);
    vscode.window.showInformationMessage('File path copied to clipboard');
}

export async function debugFileContext(context: vscode.ExtensionContext) {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showErrorMessage('No active file');
        return;
    }
    
    const fileUri = activeEditor.document.uri;
    const filePath = fileUri.fsPath;
    const fileType = detectFileType(filePath);
    
    const message = `Active file: ${filePath}\nDetected type: ${fileType}`;
    vscode.window.showInformationMessage(message, { modal: true });
}
