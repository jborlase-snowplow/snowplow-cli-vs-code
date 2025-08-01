import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface SnowplowSchema {
    apiVersion?: string;
    resourceType?: string;
    resourceName?: string;
    meta?: {
        hidden?: boolean;
        schemaType?: 'event' | 'entity';
        customData?: any;
    };
    data?: {
        $schema?: string;
        description?: string;
        self?: {
            vendor?: string;
            name?: string;
            format?: string;
            version?: string;
        };
        type?: string;
        properties?: any;
        required?: string[];
        additionalProperties?: boolean;
        // Data Product specific fields
        name?: string;
        domain?: string;
        owner?: string;
        sourceApplications?: any[];
        eventSpecifications?: any[];
    };
}

export class SnowplowLanguageFeatures {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private validationTimeouts: Map<string, NodeJS.Timeout> = new Map();
    private schemaCache: Map<string, any> = new Map();
    private readonly VALIDATION_DELAY = 500; // ms
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('snowplow');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    }

    activate(context: vscode.ExtensionContext) {
        // Auto-detect Snowplow YAML files and set language mode
        this.setupLanguageDetection(context);
        
        // Register completion provider for JSON files
        const jsonCompletionProvider = vscode.languages.registerCompletionItemProvider(
            [
                { scheme: 'file', language: 'json' },
                { scheme: 'file', language: 'snowplow-json' }
            ],
            {
                provideCompletionItems: this.provideCompletionItems.bind(this)
            },
            '"', ':', ','
        );

        // Register completion provider for YAML files  
        const yamlCompletionProvider = vscode.languages.registerCompletionItemProvider(
            [
                { scheme: 'file', language: 'yaml' },
                { scheme: 'file', language: 'yml' },
                { scheme: 'file', language: 'snowplow-yaml' }
            ],
            {
                provideCompletionItems: this.provideCompletionItems.bind(this)
            },
            ':', ' ', '-', '\n'
        );

        // Register hover provider
        const hoverProvider = vscode.languages.registerHoverProvider(
            [
                { scheme: 'file', language: 'json' },
                { scheme: 'file', language: 'yaml' },
                { scheme: 'file', language: 'yml' },
                { scheme: 'file', language: 'snowplow-yaml' },
                { scheme: 'file', language: 'snowplow-json' }
            ],
            {
                provideHover: this.provideHover.bind(this)
            }
        );

        // Register code action provider
        const codeActionProvider = vscode.languages.registerCodeActionsProvider(
            [
                { scheme: 'file', language: 'json' },
                { scheme: 'file', language: 'yaml' },
                { scheme: 'file', language: 'yml' },
                { scheme: 'file', language: 'snowplow-yaml' },
                { scheme: 'file', language: 'snowplow-json' }
            ],
            {
                provideCodeActions: this.provideCodeActions.bind(this)
            }
        );

        // Document validation on change with debouncing
        const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument((event) => {
            if (this.isSnowplowFile(event.document)) {
                this.debouncedValidateDocument(event.document);
            }
        });

        // Document validation on open (immediate)
        const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument((document) => {
            if (this.isSnowplowFile(document)) {
                this.validateDocument(document);
            }
        });

        context.subscriptions.push(
            jsonCompletionProvider,
            yamlCompletionProvider,
            hoverProvider,
            codeActionProvider,
            this.diagnosticCollection,
            onDidChangeTextDocument,
            onDidOpenTextDocument
        );

        // Validate all open Snowplow documents
        vscode.workspace.textDocuments.forEach(doc => {
            if (this.isSnowplowFile(doc)) {
                this.validateDocument(doc);
            }
        });
    }

    private setupLanguageDetection(context: vscode.ExtensionContext) {
        // Monitor when documents are opened
        const onDidOpenTextDocument = vscode.workspace.onDidOpenTextDocument(async (document) => {
            await this.detectSnowplowLanguage(document);
        });

        // Monitor when documents are changed
        const onDidChangeTextDocument = vscode.workspace.onDidChangeTextDocument(async (event) => {
            await this.detectSnowplowLanguage(event.document);
        });

        // Check already open documents
        vscode.workspace.textDocuments.forEach(async (document) => {
            await this.detectSnowplowLanguage(document);
        });

        context.subscriptions.push(onDidOpenTextDocument);
        context.subscriptions.push(onDidChangeTextDocument);
    }

    public async detectSnowplowLanguage(document: vscode.TextDocument) {
        // Only process YAML files that are not already snowplow-yaml
        if (!['yaml', 'yml'].includes(document.languageId)) {
            return;
        }

        const text = document.getText();
        
        // Check for Snowplow indicators
        const isSnowplowFile = this.isSnowplowFileByContent(text, document.uri.fsPath);
        
        if (isSnowplowFile && document.languageId !== 'snowplow-yaml') {
            try {
                // Set language to snowplow-yaml for better syntax highlighting
                await vscode.languages.setTextDocumentLanguage(document, 'snowplow-yaml');
                this.updateStatusBar('✨ Snowplow YAML detected - syntax highlighting enabled');
                console.log(`[Snowplow] Set language to snowplow-yaml for: ${document.uri.fsPath}`);
            } catch (error) {
                console.error(`[Snowplow] Failed to set language mode:`, error);
                this.updateStatusBar('⚠️ Snowplow file detected - manual language mode needed');
            }
        } else if (isSnowplowFile && document.languageId === 'snowplow-yaml') {
            this.updateStatusBar('✨ Snowplow YAML file');
        }
    }

    private updateStatusBar(text: string) {
        this.statusBarItem.text = text;
        this.statusBarItem.show();
        
        // Hide after 3 seconds
        setTimeout(() => {
            this.statusBarItem.hide();
        }, 3000);
    }

    private isSnowplowFileByContent(content: string, filePath: string): boolean {
        // Check file path patterns
        if (filePath.includes('/data-structures/') || 
            filePath.includes('/data-products/') || 
            filePath.includes('/source-apps/')) {
            return true;
        }

        // Check content patterns
        const snowplowPatterns = [
            /apiVersion:\s*v1/,
            /resourceType:\s*(data-structure|data-product|source-app)/,
            /yaml-language-server:.*snowplow/,
            /\$schema:.*iglucentral/,
            /vendor:\s*com\./,
            /format:\s*jsonschema/
        ];

        return snowplowPatterns.some(pattern => pattern.test(content));
    }

    public isSnowplowFile(document: vscode.TextDocument): boolean {
        const filePath = document.uri.fsPath;
        const isInDataStructuresFolder = filePath.includes('/data-structures/') || filePath.includes('\\data-structures\\');
        const isInDataProductsFolder = filePath.includes('/data-products/') || filePath.includes('\\data-products\\');
        const isInSourceAppsFolder = filePath.includes('/source-apps/') || filePath.includes('\\source-apps\\');
        const hasValidExtension = filePath.endsWith('.json') || filePath.endsWith('.yaml') || filePath.endsWith('.yml');
        const isSnowplowLanguage = document.languageId === 'snowplow-yaml' || document.languageId === 'snowplow-json';
        
        // Check if it's in Snowplow folders or has snowplow language ID
        if (((isInDataStructuresFolder || isInDataProductsFolder || isInSourceAppsFolder) && hasValidExtension) || isSnowplowLanguage) {
            return true;
        }
        
        // Also check if it's a Snowplow schema based on content for files not in standard folders
        if (!isInDataStructuresFolder && !isInDataProductsFolder && !isInSourceAppsFolder && hasValidExtension && !isSnowplowLanguage) {
            const content = document.getText();
            try {
                const parsed = document.languageId === 'json' ? JSON.parse(content) : yaml.load(content);
                return parsed && 
                       (parsed.resourceType === 'data-structure' || 
                        parsed.resourceType === 'data-product' || 
                        parsed.resourceType === 'source-application' ||
                        parsed.apiVersion === 'v1');
            } catch {
                return false;
            }
        }
        
        return false;
    }

    private parseDocument(document: vscode.TextDocument): SnowplowSchema | null {
        try {
            const text = document.getText();
            const uri = document.uri.toString();
            const contentHash = this.hashCode(text);
            const cacheKey = `${uri}:${contentHash}`;

            // Check cache first
            if (this.schemaCache.has(cacheKey)) {
                return this.schemaCache.get(cacheKey);
            }

            let parsed: SnowplowSchema | null = null;
            if (document.languageId === 'json' || document.uri.fsPath.endsWith('.json')) {
                parsed = JSON.parse(text);
            } else {
                parsed = yaml.load(text) as SnowplowSchema;
            }

            // Cache the result
            this.schemaCache.set(cacheKey, parsed);
            
            // Clean old cache entries (keep only last 50)
            if (this.schemaCache.size > 50) {
                const keys = Array.from(this.schemaCache.keys());
                const toDelete = keys.slice(0, keys.length - 50);
                toDelete.forEach(key => this.schemaCache.delete(key));
            }

            return parsed;
        } catch (error) {
            return null;
        }
    }

    private hashCode(text: string): number {
        let hash = 0;
        if (text.length === 0) return hash;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash;
    }

    private provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const isYaml = document.languageId === 'yaml' || document.languageId === 'yml' || 
                       document.uri.fsPath.endsWith('.yaml') || document.uri.fsPath.endsWith('.yml');

        // For YAML, determine if we're providing a key or value completion
        const isYamlValueCompletion = isYaml && (
            textBeforeCursor.trim().endsWith(':') || 
            textBeforeCursor.includes(': ')
        );

        // Get more precise context information
        const context = this.getDetailedContext(document, position);
        
        // Only provide completions if we have a valid Snowplow schema context
        if (!this.isSnowplowFile(document)) {
            return completions;
        }

        // Provide completions based on specific context
        switch (context.section) {
            case 'root':
                return this.getRootCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'meta':
                return this.getMetaCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'data':
                return this.getDataCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'self':
                return this.getSelfCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'properties':
                return this.getPropertiesCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'property':
                return this.getPropertyCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'dataProduct':
                return this.getDataProductCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'eventSpecification':
                return this.getEventSpecificationCompletions(isYaml, isYamlValueCompletion, context);
            
            case 'entities':
                return this.getEntitiesCompletions(isYaml, isYamlValueCompletion, context);
            
            default:
                // Fallback to generic completions if context is unclear
                return this.getGenericCompletions(isYaml, isYamlValueCompletion, textBeforeCursor);
        }
    }

    private getDetailedContext(document: vscode.TextDocument, position: vscode.Position): any {
        const isYaml = this.isYamlDocument(document);
        const textAbove = document.getText(new vscode.Range(0, 0, position.line + 1, 0));
        const lines = textAbove.split('\n');
        const currentLine = document.lineAt(position).text;
        
        // Determine resource type
        const isDataProduct = textAbove.includes('"resourceType": "data-product"') || 
                              textAbove.includes('resourceType: data-product');
        const isDataStructure = textAbove.includes('"resourceType": "data-structure"') || 
                                textAbove.includes('resourceType: data-structure');
        
        // Determine current section and depth
        let section = 'root';
        let depth = 0;
        let parentKey = '';
        let propertyName = '';
        
        if (isYaml) {
            const yamlContext = this.getYamlContext(lines, position.line);
            section = yamlContext.section;
            depth = yamlContext.depth;
            parentKey = yamlContext.parentKey;
            propertyName = yamlContext.propertyName;
        } else {
            const jsonContext = this.getJsonContext(textAbove, position);
            section = jsonContext.section;
            depth = jsonContext.depth;
            parentKey = jsonContext.parentKey;
            propertyName = jsonContext.propertyName;
        }
        
        return {
            section,
            depth,
            parentKey,
            propertyName,
            isDataProduct,
            isDataStructure,
            isYaml,
            currentLine: currentLine.trim(),
            lineIndentation: currentLine.search(/\S/)
        };
    }

    private getYamlContext(lines: string[], currentLineIndex: number): any {
        let section = 'root';
        let depth = 0;
        let parentKey = '';
        let propertyName = '';
        const sectionStack: string[] = [];
        
        for (let i = 0; i <= currentLineIndex; i++) {
            const line = lines[i];
            if (!line || line.trim().startsWith('#')) continue;
            
            const indentation = line.search(/\S/);
            const trimmed = line.trim();
            
            if (indentation === -1) continue; // Empty line
            
            // Update section stack based on indentation
            while (sectionStack.length > 0 && indentation <= depth) {
                sectionStack.pop();
                depth = sectionStack.length > 0 ? depth - 2 : 0;
            }
            
            // Check for section headers
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex > 0) {
                const key = trimmed.substring(0, colonIndex).trim();
                
                // Determine if this is a section header or property
                const hasValue = trimmed.substring(colonIndex + 1).trim().length > 0;
                
                if (!hasValue || this.isYamlSectionKey(key)) {
                    sectionStack.push(key);
                    depth = indentation;
                    
                    // Determine section type
                    if (key === 'meta') section = 'meta';
                    else if (key === 'data') section = 'data';
                    else if (key === 'self') section = 'self';
                    else if (key === 'properties') section = 'properties';
                    else if (key === 'eventSpecifications') section = 'eventSpecification';
                    else if (key === 'entities') section = 'entities';
                    else if (sectionStack.includes('data') && !sectionStack.includes('self') && !sectionStack.includes('properties')) {
                        section = 'dataProduct';
                    } else if (sectionStack.includes('properties') && this.isPropertyKey(key)) {
                        section = 'property';
                        propertyName = key;
                    }
                }
                
                parentKey = key;
            }
        }
        
        return { section, depth, parentKey, propertyName };
    }

    private getJsonContext(textAbove: string, position: vscode.Position): any {
        let section = 'root';
        let depth = 0;
        let parentKey = '';
        let propertyName = '';
        
        // Count braces to determine depth
        const openBraces = (textAbove.match(/{/g) || []).length;
        const closeBraces = (textAbove.match(/}/g) || []).length;
        depth = openBraces - closeBraces;
        
        // Find current section based on JSON structure
        if (textAbove.includes('"meta"') && this.isInsideJsonSection(textAbove, 'meta')) {
            section = 'meta';
        } else if (textAbove.includes('"self"') && this.isInsideJsonSection(textAbove, 'self')) {
            section = 'self';
        } else if (textAbove.includes('"properties"') && this.isInsideJsonSection(textAbove, 'properties')) {
            section = 'properties';
            // Check if we're inside a specific property
            const propertyMatch = textAbove.match(/"properties"[^}]*"([^"]+)":\s*{[^}]*$/);
            if (propertyMatch) {
                section = 'property';
                propertyName = propertyMatch[1];
            }
        } else if (textAbove.includes('"data"') && this.isInsideJsonSection(textAbove, 'data')) {
            if (textAbove.includes('"resourceType": "data-product"')) {
                section = 'dataProduct';
            } else {
                section = 'data';
            }
        } else if (textAbove.includes('"eventSpecifications"') && this.isInsideJsonSection(textAbove, 'eventSpecifications')) {
            section = 'eventSpecification';
        } else if (textAbove.includes('"entities"') && this.isInsideJsonSection(textAbove, 'entities')) {
            section = 'entities';
        }
        
        return { section, depth, parentKey, propertyName };
    }

    private isYamlSectionKey(key: string): boolean {
        const sectionKeys = ['meta', 'data', 'self', 'properties', 'eventSpecifications', 'entities', 
                           'sourceApplications', 'tracked', 'enriched', 'event', 'schema'];
        return sectionKeys.includes(key);
    }

    private isPropertyKey(key: string): boolean {
        // Simple heuristic: property keys are usually lowercase with underscores
        return /^[a-z][a-z0-9_]*$/.test(key);
    }

    private isInsideJsonSection(textAbove: string, sectionName: string): boolean {
        const sectionStart = textAbove.lastIndexOf(`"${sectionName}"`);
        if (sectionStart === -1) return false;
        
        const afterSection = textAbove.substring(sectionStart);
        const openBraces = (afterSection.match(/{/g) || []).length;
        const closeBraces = (afterSection.match(/}/g) || []).length;
        
        return openBraces > closeBraces;
    }

    // Specific completion methods for different contexts
    private getRootCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('apiVersion', 'v1', 'API version for Snowplow resources'),
                this.createYamlKeyCompletion('resourceType', 'data-structure', 'Resource type: data-structure or data-product'),
                this.createYamlKeyCompletion('resourceName', '', 'UUID identifier for data products (generate with uuidgen)')
            );

            if (!context.isDataProduct) {
                completions.push(
                    this.createYamlBlockCompletion('meta', '\n  hidden: ${1:false}\n  schemaType: ${2:event}\n  customData: ${3:{}}', 'Metadata for data structures'),
                    this.createYamlBlockCompletion('data', '\n  \\$schema: ${1:http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#}\n  description: "${2:}"\n  self:\n    vendor: ${3:com.example}\n    name: ${4:schema_name}\n    format: ${5:jsonschema}\n    version: ${6:1-0-0}\n  type: ${7:object}\n  properties: ${8:{}}\n  required: ${9:[]}\n  additionalProperties: ${10:false}', 'Schema data for data structures')
                );
            } else {
                completions.push(
                    this.createYamlBlockCompletion('data', '\n  name: "${1:}"\n  domain: "${2:}"\n  owner: "${3:}"\n  description: "${4:}"\n  sourceApplications: ${5:[]}\n  eventSpecifications: ${6:[]}', 'Data product configuration')
                );
            }
        } else {
            completions.push(
                this.createCompletionItem('apiVersion', '"v1"', 'API version for Snowplow resources'),
                this.createCompletionItem('resourceType', '"data-structure"', 'Resource type: data-structure or data-product'),
                this.createCompletionItem('resourceName', '""', 'UUID identifier for data products (generate with uuidgen)')
            );
        }
        
        return completions;
    }

    private getMetaCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('hidden', 'false', 'Whether to hide in BDP Console'),
                this.createYamlKeyCompletion('schemaType', 'event', 'Schema type: event or entity'),
                this.createYamlKeyCompletion('customData', '{}', 'Custom metadata object')
            );
        } else if (isYaml && isYamlValueCompletion && context.currentLine.includes('schemaType:')) {
            completions.push(
                this.createCompletionItem('event', 'event', 'Event schema type - for actions/behaviors', true),
                this.createCompletionItem('entity', 'entity', 'Entity schema type - for contextual information', true)
            );
        } else {
            completions.push(
                this.createCompletionItem('hidden', 'false', 'Whether to hide in BDP Console'),
                this.createCompletionItem('schemaType', '"event"', 'Schema type: event or entity'),
                this.createCompletionItem('customData', '{}', 'Custom metadata object')
            );
        }
        
        return completions;
    }

    private getSelfCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('vendor', 'com.example', 'Vendor in reverse domain notation'),
                this.createYamlKeyCompletion('name', 'schema_name', 'Schema name (lowercase, underscores)'),
                this.createYamlKeyCompletion('format', 'jsonschema', 'Schema format'),
                this.createYamlKeyCompletion('version', '1-0-0', 'Schema version in X-Y-Z format')
            );
        } else {
            completions.push(
                this.createCompletionItem('vendor', '"com.example"', 'Vendor in reverse domain notation'),
                this.createCompletionItem('name', '"schema_name"', 'Schema name (lowercase, underscores)'),
                this.createCompletionItem('format', '"jsonschema"', 'Schema format'),
                this.createCompletionItem('version', '"1-0-0"', 'Schema version in X-Y-Z format')
            );
        }
        
        return completions;
    }

    private getDataCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (context.isDataProduct) {
            return this.getDataProductCompletions(isYaml, isYamlValueCompletion, context);
        }
        
        // Data structure completions
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('$schema', 'http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#', 'JSON Schema draft version'),
                this.createYamlKeyCompletion('description', '', 'Schema description'),
                this.createYamlKeyCompletion('type', 'object', 'Schema type'),
                this.createYamlKeyCompletion('additionalProperties', 'false', 'Allow additional properties')
            );
            
            completions.push(
                this.createYamlBlockCompletion('self', '\n    vendor: ${1:com.example}\n    name: ${2:schema_name}\n    format: ${3:jsonschema}\n    version: ${4:1-0-0}', 'Self-describing schema information'),
                this.createYamlBlockCompletion('properties', '\n    ${1:property_name}:\n      type: ${2:string}\n      description: "${3:}"', 'Schema properties'),
                this.createYamlKeyCompletion('required', '[]', 'Required properties array')
            );
        }
        
        return completions;
    }

    private getPropertiesCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        return this.createPropertyCompletions(isYaml);
    }

    private getPropertyCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('type', 'string', 'Property data type'),
                this.createYamlKeyCompletion('description', '', 'Property description'),
                this.createYamlKeyCompletion('minLength', '1', 'Minimum string length'),
                this.createYamlKeyCompletion('maxLength', '100', 'Maximum string length'),
                this.createYamlKeyCompletion('pattern', '', 'Regular expression pattern'),
                this.createYamlKeyCompletion('enum', '[]', 'Allowed values'),
                this.createYamlKeyCompletion('minimum', '0', 'Minimum numeric value'),
                this.createYamlKeyCompletion('maximum', '100', 'Maximum numeric value')
            );
        } else if (isYaml && isYamlValueCompletion && context.currentLine.includes('type:')) {
            completions.push(
                this.createCompletionItem('string', 'string', 'String data type', true),
                this.createCompletionItem('number', 'number', 'Number data type', true),
                this.createCompletionItem('integer', 'integer', 'Integer data type', true),
                this.createCompletionItem('boolean', 'boolean', 'Boolean data type', true),
                this.createCompletionItem('array', 'array', 'Array data type', true),
                this.createCompletionItem('object', 'object', 'Object data type', true)
            );
        }
        
        return completions;
    }

    private getDataProductCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('name', '', 'Human readable name for the data product'),
                this.createYamlKeyCompletion('domain', '', 'Team or business area managing this data'),
                this.createYamlKeyCompletion('owner', '', 'Primary owner email address'),
                this.createYamlKeyCompletion('description', '', 'What this data product contains and why it exists')
            );
            
            completions.push(
                this.createYamlBlockCompletion('sourceApplications', '\n  - \\$ref: ${1:./source-apps/web.yaml}', 'References to source applications'),
                this.createYamlBlockCompletion('eventSpecifications', '\n  - resourceName: ${1:}\n    name: ${2:}\n    description: ${3:}\n    event:\n      source: ${4:iglu:vendor/name/format/version}', 'Event specifications for tracking')
            );
        }
        
        return completions;
    }

    private getEventSpecificationCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlKeyCompletion('resourceName', '', 'UUID for this event specification'),
                this.createYamlKeyCompletion('name', '', 'Human readable name for the event'),
                this.createYamlKeyCompletion('description', '', 'What this event represents')
            );
            
            completions.push(
                this.createYamlBlockCompletion('event', '\n    source: ${1:iglu:vendor/name/format/version}', 'Event definition'),
                this.createYamlBlockCompletion('entities', '\n    tracked:\n      - source: ${1:iglu:vendor/entity/format/version}', 'Entity definitions')
            );
        }
        
        return completions;
    }

    private getEntitiesCompletions(isYaml: boolean, isYamlValueCompletion: boolean, context: any): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        if (isYaml && !isYamlValueCompletion) {
            completions.push(
                this.createYamlBlockCompletion('tracked', '\n  - source: ${1:iglu:vendor/entity/format/version}\n    minCardinality: ${2:0}', 'Tracked entities'),
                this.createYamlKeyCompletion('enriched', '[]', 'Enriched entities')
            );
        }
        
        return completions;
    }

    private getGenericCompletions(isYaml: boolean, isYamlValueCompletion: boolean, textBeforeCursor: string): vscode.CompletionItem[] {
        const completions: vscode.CompletionItem[] = [];
        
        // Provide basic type completions if we detect type context
        if (textBeforeCursor.includes('type') && isYamlValueCompletion) {
            completions.push(
                this.createCompletionItem('string', 'string', 'String data type', true),
                this.createCompletionItem('number', 'number', 'Number data type', true),
                this.createCompletionItem('integer', 'integer', 'Integer data type', true),
                this.createCompletionItem('boolean', 'boolean', 'Boolean data type', true),
                this.createCompletionItem('array', 'array', 'Array data type', true),
                this.createCompletionItem('object', 'object', 'Object data type', true)
            );
        }
        
        return completions;
    }

    private createCompletionItem(label: string, insertText: string, documentation: string, isYaml: boolean = false): vscode.CompletionItem {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
        
        if (isYaml && !insertText.startsWith('\n')) {
            // For YAML simple values, use snippet that includes only the value (no key)
            item.insertText = new vscode.SnippetString(insertText);
            item.kind = vscode.CompletionItemKind.Value;
        } else {
            item.insertText = insertText;
        }
        
        item.documentation = new vscode.MarkdownString(documentation);
        return item;
    }

    private createYamlKeyCompletion(key: string, defaultValue: string, documentation: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Property);
        item.insertText = new vscode.SnippetString(`${key}: \${1:${defaultValue}}`);
        item.documentation = new vscode.MarkdownString(documentation);
        return item;
    }

    private createYamlBlockCompletion(key: string, block: string, documentation: string): vscode.CompletionItem {
        const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Snippet);
        item.insertText = new vscode.SnippetString(`${key}:${block}`);
        item.documentation = new vscode.MarkdownString(documentation);
        return item;
    }

    private createPropertyCompletions(isYaml: boolean = false): vscode.CompletionItem[] {
        if (isYaml) {
            const stringProperty = new vscode.CompletionItem('String Property', vscode.CompletionItemKind.Snippet);
            stringProperty.insertText = new vscode.SnippetString('${1:property_name}:\n  type: string\n  description: ${2:Property description}');
            stringProperty.documentation = 'Create a string property';

            const numberProperty = new vscode.CompletionItem('Number Property', vscode.CompletionItemKind.Snippet);
            numberProperty.insertText = new vscode.SnippetString('${1:property_name}:\n  type: number\n  description: ${2:Property description}\n  minimum: ${3:0}');
            numberProperty.documentation = 'Create a number property';

            const enumProperty = new vscode.CompletionItem('Enum Property', vscode.CompletionItemKind.Snippet);
            enumProperty.insertText = new vscode.SnippetString('${1:property_name}:\n  type: string\n  description: ${2:Property description}\n  enum: [${3:option1}, ${4:option2}]');
            enumProperty.documentation = 'Create an enum property';

            return [stringProperty, numberProperty, enumProperty];
        } else {
            const stringProperty = new vscode.CompletionItem('String Property', vscode.CompletionItemKind.Snippet);
            stringProperty.insertText = new vscode.SnippetString('"${1:property_name}": {\n  "type": "string",\n  "description": "${2:Property description}"\n}');
            stringProperty.documentation = 'Create a string property';

            const numberProperty = new vscode.CompletionItem('Number Property', vscode.CompletionItemKind.Snippet);
            numberProperty.insertText = new vscode.SnippetString('"${1:property_name}": {\n  "type": "number",\n  "description": "${2:Property description}",\n  "minimum": ${3:0}\n}');
            numberProperty.documentation = 'Create a number property';

            const enumProperty = new vscode.CompletionItem('Enum Property', vscode.CompletionItemKind.Snippet);
            enumProperty.insertText = new vscode.SnippetString('"${1:property_name}": {\n  "type": "string",\n  "description": "${2:Property description}",\n  "enum": ["${3:option1}", "${4:option2}"]\n}');
            enumProperty.documentation = 'Create an enum property';

            return [stringProperty, numberProperty, enumProperty];
        }
    }

    private provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.Hover | undefined {
        const range = document.getWordRangeAtPosition(position, /"[^"]*"/);
        if (!range) return undefined;

        const word = document.getText(range).replace(/"/g, '');
        const hoverInfo = this.getHoverInformation(word, document, position);
        
        if (hoverInfo) {
            return new vscode.Hover(new vscode.MarkdownString(hoverInfo), range);
        }
    }

    private getHoverInformation(word: string, document: vscode.TextDocument, position: vscode.Position): string | undefined {
        const hoverMap: { [key: string]: string } = {
            // Common properties
            'apiVersion': '**API Version**: The version of this resource format. Currently fixed at `v1`.',
            'resourceType': '**Resource Type**: The type of resource being described. Can be `data-structure`, `data-product`, or `source-application`.',
            'resourceName': '**Resource Name**: UUID identifier for data products and event specifications.',
            
            // Data Structure properties
            'hidden': '**Hidden**: If `true`, this data structure will be hidden in the BDP Console.',
            'schemaType': '**Schema Type**: Indicates whether this schema defines an `event` (action/behavior) or an `entity` (contextual information).',
            'vendor': '**Vendor**: The vendor or organization responsible for the schema, in reverse domain notation (e.g., `com.example`).',
            'name': '**Name**: The name of the schema, identifying the event or entity (e.g., `user_login`, `product_details`).',
            'version': '**Version**: The version of the schema in SchemaVer format (MODEL-REVISION-ADDITION, e.g., `1-0-0`).',
            'format': '**Format**: The format of the schema. For Snowplow JSON schemas, this is typically `jsonschema`.',
            '$schema': '**Schema**: The JSON Schema draft version used for validation.',
            'description': '**Description**: A human-readable description of what this schema represents.',
            'type': '**Type**: The JSON Schema type constraint for this property.',
            'properties': '**Properties**: Defines the structure of the object properties.',
            'required': '**Required**: Array of property names that are required.',
            'additionalProperties': '**Additional Properties**: Whether to allow properties not defined in this schema.',
            'meta': '**Meta**: Metadata section containing configuration for the data structure.',
            'data': '**Data**: The main content section - contains schema definition for data structures or product configuration for data products',
            'self': '**Self**: Self-describing information including vendor, name, format, and version.',
            
            // Data Product properties
            'domain': '**Domain**: The business domain or team responsible for this data product (e.g., "Marketing", "Product Analytics").',
            'owner': '**Owner**: Email address of the primary owner responsible for this data product.',
            'sourceApplications': '**Source Applications**: Array of references to source applications that generate data for this product.',
            'eventSpecifications': '**Event Specifications**: Array of event definitions that describe what events are tracked as part of this data product.',
            'id': '**ID**: Unique identifier for the resource.',
            'uuid': '**UUID**: Universally unique identifier in UUID format.',
            'email': '**Email**: Email address for contact information.',
            'organization': '**Organization**: The organization or company name.',
            
            // Event Specification properties
            'event': '**Event**: Definition of the event including source schema and optional inline schema definition.',
            'source': '**Source**: Iglu URI pointing to the schema definition (e.g., `iglu:com.example/event_name/jsonschema/1-0-0`).',
            'schema': '**Schema**: Inline JSON Schema definition for the event structure.',
            'entities': '**Entities**: Context entities associated with this event, split into tracked and enriched.',
            'tracked': '**Tracked**: Entities that are tracked/sent with the event from the application.',
            'enriched': '**Enriched**: Entities that are added during enrichment processing.',
            'minCardinality': '**Min Cardinality**: Minimum number of entities of this type (0 = optional, 1+ = required).',
            'maxCardinality': '**Max Cardinality**: Maximum number of entities of this type.',
            '$ref': '**Reference**: JSON Pointer reference to another file or section.',
            
            // JSON Schema properties
            'string': '**String Type**: Text data type.',
            'number': '**Number Type**: Numeric data type (integers and decimals).',
            'integer': '**Integer Type**: Whole number data type.',
            'boolean': '**Boolean Type**: True/false data type.',
            'array': '**Array Type**: List/array data type.',
            'object': '**Object Type**: Complex object data type.',
            'null': '**Null Type**: Null value data type.',
            'enum': '**Enum**: Restricts value to one of a predefined set of options.',
            'const': '**Const**: Restricts value to a single constant.',
            'minimum': '**Minimum**: Minimum numeric value constraint.',
            'maximum': '**Maximum**: Maximum numeric value constraint.',
            'minLength': '**Min Length**: Minimum string length constraint.',
            'maxLength': '**Max Length**: Maximum string length constraint.',
            'pattern': '**Pattern**: Regular expression pattern constraint for strings.',
            'items': '**Items**: Schema definition for array items.',
            'anyOf': '**Any Of**: Value must match at least one of the provided schemas.',
            'oneOf': '**One Of**: Value must match exactly one of the provided schemas.',
            'allOf': '**All Of**: Value must match all of the provided schemas.'
        };

        return hoverMap[word];
    }

    private provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // Check for common issues and provide fixes
        for (const diagnostic of context.diagnostics) {
            if (diagnostic.message.includes('Missing apiVersion')) {
                const action = new vscode.CodeAction('Add apiVersion', vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                action.edit.insert(document.uri, new vscode.Position(1, 0), '  "apiVersion": "v1",\n');
                actions.push(action);
            }

            if (diagnostic.message.includes('Missing resourceType')) {
                const action = new vscode.CodeAction('Add resourceType', vscode.CodeActionKind.QuickFix);
                action.edit = new vscode.WorkspaceEdit();
                action.edit.insert(document.uri, new vscode.Position(1, 0), '  "resourceType": "data-structure",\n');
                actions.push(action);
            }

            if (diagnostic.message.includes('Invalid vendor format')) {
                const action = new vscode.CodeAction('Fix vendor format', vscode.CodeActionKind.QuickFix);
                action.command = {
                    command: 'snowplow.fixVendorFormat',
                    title: 'Fix vendor format',
                    arguments: [document.uri, range]
                };
                actions.push(action);
            }
        }

        return actions;
    }

    private debouncedValidateDocument(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        
        // Clear existing timeout
        if (this.validationTimeouts.has(uri)) {
            clearTimeout(this.validationTimeouts.get(uri)!);
        }

        // Set new timeout
        const timeout = setTimeout(() => {
            this.validateDocument(document);
            this.validationTimeouts.delete(uri);
        }, this.VALIDATION_DELAY);

        this.validationTimeouts.set(uri, timeout);
    }

    private validateDocument(document: vscode.TextDocument): void {
        const diagnostics: vscode.Diagnostic[] = [];
        const schema = this.parseDocument(document);

        if (!schema) {
            const parseError = new vscode.Diagnostic(
                new vscode.Range(0, 0, 0, 0),
                'Invalid JSON/YAML syntax',
                vscode.DiagnosticSeverity.Error
            );
            diagnostics.push(parseError);
        } else {
            // Validate Snowplow schema structure
            this.validateSnowplowSchema(schema, diagnostics, document);
        }

        this.diagnosticCollection.set(document.uri, diagnostics);
    }

    private validateSnowplowSchema(schema: SnowplowSchema, diagnostics: vscode.Diagnostic[], document: vscode.TextDocument): void {
        // Required root fields
        if (!schema.apiVersion) {
            diagnostics.push(this.createDiagnostic('Missing required field: apiVersion', 0, 0, vscode.DiagnosticSeverity.Error));
        } else if (schema.apiVersion !== 'v1') {
            diagnostics.push(this.createDiagnostic('apiVersion must be "v1"', 0, 0, vscode.DiagnosticSeverity.Error));
        }

        if (!schema.resourceType) {
            diagnostics.push(this.createDiagnostic('Missing required field: resourceType', 0, 0, vscode.DiagnosticSeverity.Error));
        } else if (!['data-structure', 'data-product', 'source-application'].includes(schema.resourceType)) {
            diagnostics.push(this.createDiagnostic('resourceType must be "data-structure", "data-product", or "source-application"', 0, 0, vscode.DiagnosticSeverity.Error));
        }

        // Validate based on resource type
        if (schema.resourceType === 'data-structure') {
            this.validateDataStructure(schema, diagnostics);
        } else if (schema.resourceType === 'data-product') {
            this.validateDataProduct(schema, diagnostics);
        } else if (schema.resourceType === 'source-application') {
            this.validateSourceApplication(schema, diagnostics);
        }
    }

    private validateDataStructure(schema: SnowplowSchema, diagnostics: vscode.Diagnostic[]): void {
        // Validate meta section
        if (!schema.meta) {
            diagnostics.push(this.createDiagnostic('Missing required field: meta', 0, 0, vscode.DiagnosticSeverity.Error));
        } else {
            if (schema.meta.schemaType && !['event', 'entity'].includes(schema.meta.schemaType)) {
                diagnostics.push(this.createDiagnostic('schemaType must be either "event" or "entity"', 0, 0, vscode.DiagnosticSeverity.Error));
            }
        }

        // Validate data section
        if (!schema.data) {
            diagnostics.push(this.createDiagnostic('Missing required field: data', 0, 0, vscode.DiagnosticSeverity.Error));
        } else {
            if (!schema.data.$schema) {
                diagnostics.push(this.createDiagnostic('Missing required field: data.$schema', 0, 0, vscode.DiagnosticSeverity.Error));
            }

            if (!schema.data.self) {
                diagnostics.push(this.createDiagnostic('Missing required field: data.self', 0, 0, vscode.DiagnosticSeverity.Error));
            } else {
                this.validateSelfSection(schema.data.self, diagnostics);
            }
        }
    }

    private validateDataProduct(schema: SnowplowSchema, diagnostics: vscode.Diagnostic[]): void {
        // Validate resourceName for data products
        if (!schema.resourceName) {
            diagnostics.push(this.createDiagnostic('Missing required field: resourceName (UUID)', 0, 0, vscode.DiagnosticSeverity.Error));
        } else {
            // Basic UUID format validation
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(schema.resourceName)) {
                diagnostics.push(this.createDiagnostic('resourceName must be a valid UUID v4 format', 0, 0, vscode.DiagnosticSeverity.Error));
            }
        }

        // Validate data section
        if (!schema.data) {
            diagnostics.push(this.createDiagnostic('Missing required field: data', 0, 0, vscode.DiagnosticSeverity.Error));
        } else {
            if (!schema.data.name) {
                diagnostics.push(this.createDiagnostic('Missing required field: data.name', 0, 0, vscode.DiagnosticSeverity.Error));
            }

            if (schema.data.owner) {
                // Basic email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(schema.data.owner)) {
                    diagnostics.push(this.createDiagnostic('data.owner must be a valid email address', 0, 0, vscode.DiagnosticSeverity.Warning));
                }
            }

            if (schema.data.eventSpecifications) {
                this.validateEventSpecifications(schema.data.eventSpecifications, diagnostics);
            }
        }
    }

    private validateSourceApplication(schema: SnowplowSchema, diagnostics: vscode.Diagnostic[]): void {
        // Validate data section
        if (!schema.data) {
            diagnostics.push(this.createDiagnostic('Missing required field: data', 0, 0, vscode.DiagnosticSeverity.Error));
        } else {
            if (!schema.data.name) {
                diagnostics.push(this.createDiagnostic('Missing required field: data.name', 0, 0, vscode.DiagnosticSeverity.Error));
            }

            if (!schema.data.owner) {
                diagnostics.push(this.createDiagnostic('Missing required field: data.owner', 0, 0, vscode.DiagnosticSeverity.Warning));
            } else {
                // Basic email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(schema.data.owner)) {
                    diagnostics.push(this.createDiagnostic('data.owner must be a valid email address', 0, 0, vscode.DiagnosticSeverity.Warning));
                }
            }
        }
    }

    private validateSelfSection(self: any, diagnostics: vscode.Diagnostic[]): void {
        if (!self.vendor) {
            diagnostics.push(this.createDiagnostic('Missing required field: data.self.vendor', 0, 0, vscode.DiagnosticSeverity.Error));
        } else if (!/^[a-zA-Z0-9-_.]+$/.test(self.vendor)) {
            diagnostics.push(this.createDiagnostic('Invalid vendor format. Use reverse domain notation (e.g., com.example)', 0, 0, vscode.DiagnosticSeverity.Error));
        }

        if (!self.name) {
            diagnostics.push(this.createDiagnostic('Missing required field: data.self.name', 0, 0, vscode.DiagnosticSeverity.Error));
        } else if (!/^[a-zA-Z0-9-_]+$/.test(self.name)) {
            diagnostics.push(this.createDiagnostic('Invalid name format. Use lowercase letters, numbers, hyphens, and underscores', 0, 0, vscode.DiagnosticSeverity.Error));
        }

        if (!self.version) {
            diagnostics.push(this.createDiagnostic('Missing required field: data.self.version', 0, 0, vscode.DiagnosticSeverity.Error));
        } else if (!/^[1-9][0-9]*-[0-9]+-[0-9]+$/.test(self.version)) {
            diagnostics.push(this.createDiagnostic('Invalid version format. Use SchemaVer format (e.g., 1-0-0)', 0, 0, vscode.DiagnosticSeverity.Error));
        }
    }

    private validateEventSpecifications(eventSpecs: any[], diagnostics: vscode.Diagnostic[]): void {
        eventSpecs.forEach((spec, index) => {
            if (!spec.resourceName) {
                diagnostics.push(this.createDiagnostic(`Missing resourceName in event specification ${index + 1}`, 0, 0, vscode.DiagnosticSeverity.Error));
            } else {
                const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
                if (!uuidRegex.test(spec.resourceName)) {
                    diagnostics.push(this.createDiagnostic(`Invalid UUID format in event specification ${index + 1}`, 0, 0, vscode.DiagnosticSeverity.Error));
                }
            }

            if (!spec.name) {
                diagnostics.push(this.createDiagnostic(`Missing name in event specification ${index + 1}`, 0, 0, vscode.DiagnosticSeverity.Error));
            }

            if (spec.event && spec.event.source) {
                // Validate Iglu URI format
                const igluUriRegex = /^iglu:[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_]+\/[a-zA-Z0-9-_]+\/[0-9]+-[0-9]+-[0-9]+$/;
                if (!igluUriRegex.test(spec.event.source)) {
                    diagnostics.push(this.createDiagnostic(`Invalid Iglu URI format in event specification ${index + 1}`, 0, 0, vscode.DiagnosticSeverity.Error));
                }
            }
        });
    }

    private createDiagnostic(message: string, line: number, character: number, severity: vscode.DiagnosticSeverity): vscode.Diagnostic {
        return new vscode.Diagnostic(
            new vscode.Range(line, character, line, character + 1),
            message,
            severity
        );
    }

    // Helper methods to determine context
    private isInRootLevel(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        
        if (isYaml) {
            // For YAML, check indentation level
            const line = document.lineAt(position);
            const indentation = line.text.search(/\S/);
            return indentation === 0 || (indentation === -1 && position.line < document.lineCount - 1);
        } else {
            // For JSON, count braces
            const text = document.getText(new vscode.Range(0, 0, position.line, position.character));
            const openBraces = (text.match(/{/g) || []).length;
            const closeBraces = (text.match(/}/g) || []).length;
            return openBraces - closeBraces === 1;
        }
    }

    private isInMetaSection(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        
        if (isYaml) {
            return this.isInYamlSection(document, position, 'meta');
        } else {
            const lineText = document.lineAt(position).text;
            const textAbove = document.getText(new vscode.Range(0, 0, position.line, 0));
            return textAbove.includes('"meta"') && !lineText.includes('}');
        }
    }

    private isInSelfSection(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        
        if (isYaml) {
            return this.isInYamlSection(document, position, 'self');
        } else {
            const lineText = document.lineAt(position).text;
            const textAbove = document.getText(new vscode.Range(0, 0, position.line, 0));
            return textAbove.includes('"self"') && !lineText.includes('}');
        }
    }

    private isInPropertiesSection(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        
        if (isYaml) {
            return this.isInYamlSection(document, position, 'properties');
        } else {
            const lineText = document.lineAt(position).text;
            const textAbove = document.getText(new vscode.Range(0, 0, position.line, 0));
            return textAbove.includes('"properties"') && !lineText.includes('}');
        }
    }

    private isInPropertyDefinition(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        
        if (isYaml) {
            // For YAML, check if we're inside a property definition by looking at indentation and context
            const textAbove = document.getText(new vscode.Range(0, 0, position.line + 1, 0));
            const lines = textAbove.split('\n');
            
            // Look for property patterns in YAML
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                const indentation = line.search(/\S/);
                
                if (indentation >= 0) {
                    // Check if this line defines a property (has a colon and is indented under properties)
                    if (line.includes(':') && !line.trim().startsWith('#')) {
                        const propertyMatch = line.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
                        if (propertyMatch && this.isUnderYamlSection(lines, i, 'properties')) {
                            return true;
                        }
                    }
                }
            }
            return false;
        } else {
            const textAbove = document.getText(new vscode.Range(0, 0, position.line, 0));
            const lastPropertyMatch = textAbove.match(/.*"([^"]+)":\s*{[^}]*$/);
            return !!lastPropertyMatch;
        }
    }

    private isInDataProductSection(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        const textAbove = document.getText(new vscode.Range(0, 0, position.line, 0));
        
        // Check if we're in a data product file
        const isDataProduct = textAbove.includes('"resourceType": "data-product"') || 
                              textAbove.includes('resourceType: data-product');
        
        if (!isDataProduct) {
            return false;
        }
        
        if (isYaml) {
            // For YAML data products, check if we're in the data section
            return this.isInYamlSection(document, position, 'data') || 
                   this.isInRootLevel(document, position);
        } else {
            // For JSON data products
            return textAbove.includes('"data"') || 
                   textAbove.includes('"eventSpecifications"') ||
                   textAbove.includes('"sourceApplications"');
        }
    }

    private isInEventSpecificationSection(document: vscode.TextDocument, position: vscode.Position): boolean {
        const isYaml = this.isYamlDocument(document);
        
        if (isYaml) {
            return this.isInYamlSection(document, position, 'eventSpecifications');
        } else {
            const textAbove = document.getText(new vscode.Range(0, 0, position.line, 0));
            return textAbove.includes('"eventSpecifications"') && !textAbove.includes('}');
        }
    }

    private isYamlDocument(document: vscode.TextDocument): boolean {
        return document.languageId === 'yaml' || 
               document.languageId === 'yml' || 
               document.uri.fsPath.endsWith('.yaml') || 
               document.uri.fsPath.endsWith('.yml');
    }

    private isInYamlSection(document: vscode.TextDocument, position: vscode.Position, sectionName: string): boolean {
        const textAbove = document.getText(new vscode.Range(0, 0, position.line + 1, 0));
        const lines = textAbove.split('\n');
        
        return this.isUnderYamlSection(lines, position.line, sectionName);
    }

    private isUnderYamlSection(lines: string[], currentLineIndex: number, sectionName: string): boolean {
        let sectionIndentation = -1;
        
        // Look backwards to find the section
        for (let i = currentLineIndex; i >= 0; i--) {
            const line = lines[i];
            const trimmed = line.trim();
            
            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }
            
            const indentation = line.search(/\S/);
            
            // If we found the section header
            if (line.includes(`${sectionName}:`) && !trimmed.startsWith('#')) {
                sectionIndentation = indentation;
                break;
            }
            
            // If we're at a less indented level and haven't found our section, we're not in it
            if (sectionIndentation >= 0 && indentation <= sectionIndentation) {
                return false;
            }
        }
        
        if (sectionIndentation === -1) {
            return false;
        }
        
        // Check if the current position is properly indented under the section
        const currentLine = lines[currentLineIndex];
        if (currentLine.trim() === '') {
            return true; // Empty line, could be in section
        }
        
        const currentIndentation = currentLine.search(/\S/);
        return currentIndentation > sectionIndentation;
    }

    dispose(): void {
        // Clear all validation timeouts
        this.validationTimeouts.forEach(timeout => clearTimeout(timeout));
        this.validationTimeouts.clear();
        
        // Clear schema cache
        this.schemaCache.clear();
        
        this.diagnosticCollection.dispose();
    }
}
