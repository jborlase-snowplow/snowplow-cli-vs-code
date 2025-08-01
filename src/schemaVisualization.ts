import * as vscode from 'vscode';
import * as yaml from 'js-yaml';

interface SchemaNode {
    name: string;
    type: string;
    description?: string;
    required: boolean;
    children: SchemaNode[];
    constraints?: string[];
    path: string;
}

export class SchemaVisualizationProvider implements vscode.TreeDataProvider<SchemaNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<SchemaNode | undefined | null | void> = new vscode.EventEmitter<SchemaNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SchemaNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private currentSchema: any = null;
    private rootNodes: SchemaNode[] = [];

    constructor() {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SchemaNode): vscode.TreeItem {
        const item = new vscode.TreeItem(element.name, element.children.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        
        // Create rich tooltip with schema information
        const tooltip = new vscode.MarkdownString();
        tooltip.appendMarkdown(`**${element.name}** (${element.type})\n\n`);
        
        if (element.description) {
            tooltip.appendMarkdown(`*${element.description}*\n\n`);
        }
        
        tooltip.appendMarkdown(`**Required:** ${element.required ? '✅ Yes' : '❌ No'}\n\n`);
        
        if (element.constraints && element.constraints.length > 0) {
            tooltip.appendMarkdown(`**Constraints:**\n${element.constraints.map(c => `- ${c}`).join('\n')}\n\n`);
        }
        
        if (element.path) {
            tooltip.appendMarkdown(`**Path:** \`${element.path}\``);
        }
        
        item.tooltip = tooltip;
        
        // Enhanced description with icons
        let description = element.type;
        if (element.required) {
            description += ' ⭐';
        }
        if (element.constraints && element.constraints.length > 0) {
            description += ' 🔒';
        }
        
        item.description = description;
        
        // Set context value for commands
        item.contextValue = element.children.length > 0 ? 'schemaObject' : 'schemaProperty';
        
        // Set icons based on type
        item.iconPath = this.getIconForType(element.type, element.required);
        
        return item;
    }

    getChildren(element?: SchemaNode): Thenable<SchemaNode[]> {
        if (!element) {
            return Promise.resolve(this.rootNodes);
        }
        return Promise.resolve(element.children);
    }

    private getIconForType(type: string, required: boolean): vscode.ThemeIcon {
        const iconName = (() => {
            switch (type.toLowerCase()) {
                case 'string': return 'symbol-string';
                case 'number':
                case 'integer': return 'symbol-numeric';
                case 'boolean': return 'symbol-boolean';
                case 'array': return 'symbol-array';
                case 'object': return 'symbol-object';
                case 'enum': return 'symbol-enum';
                default: return 'symbol-property';
            }
        })();
        
        return new vscode.ThemeIcon(iconName, required ? new vscode.ThemeColor('symbolIcon.colorForeground') : new vscode.ThemeColor('symbolIcon.snippetForeground'));
    }

    updateSchema(document: vscode.TextDocument) {
        try {
            const text = document.getText();
            let schema: any;
            
            if (document.languageId === 'json' || document.uri.fsPath.endsWith('.json')) {
                schema = JSON.parse(text);
            } else {
                schema = yaml.load(text) as any;
            }
            
            this.currentSchema = schema;
            this.rootNodes = this.parseSchema(schema);
            this.refresh();
        } catch (error) {
            console.error('Failed to parse schema for visualization:', error);
            this.rootNodes = [];
            this.refresh();
        }
    }

    private parseSchema(schema: any): SchemaNode[] {
        const nodes: SchemaNode[] = [];
        
        if (!schema) return nodes;
        
        // Handle Snowplow data structure format
        if (schema.resourceType === 'data-structure' && schema.data) {
            nodes.push(this.createNode('Schema Info', 'info', '', false, [], this.createSchemaInfoChildren(schema)));
            
            if (schema.data.properties) {
                const propertiesNode = this.createNode('Properties', 'object', 'Schema properties', false, [], []);
                propertiesNode.children = this.parseProperties(schema.data.properties, schema.data.required || [], 'properties');
                nodes.push(propertiesNode);
            }
        }
        // Handle Snowplow data product format
        else if (schema.resourceType === 'data-product' && schema.data) {
            nodes.push(this.createNode('Product Info', 'info', '', false, [], this.createDataProductInfoChildren(schema)));
            
            if (schema.data.eventSpecs) {
                const eventSpecsNode = this.createNode('Event Specifications', 'array', 'Event specifications for this data product', false, [], []);
                eventSpecsNode.children = this.parseEventSpecs(schema.data.eventSpecs);
                nodes.push(eventSpecsNode);
            }
        }
        // Handle raw JSON Schema
        else if (schema.type === 'object' && schema.properties) {
            nodes.push(...this.parseProperties(schema.properties, schema.required || [], ''));
        }
        
        return nodes;
    }

    private createNode(name: string, type: string, description: string, required: boolean, constraints: string[], children: SchemaNode[] = [], path: string = ''): SchemaNode {
        return {
            name,
            type,
            description,
            required,
            constraints,
            children,
            path
        };
    }

    private createSchemaInfoChildren(schema: any): SchemaNode[] {
        const children: SchemaNode[] = [];
        
        if (schema.apiVersion) {
            children.push(this.createNode('API Version', 'string', schema.apiVersion, true, [], [], 'apiVersion'));
        }
        
        if (schema.resourceType) {
            children.push(this.createNode('Resource Type', 'string', schema.resourceType, true, [], [], 'resourceType'));
        }
        
        if (schema.meta) {
            const metaChildren: SchemaNode[] = [];
            if (schema.meta.schemaType) {
                metaChildren.push(this.createNode('Schema Type', 'enum', schema.meta.schemaType, false, ['event', 'entity'], [], 'meta.schemaType'));
            }
            if (typeof schema.meta.hidden !== 'undefined') {
                metaChildren.push(this.createNode('Hidden', 'boolean', schema.meta.hidden.toString(), false, [], [], 'meta.hidden'));
            }
            
            if (metaChildren.length > 0) {
                children.push(this.createNode('Metadata', 'object', 'Schema metadata', false, [], metaChildren, 'meta'));
            }
        }
        
        if (schema.data && schema.data.self) {
            const selfChildren: SchemaNode[] = [];
            const self = schema.data.self;
            
            if (self.vendor) {
                selfChildren.push(this.createNode('Vendor', 'string', self.vendor, true, ['Reverse domain notation'], [], 'data.self.vendor'));
            }
            if (self.name) {
                selfChildren.push(this.createNode('Name', 'string', self.name, true, ['Lowercase, underscores'], [], 'data.self.name'));
            }
            if (self.version) {
                selfChildren.push(this.createNode('Version', 'string', self.version, true, ['SchemaVer format (X-Y-Z)'], [], 'data.self.version'));
            }
            if (self.format) {
                selfChildren.push(this.createNode('Format', 'string', self.format, true, [], [], 'data.self.format'));
            }
            
            if (selfChildren.length > 0) {
                children.push(this.createNode('Self', 'object', 'Schema identification', true, [], selfChildren, 'data.self'));
            }
        }
        
        return children;
    }

    private createDataProductInfoChildren(schema: any): SchemaNode[] {
        const children: SchemaNode[] = [];
        
        if (schema.apiVersion) {
            children.push(this.createNode('API Version', 'string', schema.apiVersion, true, [], [], 'apiVersion'));
        }
        
        if (schema.resourceType) {
            children.push(this.createNode('Resource Type', 'string', schema.resourceType, true, [], [], 'resourceType'));
        }
        
        if (schema.data) {
            const data = schema.data;
            
            if (data.name) {
                children.push(this.createNode('Name', 'string', data.name, true, [], [], 'data.name'));
            }
            
            if (data.domain) {
                children.push(this.createNode('Domain', 'string', data.domain, true, [], [], 'data.domain'));
            }
            
            if (data.owner) {
                children.push(this.createNode('Owner', 'string', data.owner, true, [], [], 'data.owner'));
            }
            
            if (data.description) {
                children.push(this.createNode('Description', 'string', data.description, false, [], [], 'data.description'));
            }
        }
        
        return children;
    }

    private parseEventSpecs(eventSpecs: any[]): SchemaNode[] {
        return eventSpecs.map((spec, index) => {
            const children: SchemaNode[] = [];
            
            if (spec.source) {
                children.push(this.createNode('Source', 'string', spec.source, true, [], [], `data.eventSpecs[${index}].source`));
            }
            
            if (spec.types) {
                const typesNode = this.createNode('Types', 'array', 'Event types in this specification', true, [], [], `data.eventSpecs[${index}].types`);
                typesNode.children = spec.types.map((type: string, typeIndex: number) => 
                    this.createNode(type, 'string', type, true, [], [], `data.eventSpecs[${index}].types[${typeIndex}]`)
                );
                children.push(typesNode);
            }
            
            return this.createNode(`Event Spec ${index + 1}`, 'object', spec.source || `Event specification ${index + 1}`, true, [], children, `data.eventSpecs[${index}]`);
        });
    }

    private parseProperties(properties: any, required: string[] = [], basePath: string): SchemaNode[] {
        const nodes: SchemaNode[] = [];
        
        for (const [key, prop] of Object.entries(properties) as [string, any][]) {
            const isRequired = required.includes(key);
            const path = basePath ? `${basePath}.${key}` : key;
            const constraints = this.extractConstraints(prop);
            
            let type = prop.type || 'any';
            if (prop.enum) {
                type = 'enum';
                constraints.push(`Values: ${prop.enum.join(', ')}`);
            }
            
            const children: SchemaNode[] = [];
            
            // Handle nested objects
            if (prop.type === 'object' && prop.properties) {
                children.push(...this.parseProperties(prop.properties, prop.required || [], path));
            }
            
            // Handle arrays with object items
            if (prop.type === 'array' && prop.items) {
                if (prop.items.type === 'object' && prop.items.properties) {
                    const itemsNode = this.createNode('Items', 'object', 'Array item structure', false, [], [], `${path}.items`);
                    itemsNode.children = this.parseProperties(prop.items.properties, prop.items.required || [], `${path}.items`);
                    children.push(itemsNode);
                } else {
                    children.push(this.createNode('Items', prop.items.type || 'any', `Array of ${prop.items.type || 'any'}`, false, this.extractConstraints(prop.items), [], `${path}.items`));
                }
            }
            
            nodes.push(this.createNode(key, type, prop.description || '', isRequired, constraints, children, path));
        }
        
        return nodes;
    }

    private extractConstraints(prop: any): string[] {
        const constraints: string[] = [];
        
        if (prop.format) {
            constraints.push(`Format: ${prop.format}`);
        }
        if (typeof prop.minimum !== 'undefined') {
            constraints.push(`Min: ${prop.minimum}`);
        }
        if (typeof prop.maximum !== 'undefined') {
            constraints.push(`Max: ${prop.maximum}`);
        }
        if (typeof prop.minLength !== 'undefined') {
            constraints.push(`Min length: ${prop.minLength}`);
        }
        if (typeof prop.maxLength !== 'undefined') {
            constraints.push(`Max length: ${prop.maxLength}`);
        }
        if (prop.pattern) {
            constraints.push(`Pattern: ${prop.pattern}`);
        }
        if (prop.const) {
            constraints.push(`Constant: ${prop.const}`);
        }
        
        return constraints;
    }

    // Method to navigate to specific property in editor
    navigateToProperty(node: SchemaNode) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !node.path) return;
        
        const document = activeEditor.document;
        const text = document.getText();
        
        try {
            // Parse the document to find the exact location
            let parsedContent: any;
            if (document.languageId === 'json' || document.uri.fsPath.endsWith('.json')) {
                parsedContent = JSON.parse(text);
            } else {
                parsedContent = yaml.load(text) as any;
            }
            
            // Navigate to the property using a more sophisticated approach
            const position = this.findPropertyPosition(text, node.path, document.languageId);
            if (position) {
                activeEditor.selection = new vscode.Selection(position, position);
                activeEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                vscode.window.showInformationMessage(`Navigated to: ${node.name}`);
            } else {
                // Fallback to simple search
                this.fallbackSearch(activeEditor, node.name, text);
            }
        } catch (error) {
            // Fallback to simple search if parsing fails
            this.fallbackSearch(activeEditor, node.name, text);
        }
    }

    private findPropertyPosition(text: string, path: string, languageId: string): vscode.Position | null {
        const lines = text.split('\n');
        const pathParts = path.split('.');
        
        // For JSON files
        if (languageId === 'json') {
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lastPart = pathParts[pathParts.length - 1];
                
                if (line.includes(`"${lastPart}"`)) {
                    const column = line.indexOf(`"${lastPart}"`);
                    return new vscode.Position(i, column);
                }
            }
        } else {
            // For YAML files
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const lastPart = pathParts[pathParts.length - 1];
                
                if (line.includes(`${lastPart}:`)) {
                    const column = line.indexOf(`${lastPart}:`);
                    return new vscode.Position(i, column);
                }
            }
        }
        
        return null;
    }

    private fallbackSearch(activeEditor: vscode.TextEditor, propertyName: string, text: string) {
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`"${propertyName}"`) || lines[i].includes(`${propertyName}:`)) {
                const position = new vscode.Position(i, 0);
                activeEditor.selection = new vscode.Selection(position, position);
                activeEditor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                vscode.window.showInformationMessage(`Found: ${propertyName}`);
                break;
            }
        }
    }
}

export class SchemaVisualizationManager {
    private treeDataProvider: SchemaVisualizationProvider;
    private treeView: vscode.TreeView<SchemaNode>;

    constructor() {
        this.treeDataProvider = new SchemaVisualizationProvider();
        this.treeView = vscode.window.createTreeView('snowplowSchemaVisualization', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true
        });
    }

    activate(context: vscode.ExtensionContext) {
        // Register tree view
        context.subscriptions.push(this.treeView);

        // Register commands
        context.subscriptions.push(
            vscode.commands.registerCommand('snowplow.refreshSchemaVisualization', () => {
                this.treeDataProvider.refresh();
            }),
            
            vscode.commands.registerCommand('snowplow.navigateToProperty', (node: SchemaNode) => {
                this.treeDataProvider.navigateToProperty(node);
            }),

            vscode.commands.registerCommand('snowplow.visualizeCurrentSchema', () => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor && this.isSchemaFile(activeEditor.document)) {
                    this.treeDataProvider.updateSchema(activeEditor.document);
                    vscode.commands.executeCommand('snowplowSchemaVisualization.focus');
                } else {
                    vscode.window.showInformationMessage('Please open a Snowplow schema file to visualize.');
                }
            })
        );

        // Auto-update visualization when active editor changes
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                if (editor && this.isSchemaFile(editor.document)) {
                    this.treeDataProvider.updateSchema(editor.document);
                }
            })
        );

        // Auto-update visualization when document content changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const activeEditor = vscode.window.activeTextEditor;
                if (activeEditor && 
                    activeEditor.document === event.document && 
                    this.isSchemaFile(event.document)) {
                    // Debounce updates to avoid too many refreshes
                    setTimeout(() => {
                        this.treeDataProvider.updateSchema(event.document);
                    }, 500);
                }
            })
        );

        // Initialize with current active editor if it's a schema file
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && this.isSchemaFile(activeEditor.document)) {
            this.treeDataProvider.updateSchema(activeEditor.document);
        }
    }

    private isSchemaFile(document: vscode.TextDocument): boolean {
        const filePath = document.uri.fsPath;
        const hasValidExtension = filePath.endsWith('.json') || filePath.endsWith('.yaml') || filePath.endsWith('.yml');
        
        if (!hasValidExtension) return false;
        
        // Check if it's in data-structures or data-products folder
        const isInSnowplowFolder = filePath.includes('/data-structures/') || 
                                  filePath.includes('\\data-structures\\') ||
                                  filePath.includes('/data-products/') || 
                                  filePath.includes('\\data-products\\');
        
        if (isInSnowplowFolder) return true;
        
        // Check content for Snowplow schema structure
        try {
            const content = document.getText();
            const parsed = document.languageId === 'json' ? JSON.parse(content) : yaml.load(content);
            return parsed && 
                   (parsed.resourceType === 'data-structure' || 
                    parsed.resourceType === 'data-product' || 
                    parsed.apiVersion === 'v1');
        } catch {
            return false;
        }
    }

    dispose() {
        this.treeView.dispose();
    }
}
