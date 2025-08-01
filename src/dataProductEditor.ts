import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
                    const previewData = generateDataProductYaml(message.data);
                    panel.webview.postMessage({
                        command: 'showPreview',
                        data: previewData,
                        format: 'yaml'
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
                case 'getDataStructures':
                    // Get available data structures for selection
                    const structures = await getAvailableDataStructures(context);
                    panel.webview.postMessage({
                        command: 'dataStructures',
                        data: structures
                    });
                    break;
                case 'createDataStructure':
                    // Create a new data structure and return its reference
                    const newStructure = await createNewDataStructure(context, message.data);
                    if (newStructure) {
                        panel.webview.postMessage({
                            command: 'dataStructureCreated',
                            data: newStructure
                        });
                    }
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
    if (!data.name || data.name.trim() === '') {
        errors.push('Product name is required');
    }

    if (data.owner && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.owner)) {
        warnings.push('Owner should be a valid email address');
    }

    // Event specifications validation
    if (!data.eventSpecs || data.eventSpecs.length === 0) {
        errors.push('At least one event specification is required');
    } else {
        data.eventSpecs.forEach((spec: any, index: number) => {
            if (!spec.name || spec.name.trim() === '') {
                errors.push(`Event specification ${index + 1}: Name is required`);
            }
            if (!spec.eventSource || spec.eventSource.trim() === '') {
                errors.push(`Event specification ${index + 1}: Event data structure is required`);
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
    const resourceName = existingData?.resourceName || generateUUID();
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
    const initialDataProduct = generateDataProductYaml({
        name: name || 'Example Data Product',
        domain: domain || 'Analytics',
        owner: owner || 'owner@example.com',
        description: description || 'Description of the data product',
        resourceName,
        sourceApps: [],
        eventSpecs: []
    });

    // Determine default vendor from workspace or existing data
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let defaultVendor = 'com.example';
    if (workspaceFolders) {
        const workspaceName = path.basename(workspaceFolders[0].uri.fsPath);
        if (workspaceName.includes('.')) {
            defaultVendor = workspaceName.toLowerCase();
        } else {
            defaultVendor = `com.${workspaceName.toLowerCase()}`;
        }
    }

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
        .replace(/{{EVENT_SPECS_EMPTY_STYLE}}/g, eventSpecs.length > 0 ? 'display: none;' : '')
        .replace(/{{SOURCE_APP_COUNTER}}/g, sourceApps.length.toString())
        .replace(/{{EVENT_SPEC_COUNTER}}/g, eventSpecs.length.toString())
        .replace(/{{ENTITY_COUNTER}}/g, '0')
        .replace(/{{DEFAULT_VENDOR}}/g, defaultVendor)
        .replace(/{{SOURCE_APP_TEMPLATE}}/g, `"${escapedSourceAppTemplate}"`)
        .replace(/{{EVENT_SPEC_TEMPLATE}}/g, `"${escapedEventSpecTemplate}"`)
        .replace(/{{ENTITY_TEMPLATE}}/g, `"${escapedEntityTemplate}"`)
        .replace(/{{INITIAL_DATAPRODUCT}}/g, initialDataProduct.replace(/"/g, '&quot;'));

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
        .replace(/EVENTSPEC_RESOURCE_NAME/g, spec.resourceName || generateUUID())
        .replace(/EVENTSPEC_NAME/g, spec.name || '')
        .replace(/EVENTSPEC_DESCRIPTION/g, (spec.description || '').replace(/"/g, '&quot;'))
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
        .replace(/ENTITY_CARDINALITY_STYLE/g, entityType === 'enriched' ? 'style="display: none;"' : '');
    
    return template;
}

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateDataProductYaml(data: any): string {
    // Generate UUIDs if not present
    if (!data.resourceName) {
        data.resourceName = generateUUID();
    }
    
    // Generate UUIDs for event specs
    if (data.eventSpecs && Array.isArray(data.eventSpecs)) {
        data.eventSpecs.forEach((spec: any) => {
            if (!spec.resourceName) {
                spec.resourceName = generateUUID();
            }
        });
    }
    
    const dataProduct = {
        apiVersion: 'v1',
        resourceType: 'data-product',
        resourceName: data.resourceName,
        data: {
            name: data.name || 'Untitled Data Product',
            domain: data.domain || '',
            owner: data.owner || '',
            description: data.description || '',
            sourceApplications: data.sourceApps || [],
            eventSpecifications: (data.eventSpecs || []).map((spec: any) => ({
                resourceName: spec.resourceName,
                name: spec.name || 'Untitled Event',
                description: spec.description || '',
                event: {
                    source: spec.eventSource || ''
                },
                entities: {
                    tracked: spec.trackedEntities || [],
                    enriched: spec.enrichedEntities || []
                }
            }))
        }
    };
    
    const yaml = require('js-yaml');
    return yaml.dump(dataProduct, { 
        indent: 2, 
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
    });
}

async function getAvailableDataStructures(context: vscode.ExtensionContext): Promise<any[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return [];
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const dataStructuresDir = path.join(workspaceRoot, 'data-structures');
    
    if (!fs.existsSync(dataStructuresDir)) {
        return [];
    }

    const structures: any[] = [];
    
    function scanDirectory(dir: string, vendor?: string) {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isDirectory()) {
                // This is a vendor directory
                scanDirectory(itemPath, item);
            } else if (item.endsWith('.json') || item.endsWith('.yaml') || item.endsWith('.yml')) {
                try {
                    const content = fs.readFileSync(itemPath, 'utf8');
                    let schema;
                    
                    if (item.endsWith('.json')) {
                        schema = JSON.parse(content);
                    } else {
                        const yaml = require('js-yaml');
                        schema = yaml.load(content);
                    }
                    
                    // Extract schema information
                    const schemaData = schema.data || schema;
                    if (schemaData.self) {
                        const igluUri = `iglu:${schemaData.self.vendor}/${schemaData.self.name}/jsonschema/${schemaData.self.version}`;
                        structures.push({
                            name: schemaData.self.name,
                            vendor: schemaData.self.vendor,
                            version: schemaData.self.version,
                            description: schemaData.description || '',
                            type: schemaData.type === 'object' ? 'event' : 'entity',
                            igluUri,
                            filePath: itemPath
                        });
                    }
                } catch (error) {
                    // Skip invalid files
                    console.warn(`Failed to parse ${itemPath}:`, error);
                }
            }
        }
    }
    
    scanDirectory(dataStructuresDir);
    return structures;
}

async function createNewDataStructure(context: vscode.ExtensionContext, structureData: any): Promise<any> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage('Please open a folder first to create a data structure.');
        return null;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const dataStructuresDir = path.join(workspaceRoot, 'data-structures');
    const vendorDir = path.join(dataStructuresDir, structureData.vendor);

    // Create directories if they don't exist
    if (!fs.existsSync(vendorDir)) {
        fs.mkdirSync(vendorDir, { recursive: true });
    }

    // Build properties object
    const properties = structureData.properties || {};
    const required = structureData.required || [];

    // Generate basic schema structure
    const schema = {
        apiVersion: 'v1',
        resourceType: 'data-structure',
        meta: {
            hidden: false,
            schemaType: structureData.type || 'event',
            customData: {}
        },
        data: {
            "$schema": "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#",
            "description": structureData.description || `Schema for ${structureData.name}`,
            "self": {
                "vendor": structureData.vendor,
                "name": structureData.name,
                "format": "jsonschema",
                "version": "1-0-0"
            },
            "type": "object",
            "properties": properties,
            "required": required,
            "additionalProperties": true
        }
    };

    const fileName = `${structureData.name}.json`;
    const filePath = path.join(vendorDir, fileName);
    
    try {
        fs.writeFileSync(filePath, JSON.stringify(schema, null, 2));
        
        // Refresh the explorer
        vscode.commands.executeCommand('snowplow.refresh');
        
        const igluUri = `iglu:${structureData.vendor}/${structureData.name}/jsonschema/1-0-0`;
        return {
            name: structureData.name,
            vendor: structureData.vendor,
            version: '1-0-0',
            description: structureData.description || '',
            type: structureData.type || 'event',
            igluUri,
            filePath
        };
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to create data structure: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}
