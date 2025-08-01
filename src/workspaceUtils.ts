import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
