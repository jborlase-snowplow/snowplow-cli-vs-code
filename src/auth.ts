import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

const SECRET_STORAGE_KEY = 'snowplow.credentials';
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'snowplow', 'snowplow.yml');

interface SnowplowCredentials {
    apiKeyId: string;
    apiKey: string;
    orgId: string;
    host?: string;
}

function readDefaultCredentials(): SnowplowCredentials | undefined {
    try {
        if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
            const yamlContent = fs.readFileSync(DEFAULT_CONFIG_PATH, 'utf8');
            const config = yaml.load(yamlContent) as any;
            
            if (config && config.console) {
                return {
                    apiKeyId: config.console['api-key-id'],
                    apiKey: config.console['api-key'],
                    orgId: config.console['org-id'],
                    host: config.console.host || 'https://console.snowplowanalytics.com'
                };
            }
        }
    } catch (error) {
        console.error('Error reading default credentials:', error);
    }
    return undefined;
}

export async function setupCredentials(context: vscode.ExtensionContext) {
    // First, check if credentials exist in the default location
    const defaultCredentials = readDefaultCredentials();
    
    if (defaultCredentials) {
        const useDefault = await vscode.window.showQuickPick(
            ['Use credentials from ~/.config/snowplow/snowplow.yml', 'Enter credentials manually'],
            { placeHolder: 'Credentials found in default location. How would you like to proceed?' }
        );
        
        if (useDefault === 'Use credentials from ~/.config/snowplow/snowplow.yml') {
            await context.secrets.store(SECRET_STORAGE_KEY, JSON.stringify(defaultCredentials));
            vscode.window.showInformationMessage('Snowplow credentials loaded from default configuration file.');
            return;
        }
    }

    // Manual credential entry
    const apiKeyId = await vscode.window.showInputBox({ prompt: 'Enter your Snowplow API Key ID' });
    if (!apiKeyId) { return; }

    const apiKey = await vscode.window.showInputBox({ prompt: 'Enter your Snowplow API Key', password: true });
    if (!apiKey) { return; }

    const orgId = await vscode.window.showInputBox({ prompt: 'Enter your Snowplow Organization ID' });
    if (!orgId) { return; }

    const host = await vscode.window.showInputBox({ prompt: 'Enter your Snowplow BDP Host', value: 'https://console.snowplowanalytics.com' });
    if (!host) { return; }

    const credentials: SnowplowCredentials = {
        apiKeyId,
        apiKey,
        orgId,
        host
    };

    await context.secrets.store(SECRET_STORAGE_KEY, JSON.stringify(credentials));
    vscode.window.showInformationMessage('Snowplow credentials saved successfully.');
}

export async function getCredentials(context: vscode.ExtensionContext): Promise<SnowplowCredentials | undefined> {
    // First check stored credentials
    const credentialsString = await context.secrets.get(SECRET_STORAGE_KEY);
    if (credentialsString) {
        return JSON.parse(credentialsString);
    }
    
    // If no stored credentials, try to load from default location
    const defaultCredentials = readDefaultCredentials();
    if (defaultCredentials) {
        // Store the credentials for future use
        await context.secrets.store(SECRET_STORAGE_KEY, JSON.stringify(defaultCredentials));
        return defaultCredentials;
    }
    
    return undefined;
}

export async function clearCredentials(context: vscode.ExtensionContext): Promise<void> {
    await context.secrets.delete(SECRET_STORAGE_KEY);
    vscode.window.showInformationMessage('Snowplow credentials cleared.');
}

export function getDefaultConfigPath(): string {
    return DEFAULT_CONFIG_PATH;
}