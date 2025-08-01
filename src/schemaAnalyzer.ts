import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import * as path from 'path';

interface SchemaMetrics {
    complexity: number;
    depth: number;
    propertyCount: number;
    requiredRatio: number;
    enumCount: number;
}

interface SchemaReference {
    filePath: string;
    referencedBy: string[];
    references: string[];
    version: string;
}

export class SnowplowSchemaAnalyzer {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private schemaIndex: Map<string, SchemaReference> = new Map();

    constructor() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('snowplow-analytics');
    }

    activate(context: vscode.ExtensionContext) {
        // Register commands for new features
        context.subscriptions.push(
            vscode.commands.registerCommand('snowplow.analyzeSchema', this.analyzeSchema.bind(this)),
            vscode.commands.registerCommand('snowplow.convertFormat', this.convertFormat.bind(this)),
            vscode.commands.registerCommand('snowplow.generateTestData', this.generateTestData.bind(this)),
            vscode.commands.registerCommand('snowplow.showSchemaDependencies', this.showSchemaDependencies.bind(this)),
            vscode.commands.registerCommand('snowplow.optimizeSchema', this.optimizeSchema.bind(this))
        );

        // Build schema index on startup
        this.buildSchemaIndex();

        // Watch for schema changes
        const watcher = vscode.workspace.createFileSystemWatcher('**/data-structures/**/*.{json,yaml,yml}');
        watcher.onDidChange(() => this.buildSchemaIndex());
        watcher.onDidCreate(() => this.buildSchemaIndex());
        watcher.onDidDelete(() => this.buildSchemaIndex());
        context.subscriptions.push(watcher);
    }

    private async analyzeSchema(uri?: vscode.Uri) {
        const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
        if (!document) {
            vscode.window.showErrorMessage('No schema file selected for analysis.');
            return;
        }

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing Snowplow Schema",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ increment: 20, message: "Parsing schema..." });
                
                const schema = this.parseSchema(document);
                if (!schema) {
                    vscode.window.showErrorMessage('Invalid schema format. Please check your JSON/YAML syntax.');
                    return;
                }

                progress.report({ increment: 40, message: "Calculating metrics..." });
                const metrics = this.calculateMetrics(schema);
                
                progress.report({ increment: 30, message: "Generating report..." });
                const analysis = this.generateAnalysisReport(metrics, schema);

                progress.report({ increment: 10, message: "Opening report..." });
                // Show analysis in a new document
                const doc = await vscode.workspace.openTextDocument({
                    content: analysis,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc);
                
                vscode.window.showInformationMessage('✅ Schema analysis completed successfully!');

            } catch (error) {
                vscode.window.showErrorMessage(`❌ Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        });
    }

    private async convertFormat(uri?: vscode.Uri) {
        const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
        if (!document) {
            vscode.window.showErrorMessage('No file selected for conversion.');
            return;
        }

        try {
            const isJson = document.languageId === 'json' || document.uri.fsPath.endsWith('.json');
            const content = document.getText();
            let converted: string;
            let newExtension: string;

            if (isJson) {
                // Convert JSON to YAML
                const parsed = JSON.parse(content);
                converted = yaml.dump(parsed, { indent: 2, lineWidth: 120 });
                newExtension = '.yaml';
            } else {
                // Convert YAML to JSON
                const parsed = yaml.load(content);
                converted = JSON.stringify(parsed, null, 2);
                newExtension = '.json';
            }

            // Create new file with converted content
            const newPath = document.uri.fsPath.replace(/\.(json|yaml|yml)$/, newExtension);
            const newUri = vscode.Uri.file(newPath);
            
            await vscode.workspace.fs.writeFile(newUri, Buffer.from(converted, 'utf8'));
            const newDoc = await vscode.workspace.openTextDocument(newUri);
            vscode.window.showTextDocument(newDoc);

            vscode.window.showInformationMessage(`Schema converted to ${isJson ? 'YAML' : 'JSON'} format.`);

        } catch (error) {
            vscode.window.showErrorMessage(`Conversion failed: ${error}`);
        }
    }

    private async generateTestData(uri?: vscode.Uri) {
        const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
        if (!document) {
            vscode.window.showErrorMessage('No schema file selected for test data generation.');
            return;
        }

        try {
            const schema = this.parseSchema(document);
            if (!schema?.data) {
                vscode.window.showErrorMessage('Invalid schema format.');
                return;
            }

            const testData = this.generateMockData(schema.data);
            const testDataJson = JSON.stringify(testData, null, 2);

            // Show test data in a new document
            const doc = await vscode.workspace.openTextDocument({
                content: testDataJson,
                language: 'json'
            });
            vscode.window.showTextDocument(doc);

            vscode.window.showInformationMessage('Test data generated successfully.');

        } catch (error) {
            vscode.window.showErrorMessage(`Test data generation failed: ${error}`);
        }
    }

    private async showSchemaDependencies() {
        const dependencies = this.analyzeDependencies();
        const report = this.generateDependencyReport(dependencies);

        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        vscode.window.showTextDocument(doc);
    }

    private async optimizeSchema(uri?: vscode.Uri) {
        const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document;
        if (!document) {
            vscode.window.showErrorMessage('No schema file selected for optimization.');
            return;
        }

        try {
            const schema = this.parseSchema(document);
            if (!schema) {
                vscode.window.showErrorMessage('Invalid schema format.');
                return;
            }

            const suggestions = this.generateOptimizationSuggestions(schema);
            const report = this.generateOptimizationReport(suggestions);

            const doc = await vscode.workspace.openTextDocument({
                content: report,
                language: 'markdown'
            });
            vscode.window.showTextDocument(doc);

        } catch (error) {
            vscode.window.showErrorMessage(`Optimization analysis failed: ${error}`);
        }
    }

    private parseSchema(document: vscode.TextDocument): any {
        try {
            const text = document.getText();
            if (document.languageId === 'json' || document.uri.fsPath.endsWith('.json')) {
                return JSON.parse(text);
            } else {
                return yaml.load(text);
            }
        } catch {
            return null;
        }
    }

    private calculateMetrics(schema: any): SchemaMetrics {
        const properties = schema.data?.properties || {};
        const required = schema.data?.required || [];
        
        return {
            complexity: this.calculateComplexity(properties),
            depth: this.calculateDepth(properties),
            propertyCount: Object.keys(properties).length,
            requiredRatio: required.length / Math.max(Object.keys(properties).length, 1),
            enumCount: this.countEnums(properties)
        };
    }

    private calculateComplexity(obj: any, depth = 0): number {
        if (depth > 10) return 0; // Prevent infinite recursion
        
        let complexity = 0;
        for (const key in obj) {
            complexity += 1;
            if (obj[key] && typeof obj[key] === 'object') {
                if (obj[key].properties) {
                    complexity += this.calculateComplexity(obj[key].properties, depth + 1);
                }
                if (obj[key].items && obj[key].items.properties) {
                    complexity += this.calculateComplexity(obj[key].items.properties, depth + 1);
                }
            }
        }
        return complexity;
    }

    private calculateDepth(obj: any, currentDepth = 1): number {
        let maxDepth = currentDepth;
        for (const key in obj) {
            if (obj[key] && obj[key].properties) {
                const childDepth = this.calculateDepth(obj[key].properties, currentDepth + 1);
                maxDepth = Math.max(maxDepth, childDepth);
            }
        }
        return maxDepth;
    }

    private countEnums(obj: any): number {
        let count = 0;
        for (const key in obj) {
            if (obj[key] && obj[key].enum) {
                count++;
            }
            if (obj[key] && obj[key].properties) {
                count += this.countEnums(obj[key].properties);
            }
        }
        return count;
    }

    private generateMockData(schema: any): any {
        const data: any = {};
        const properties = schema.properties || {};
        
        for (const [key, prop] of Object.entries(properties) as [string, any][]) {
            data[key] = this.generateMockValue(prop);
        }
        
        return data;
    }

    private generateMockValue(property: any): any {
        if (property.enum) {
            return property.enum[0];
        }
        
        switch (property.type) {
            case 'string':
                return property.format === 'email' ? 'user@example.com' : 
                       property.format === 'uri' ? 'https://example.com' :
                       `sample_${Math.random().toString(36).substr(2, 5)}`;
            case 'number':
            case 'integer':
                const min = property.minimum || 0;
                const max = property.maximum || 100;
                return Math.floor(Math.random() * (max - min + 1)) + min;
            case 'boolean':
                return Math.random() > 0.5;
            case 'array':
                if (property.items) {
                    return [this.generateMockValue(property.items)];
                }
                return [];
            case 'object':
                if (property.properties) {
                    const obj: any = {};
                    for (const [key, prop] of Object.entries(property.properties) as [string, any][]) {
                        obj[key] = this.generateMockValue(prop);
                    }
                    return obj;
                }
                return {};
            default:
                return null;
        }
    }

    private generateAnalysisReport(metrics: SchemaMetrics, schema: any): string {
        return `# Schema Analysis Report

## Overview
- **Schema Name**: ${schema.data?.self?.name || 'Unknown'}
- **Vendor**: ${schema.data?.self?.vendor || 'Unknown'}
- **Version**: ${schema.data?.self?.version || 'Unknown'}
- **Schema Type**: ${schema.meta?.schemaType || 'Unknown'}

## Metrics
- **Complexity Score**: ${metrics.complexity} ${this.getComplexityRating(metrics.complexity)}
- **Maximum Depth**: ${metrics.depth} levels
- **Total Properties**: ${metrics.propertyCount}
- **Required Properties**: ${Math.round(metrics.requiredRatio * 100)}% (${Math.round(metrics.requiredRatio * metrics.propertyCount)}/${metrics.propertyCount})
- **Enum Properties**: ${metrics.enumCount}

## Recommendations
${this.generateRecommendations(metrics)}

## Best Practices
${this.generateBestPractices(schema, metrics)}
`;
    }

    private getComplexityRating(complexity: number): string {
        if (complexity < 10) return '(Simple)';
        if (complexity < 25) return '(Moderate)';
        if (complexity < 50) return '(Complex)';
        return '(Very Complex)';
    }

    private generateRecommendations(metrics: SchemaMetrics): string {
        const recommendations = [];
        
        if (metrics.complexity > 50) {
            recommendations.push('⚠️ **High Complexity**: Consider breaking this schema into smaller, more focused schemas.');
        }
        
        if (metrics.depth > 5) {
            recommendations.push('⚠️ **Deep Nesting**: Reduce nesting depth for better performance and maintainability.');
        }
        
        if (metrics.requiredRatio < 0.3) {
            recommendations.push('💡 **Low Required Ratio**: Consider making more properties required for better data quality.');
        }
        
        if (metrics.requiredRatio > 0.8) {
            recommendations.push('💡 **High Required Ratio**: Consider making some properties optional for flexibility.');
        }

        if (recommendations.length === 0) {
            recommendations.push('✅ **Well Structured**: This schema follows good design practices.');
        }
        
        return recommendations.join('\n');
    }

    private generateBestPractices(schema: any, metrics: SchemaMetrics): string {
        return `- Use descriptive property names and descriptions
- Keep nesting depth under 5 levels when possible
- Balance required vs optional properties based on use case
- Use enums for constrained string values
- Include format constraints for strings (email, uri, etc.)
- Consider schema versioning strategy for future changes`;
    }

    private buildSchemaIndex() {
        this.schemaIndex.clear();
        // Implementation would scan workspace for schemas and build dependency graph
    }

    private analyzeDependencies(): Map<string, SchemaReference> {
        // Implementation would analyze cross-schema references
        return this.schemaIndex;
    }

    private generateDependencyReport(dependencies: Map<string, SchemaReference>): string {
        return `# Schema Dependencies Report

## Overview
Total schemas analyzed: ${dependencies.size}

## Dependency Graph
${Array.from(dependencies.entries()).map(([name, ref]) => 
    `### ${name}\n- References: ${ref.references.join(', ') || 'None'}\n- Referenced by: ${ref.referencedBy.join(', ') || 'None'}`
).join('\n\n')}
`;
    }

    private generateOptimizationSuggestions(schema: any): string[] {
        const suggestions = [];
        
        // Check for missing descriptions
        if (!schema.data?.description || schema.data.description.length < 10) {
            suggestions.push('Add a comprehensive description to the schema');
        }
        
        // Check for missing property descriptions
        const properties = schema.data?.properties || {};
        const missingDescriptions = Object.keys(properties).filter(key => 
            !properties[key].description || properties[key].description.length < 5
        );
        
        if (missingDescriptions.length > 0) {
            suggestions.push(`Add descriptions to properties: ${missingDescriptions.join(', ')}`);
        }
        
        // Check for potential enum opportunities
        const stringProps = Object.entries(properties).filter(([, prop]: [string, any]) => 
            prop.type === 'string' && !prop.enum && !prop.format
        );
        
        if (stringProps.length > 0) {
            suggestions.push('Consider using enums for string properties with limited valid values');
        }
        
        return suggestions;
    }

    private generateOptimizationReport(suggestions: string[]): string {
        return `# Schema Optimization Report

## Optimization Suggestions
${suggestions.length > 0 ? 
    suggestions.map(s => `- ${s}`).join('\n') : 
    '✅ No optimization suggestions at this time.'
}

## Performance Tips
- Use specific string formats (email, uri, date-time) when applicable
- Prefer smaller data types when possible (integer vs number)
- Use additionalProperties: false to prevent unexpected data
- Consider property ordering for better compression
`;
    }

    dispose() {
        this.diagnosticCollection.dispose();
    }
}
