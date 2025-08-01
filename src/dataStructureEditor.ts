import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
                    try {
                        console.log('Generating preview for data:', message.data);
                        const previewData = generateDataStructureJson(message.data);
                        console.log('Generated preview data:', previewData);
                        
                        panel.webview.postMessage({
                            command: 'showPreview',
                            data: previewData,
                            format: message.format || 'json'
                        });
                        console.log('Sent showPreview message to webview');
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                        console.error('Error generating preview:', error);
                        panel.webview.postMessage({
                            command: 'showPreview',
                            data: { error: `Failed to generate preview: ${errorMessage}` },
                            format: message.format || 'json'
                        });
                    }
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
        .replace(/PROP_DESCRIPTION/g, (prop.description || '').replace(/"/g, '&quot;'))
        .replace(/PROP_REQUIRED/g, prop.required ? 'checked' : '')
        .replace(/PROP_NULLABLE/g, prop.nullable ? 'checked' : '')
        .replace(/SELECTED_STRING/g, prop.type === 'string' ? 'selected' : '')
        .replace(/SELECTED_NUMBER/g, prop.type === 'number' ? 'selected' : '')
        .replace(/SELECTED_INTEGER/g, prop.type === 'integer' ? 'selected' : '')
        .replace(/SELECTED_BOOLEAN/g, prop.type === 'boolean' ? 'selected' : '')
        .replace(/SELECTED_ARRAY/g, prop.type === 'array' ? 'selected' : '')
        .replace(/SELECTED_OBJECT/g, prop.type === 'object' ? 'selected' : '');
    
    // String constraint values
    template = template
        .replace(/PROP_MIN_LENGTH/g, prop.minLength !== undefined ? prop.minLength.toString() : '')
        .replace(/PROP_MAX_LENGTH/g, prop.maxLength !== undefined ? prop.maxLength.toString() : '')
        .replace(/PROP_PATTERN/g, (prop.pattern || '').replace(/"/g, '&quot;'))
        .replace(/PROP_ENUM_VALUES/g, prop.enumValues ? (Array.isArray(prop.enumValues) ? prop.enumValues.join(', ') : prop.enumValues) : '');
    
    // Format selections
    template = template
        .replace(/SELECTED_FORMAT_EMAIL/g, prop.format === 'email' ? 'selected' : '')
        .replace(/SELECTED_FORMAT_URI/g, prop.format === 'uri' ? 'selected' : '')
        .replace(/SELECTED_FORMAT_DATE/g, prop.format === 'date' ? 'selected' : '')
        .replace(/SELECTED_FORMAT_TIME/g, prop.format === 'time' ? 'selected' : '')
        .replace(/SELECTED_FORMAT_DATETIME/g, prop.format === 'date-time' ? 'selected' : '')
        .replace(/SELECTED_FORMAT_UUID/g, prop.format === 'uuid' ? 'selected' : '');
    
    // Number constraint values
    template = template
        .replace(/PROP_MINIMUM/g, prop.minimum !== undefined ? prop.minimum.toString() : '')
        .replace(/PROP_MAXIMUM/g, prop.maximum !== undefined ? prop.maximum.toString() : '')
        .replace(/PROP_MULTIPLE_OF/g, prop.multipleOf !== undefined ? prop.multipleOf.toString() : '');
    
    // Array constraint values
    template = template
        .replace(/PROP_MIN_ITEMS/g, prop.minItems !== undefined ? prop.minItems.toString() : '')
        .replace(/PROP_MAX_ITEMS/g, prop.maxItems !== undefined ? prop.maxItems.toString() : '')
        .replace(/SELECTED_ITEM_STRING/g, prop.itemType === 'string' ? 'selected' : '')
        .replace(/SELECTED_ITEM_NUMBER/g, prop.itemType === 'number' ? 'selected' : '')
        .replace(/SELECTED_ITEM_INTEGER/g, prop.itemType === 'integer' ? 'selected' : '')
        .replace(/SELECTED_ITEM_BOOLEAN/g, prop.itemType === 'boolean' ? 'selected' : '')
        .replace(/SELECTED_ITEM_OBJECT/g, prop.itemType === 'object' ? 'selected' : '');
    
    return template;
}
