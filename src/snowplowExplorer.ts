import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { getFileStatus, detectFileType } from './fileUtils';

interface SnowplowAsset {
    label: string;
    filePath: string;
    type: 'data-product' | 'data-structure' | 'source-application' | 'folder' | 'action' | 'event-spec' | 'entity';
    contextValue: string;
    collapsibleState: vscode.TreeItemCollapsibleState;
    command?: vscode.Command;
    iconPath?: vscode.ThemeIcon;
    tooltip?: string;
    resourceUri?: vscode.Uri;
    description?: string;
    // For nested items
    parentPath?: string;
    eventSpecData?: any;
    igluUri?: string;
}

export class SnowplowAssetProvider implements vscode.TreeDataProvider<SnowplowAsset> {

    private _onDidChangeTreeData: vscode.EventEmitter<SnowplowAsset | undefined | null | void> = new vscode.EventEmitter<SnowplowAsset | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<SnowplowAsset | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private workspaceRoot: string | undefined) { }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: SnowplowAsset): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(element.label, element.collapsibleState);
        treeItem.contextValue = element.contextValue;
        treeItem.command = element.command;
        treeItem.iconPath = element.iconPath;
        treeItem.tooltip = element.tooltip;
        treeItem.resourceUri = element.resourceUri;
        treeItem.description = element.description;
        return treeItem;
    }

    getChildren(element?: SnowplowAsset): Thenable<SnowplowAsset[]> {
        if (!this.workspaceRoot) {
            return Promise.resolve(this.createEmptyWorkspaceItems());
        }

        if (element) {
            // Children of top-level items
            if (element.label?.startsWith('Data Products')) {
                return this.getDataProductsWithNesting(path.join(this.workspaceRoot, 'data-products'));
            } else if (element.label?.startsWith('Data Structures')) {
                return this.getDataStructureVendors(path.join(this.workspaceRoot, 'data-structures'));
            } else if (element.label?.startsWith('Source Applications')) {
                return this.getAssets(path.join(this.workspaceRoot, 'data-products', 'source-apps'), 'source-application');
            } else if (element.contextValue === 'dataStructureVendor') {
                // Show data structures for a specific vendor
                return this.getAssets(element.filePath, 'data-structure');
            } else if (element.contextValue === 'dataProduct') {
                // Show event specifications for a data product
                return this.getEventSpecificationsForDataProduct(element.filePath);
            } else if (element.contextValue === 'eventSpec') {
                // Show entities and data structures for an event specification
                return this.getEntitiesForEventSpec(element.parentPath!, element.eventSpecData);
            } else {
                return Promise.resolve([]);
            }
        } else {
            // Top-level items with enhanced structure
            const items: SnowplowAsset[] = [];
            
            // Data Products section
            const dataProductsPath = path.join(this.workspaceRoot, 'data-products');
            const dataProductStats = this.getDirectoryStats(dataProductsPath);
            items.push({
                label: `Data Products`,
                filePath: dataProductsPath,
                type: 'folder',
                contextValue: 'dataProductsRoot',
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                iconPath: new vscode.ThemeIcon('package'),
                tooltip: this.createStatsTooltip('Data Products', dataProductStats),
                description: `${dataProductStats.total} files`,
                resourceUri: vscode.Uri.file(dataProductsPath)
            });

            // Data Structures section
            const dataStructuresPath = path.join(this.workspaceRoot, 'data-structures');
            const dataStructureStats = this.getDirectoryStatsRecursive(dataStructuresPath);
            items.push({
                label: `Data Structures`,
                filePath: dataStructuresPath,
                type: 'folder',
                contextValue: 'dataStructuresRoot',
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                iconPath: new vscode.ThemeIcon('symbol-structure'),
                tooltip: this.createStatsTooltip('Data Structures', dataStructureStats),
                description: `${dataStructureStats.total} files`,
                resourceUri: vscode.Uri.file(dataStructuresPath)
            });

            // Source Applications section
            const sourceAppsPath = path.join(this.workspaceRoot, 'data-products', 'source-apps');
            const sourceAppStats = this.getDirectoryStats(sourceAppsPath);
            items.push({
                label: `Source Applications`,
                filePath: sourceAppsPath,
                type: 'folder',
                contextValue: 'sourceAppsRoot',
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
                iconPath: new vscode.ThemeIcon('device-mobile'),
                tooltip: this.createStatsTooltip('Source Applications', sourceAppStats),
                description: `${sourceAppStats.total} files`,
                resourceUri: vscode.Uri.file(sourceAppsPath)
            });

            // If no assets, show welcome items
            if (dataProductStats.total === 0 && dataStructureStats.total === 0 && sourceAppStats.total === 0) {
                items.push(...this.createWelcomeItems());
            }

            return Promise.resolve(items);
        }
    }

    private createWelcomeItems(): SnowplowAsset[] {
        return [
            {
                label: '🚀 Get Started with Snowplow',
                filePath: '',
                type: 'action',
                contextValue: 'welcomeItem',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'snowplow.setup',
                    title: 'Setup Credentials'
                },
                iconPath: new vscode.ThemeIcon('rocket'),
                tooltip: 'Click to set up your Snowplow credentials',
                description: 'Setup credentials first'
            },
            {
                label: '📦 Generate Data Product',
                filePath: '',
                type: 'action',
                contextValue: 'welcomeItem',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'snowplow.generateDataProduct',
                    title: 'Generate Data Product'
                },
                iconPath: new vscode.ThemeIcon('package'),
                tooltip: 'Click to generate a new data product',
                description: 'Create new asset'
            },
            {
                label: '🏗️ Generate Data Structure',
                filePath: '',
                type: 'action',
                contextValue: 'welcomeItem',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'snowplow.generateDataStructure',
                    title: 'Generate Data Structure'
                },
                iconPath: new vscode.ThemeIcon('symbol-structure'),
                tooltip: 'Click to generate a new data structure',
                description: 'Create new schema'
            },
            {
                label: '📱 Generate Source Application',
                filePath: '',
                type: 'action',
                contextValue: 'welcomeItem',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'snowplow.generateSourceApp',
                    title: 'Generate Source Application'
                },
                iconPath: new vscode.ThemeIcon('device-mobile'),
                tooltip: 'Click to generate a new source application',
                description: 'Create new source app'
            },
            {
                label: '⬇️ Download All Assets',
                filePath: '',
                type: 'action',
                contextValue: 'welcomeItem',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'snowplow.downloadAllDataProducts',
                    title: 'Download All Data Products'
                },
                iconPath: new vscode.ThemeIcon('cloud-download'),
                tooltip: 'Click to download all data products from your organization',
                description: 'Sync from cloud'
            }
        ];
    }

    private createEmptyWorkspaceItems(): SnowplowAsset[] {
        return [
            {
                label: '📁 No Snowplow workspace detected',
                filePath: '',
                type: 'action',
                contextValue: 'emptyWorkspace',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                iconPath: new vscode.ThemeIcon('info'),
                tooltip: 'This workspace does not contain data-products or data-structures folders'
            },
            {
                label: '🚀 Get Started with Snowplow',
                filePath: '',
                type: 'action',
                contextValue: 'getStarted',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                command: {
                    command: 'snowplow.setup',
                    title: 'Setup Credentials'
                },
                iconPath: new vscode.ThemeIcon('rocket'),
                tooltip: 'Click to set up your Snowplow credentials and get started'
            }
        ];
    }

    private getDirectoryStats(dir: string): { total: number; valid: number; invalid: number; unknown: number } {
        const stats = { total: 0, valid: 0, invalid: 0, unknown: 0 };
        
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter(file => {
                const filePath = path.join(dir, file);
                return fs.statSync(filePath).isFile() && (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
            });
            
            stats.total = files.length;
            
            files.forEach(file => {
                const filePath = path.join(dir, file);
                const status = getFileStatus(filePath);
                stats[status]++;
            });
        }
        
        return stats;
    }

    private createStatsTooltip(type: string, stats: { total: number; valid: number; invalid: number; unknown: number }): string {
        return `${type} Overview:
Total: ${stats.total} files
✅ Valid: ${stats.valid}
❌ Invalid: ${stats.invalid}
❓ Unknown: ${stats.unknown}

Click to expand and view individual files`;
    }

    private getFileCount(dir: string): number {
        if (fs.existsSync(dir)) {
            return fs.readdirSync(dir).filter(file => {
                const filePath = path.join(dir, file);
                return fs.statSync(filePath).isFile() && (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
            }).length;
        }
        return 0;
    }

    private getAssets(dir: string, assetType: 'data-product' | 'data-structure' | 'source-application'): Promise<SnowplowAsset[]> {
        if (fs.existsSync(dir)) {
            const assets: SnowplowAsset[] = [];
            
            if (assetType === 'data-structure') {
                // For data structures, search recursively in all subdirectories
                this.collectDataStructuresRecursively(dir, assets);
            } else if (assetType === 'source-application') {
                // For source applications, search only in the direct directory
                this.collectSourceAppsInDirectory(dir, assets);
            } else {
                // For data products, search only in the direct directory
                this.collectDataProductsInDirectory(dir, assets);
            }
            
            // Sort by status first (valid, unknown, invalid), then by name
            assets.sort((a, b) => {
                const statusOrder = { valid: 0, unknown: 1, invalid: 2 };
                const aStatus = a.label.startsWith('✅') ? 'valid' : a.label.startsWith('❓') ? 'unknown' : 'invalid';
                const bStatus = b.label.startsWith('✅') ? 'valid' : b.label.startsWith('❓') ? 'unknown' : 'invalid';
                
                if (statusOrder[aStatus as keyof typeof statusOrder] !== statusOrder[bStatus as keyof typeof statusOrder]) {
                    return statusOrder[aStatus as keyof typeof statusOrder] - statusOrder[bStatus as keyof typeof statusOrder];
                }
                
                return a.label.localeCompare(b.label);
            });
            
            return Promise.resolve(assets);
        } else {
            return Promise.resolve([]);
        }
    }

    private collectDataStructuresRecursively(dir: string, assets: SnowplowAsset[]): void {
        if (!fs.existsSync(dir)) {
            return;
        }

        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isFile() && (item.endsWith('.json') || item.endsWith('.yaml') || item.endsWith('.yml'))) {
                const asset = this.createAssetFromFile(itemPath, item, 'data-structure');
                if (asset) {
                    assets.push(asset);
                }
            } else if (stat.isDirectory()) {
                // Recursively search subdirectories
                this.collectDataStructuresRecursively(itemPath, assets);
            }
        }
    }

    private collectDataProductsInDirectory(dir: string, assets: SnowplowAsset[]): void {
        if (!fs.existsSync(dir)) {
            return;
        }

        const files = fs.readdirSync(dir).filter(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            return stat.isFile() && (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
        });

        for (const file of files) {
            const filePath = path.join(dir, file);
            const asset = this.createAssetFromFile(filePath, file, 'data-product');
            if (asset) {
                assets.push(asset);
            }
        }
    }

    private collectSourceAppsInDirectory(dir: string, assets: SnowplowAsset[]): void {
        if (!fs.existsSync(dir)) {
            return;
        }

        const files = fs.readdirSync(dir).filter(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            return stat.isFile() && (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
        });

        for (const file of files) {
            const filePath = path.join(dir, file);
            const asset = this.createAssetFromFile(filePath, file, 'source-application');
            if (asset) {
                assets.push(asset);
            }
        }
    }

    private createAssetFromFile(filePath: string, fileName: string, assetType: 'data-product' | 'data-structure' | 'source-application'): SnowplowAsset | null {
        const contextValue = assetType === 'data-product' ? 'dataProduct' : 
                           assetType === 'data-structure' ? 'dataStructure' : 'sourceApplication';
        
        // Check file status for visual indicators
        const status = getFileStatus(filePath);
        const detectedType = detectFileType(filePath);
        
        // Determine icon based on file type, content, and status
        let iconPath: vscode.ThemeIcon;
        let tooltip: string;
        let description: string = '';
        
        if (assetType === 'data-product') {
            iconPath = status === 'valid' ? new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.green')) : 
                      status === 'invalid' ? new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.red')) :
                      new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.yellow'));
            tooltip = `Data Product: ${fileName}`;
        } else if (assetType === 'source-application') {
            iconPath = status === 'valid' ? new vscode.ThemeIcon('device-mobile', new vscode.ThemeColor('charts.green')) :
                      status === 'invalid' ? new vscode.ThemeIcon('device-mobile', new vscode.ThemeColor('charts.red')) :
                      new vscode.ThemeIcon('device-mobile', new vscode.ThemeColor('charts.yellow'));
            tooltip = `Source Application: ${fileName}`;
        } else {
            iconPath = status === 'valid' ? new vscode.ThemeIcon('symbol-structure', new vscode.ThemeColor('charts.green')) :
                      status === 'invalid' ? new vscode.ThemeIcon('symbol-structure', new vscode.ThemeColor('charts.red')) :
                      new vscode.ThemeIcon('symbol-structure', new vscode.ThemeColor('charts.yellow'));
            tooltip = `Data Structure: ${fileName}`;
        }
        
        // Build detailed tooltip
        tooltip += `\nStatus: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
        tooltip += `\nDetected Type: ${detectedType.replace('-', ' ').charAt(0).toUpperCase() + detectedType.replace('-', ' ').slice(1)}`;
        tooltip += `\nPath: ${filePath}`;
        
        // Try to extract more info from file content for tooltip and description
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Extract name or title
            const nameMatch = content.match(/name:\s*(.+)|"name":\s*"([^"]+)"/);
            const titleMatch = content.match(/title:\s*(.+)|"title":\s*"([^"]+)"/);
            
            if (nameMatch) {
                const name = (nameMatch[1] || nameMatch[2]).trim().replace(/["']/g, '');
                tooltip += `\nName: ${name}`;
                description = name;
            } else if (titleMatch) {
                const title = (titleMatch[1] || titleMatch[2]).trim().replace(/["']/g, '');
                tooltip += `\nTitle: ${title}`;
                description = title;
            }
            
            // Extract version information
            const versionMatch = content.match(/version:\s*(.+)|"version":\s*"([^"]+)"/);
            if (versionMatch) {
                const version = (versionMatch[1] || versionMatch[2]).trim().replace(/["']/g, '');
                tooltip += `\nVersion: ${version}`;
                if (description) {
                    description += ` (v${version})`;
                }
            }
            
            // Add file statistics
            const stats = fs.statSync(filePath);
            tooltip += `\nSize: ${(stats.size / 1024).toFixed(1)} KB`;
            tooltip += `\nModified: ${stats.mtime.toLocaleDateString()} ${stats.mtime.toLocaleTimeString()}`;
            
            // Type mismatch warning
            if (detectedType !== 'unknown' && 
                ((assetType === 'data-product' && detectedType !== 'data-product') ||
                 (assetType === 'data-structure' && detectedType !== 'data-structure') ||
                 (assetType === 'source-application' && detectedType !== 'source-application'))) {
                tooltip += `\n⚠️ Warning: File appears to be a ${detectedType.replace('-', ' ')} but is in the ${assetType.replace('-', ' ')}s folder`;
                description = '⚠️ ' + description;
            }
            
        } catch (e) {
            // If we can't read the file, mark it as potentially problematic
            tooltip += `\n❌ Error reading file: ${e instanceof Error ? e.message : 'Unknown error'}`;
            description = '❌ Read error';
        }

        // Add status indicator to label
        const statusIcon = status === 'valid' ? '✅' : status === 'invalid' ? '❌' : '❓';
        
        // For data structures, show relative path from vendor directory
        let displayName = fileName;
        if (assetType === 'data-structure') {
            const relativePath = path.relative(path.join(path.dirname(filePath), '..'), filePath);
            if (relativePath !== fileName) {
                displayName = relativePath;
            }
        }
        
        const label = `${statusIcon} ${displayName}`;

        return {
            label: label,
            filePath: filePath,
            type: assetType,
            contextValue: contextValue,
            collapsibleState: vscode.TreeItemCollapsibleState.None,
            command: {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(filePath)]
            },
            iconPath: iconPath,
            tooltip: tooltip,
            resourceUri: vscode.Uri.file(filePath),
            description: description
        } as SnowplowAsset;
    }

    private getDataStructureVendors(dataStructuresDir: string): Promise<SnowplowAsset[]> {
        if (!fs.existsSync(dataStructuresDir)) {
            return Promise.resolve([]);
        }

        const vendors = fs.readdirSync(dataStructuresDir)
            .filter(item => {
                const itemPath = path.join(dataStructuresDir, item);
                return fs.statSync(itemPath).isDirectory();
            })
            .map(vendorDir => {
                const vendorPath = path.join(dataStructuresDir, vendorDir);
                const fileCount = this.getFileCountRecursive(vendorPath);
                const stats = this.getDirectoryStatsRecursive(vendorPath);
                
                // Create vendor folder item
                return {
                    label: `📁 ${vendorDir}`,
                    filePath: vendorPath,
                    type: 'folder' as const,
                    contextValue: 'dataStructureVendor',
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    iconPath: new vscode.ThemeIcon('folder'),
                    tooltip: this.createStatsTooltip(`Vendor: ${vendorDir}`, stats),
                    description: `${stats.total} schemas`,
                    resourceUri: vscode.Uri.file(vendorPath)
                } as SnowplowAsset;
            })
            .sort((a, b) => a.label.localeCompare(b.label));

        return Promise.resolve(vendors);
    }

    private getFileCountRecursive(dir: string): number {
        if (!fs.existsSync(dir)) {
            return 0;
        }

        let count = 0;
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isFile() && (item.endsWith('.json') || item.endsWith('.yaml') || item.endsWith('.yml'))) {
                count++;
            } else if (stat.isDirectory()) {
                count += this.getFileCountRecursive(itemPath);
            }
        }
        
        return count;
    }

    private getDirectoryStatsRecursive(dir: string): { total: number; valid: number; invalid: number; unknown: number } {
        const stats = { total: 0, valid: 0, invalid: 0, unknown: 0 };
        
        if (!fs.existsSync(dir)) {
            return stats;
        }

        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const itemPath = path.join(dir, item);
            const stat = fs.statSync(itemPath);
            
            if (stat.isFile() && (item.endsWith('.json') || item.endsWith('.yaml') || item.endsWith('.yml'))) {
                stats.total++;
                const status = getFileStatus(itemPath);
                stats[status]++;
            } else if (stat.isDirectory()) {
                const subStats = this.getDirectoryStatsRecursive(itemPath);
                stats.total += subStats.total;
                stats.valid += subStats.valid;
                stats.invalid += subStats.invalid;
                stats.unknown += subStats.unknown;
            }
        }
        
        return stats;
    }

    private getDataProductsWithNesting(dir: string): Promise<SnowplowAsset[]> {
        if (fs.existsSync(dir)) {
            const assets: SnowplowAsset[] = [];
            
            const files = fs.readdirSync(dir).filter(file => {
                const filePath = path.join(dir, file);
                const stat = fs.statSync(filePath);
                return stat.isFile() && (file.endsWith('.yaml') || file.endsWith('.yml') || file.endsWith('.json'));
            });

            for (const file of files) {
                const filePath = path.join(dir, file);
                const asset = this.createDataProductAssetWithNesting(filePath, file);
                if (asset) {
                    assets.push(asset);
                }
            }
            
            // Sort by status first (valid, unknown, invalid), then by name
            assets.sort((a, b) => {
                const statusOrder = { valid: 0, unknown: 1, invalid: 2 };
                const aStatus = a.label.startsWith('✅') ? 'valid' : a.label.startsWith('❓') ? 'unknown' : 'invalid';
                const bStatus = b.label.startsWith('✅') ? 'valid' : b.label.startsWith('❓') ? 'unknown' : 'invalid';
                
                if (statusOrder[aStatus as keyof typeof statusOrder] !== statusOrder[bStatus as keyof typeof statusOrder]) {
                    return statusOrder[aStatus as keyof typeof statusOrder] - statusOrder[bStatus as keyof typeof statusOrder];
                }
                
                return a.label.localeCompare(b.label);
            });
            
            return Promise.resolve(assets);
        } else {
            return Promise.resolve([]);
        }
    }

    private createDataProductAssetWithNesting(filePath: string, fileName: string): SnowplowAsset | null {
        const status = getFileStatus(filePath);
        
        // Parse the data product to get event specifications count
        let eventSpecCount = 0;
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            let parsedContent: any;
            
            if (filePath.endsWith('.json')) {
                parsedContent = JSON.parse(content);
            } else {
                parsedContent = yaml.load(content);
            }
            
            if (parsedContent?.data?.eventSpecifications) {
                eventSpecCount = parsedContent.data.eventSpecifications.length;
            }
        } catch (error) {
            console.warn(`Failed to parse data product file: ${filePath}`, error);
        }
        
        // Status icons
        let statusIcon = '';
        if (status === 'valid') {
            statusIcon = '✅ ';
        } else if (status === 'invalid') {
            statusIcon = '❌ ';
        } else {
            statusIcon = '❓ ';
        }
        
        const displayName = fileName.replace(/\.(yaml|yml|json)$/, '');
        
        return {
            label: `${statusIcon}${displayName}`,
            filePath: filePath,
            type: 'data-product',
            contextValue: 'dataProduct',
            collapsibleState: eventSpecCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
            command: {
                command: 'vscode.open',
                title: 'Open',
                arguments: [vscode.Uri.file(filePath)]
            },
            iconPath: status === 'valid' ? new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.green')) :
                     status === 'invalid' ? new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.red')) :
                     new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.yellow')),
            tooltip: `Data Product: ${fileName}${eventSpecCount > 0 ? ` (${eventSpecCount} event specs)` : ''}`,
            resourceUri: vscode.Uri.file(filePath),
            description: eventSpecCount > 0 ? `${eventSpecCount} event spec${eventSpecCount === 1 ? '' : 's'}` : undefined
        };
    }

    private getEventSpecificationsForDataProduct(filePath: string): Promise<SnowplowAsset[]> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            let parsedContent: any;
            
            if (filePath.endsWith('.json')) {
                parsedContent = JSON.parse(content);
            } else {
                parsedContent = yaml.load(content);
            }
            
            const eventSpecs = parsedContent?.data?.eventSpecifications || [];
            const assets: SnowplowAsset[] = [];
            
            for (const spec of eventSpecs) {
                const entityCount = (spec.entities?.tracked?.length || 0) + (spec.entities?.enriched?.length || 0);
                
                assets.push({
                    label: `📋 ${spec.name || 'Unnamed Event Spec'}`,
                    filePath: filePath,
                    parentPath: filePath,
                    type: 'event-spec',
                    contextValue: 'eventSpec',
                    collapsibleState: entityCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                    iconPath: new vscode.ThemeIcon('symbol-event'),
                    tooltip: `Event Spec: ${spec.name}\n${spec.description || 'No description'}`,
                    description: entityCount > 0 ? `${entityCount} entit${entityCount === 1 ? 'y' : 'ies'}` : undefined,
                    eventSpecData: spec
                });
            }
            
            return Promise.resolve(assets);
        } catch (error) {
            console.warn(`Failed to parse data product for event specs: ${filePath}`, error);
            return Promise.resolve([]);
        }
    }

    private getEntitiesForEventSpec(dataProductPath: string, eventSpecData: any): Promise<SnowplowAsset[]> {
        const assets: SnowplowAsset[] = [];
        
        // Add event schema reference
        if (eventSpecData.event?.source) {
            const eventSchemaFile = this.findDataStructureFile(eventSpecData.event.source);
            const isFileFound = eventSchemaFile !== null;
            
            assets.push({
                label: `🎯 Event: ${this.extractSchemaName(eventSpecData.event.source)}`,
                filePath: eventSchemaFile || dataProductPath,
                type: isFileFound ? 'data-structure' : 'entity',
                contextValue: isFileFound ? 'dataStructure' : 'eventSchema',
                collapsibleState: vscode.TreeItemCollapsibleState.None,
                iconPath: new vscode.ThemeIcon('symbol-event', new vscode.ThemeColor('charts.blue')),
                tooltip: `Event Schema: ${eventSpecData.event.source}${isFileFound ? `\nFile: ${eventSchemaFile}` : '\n⚠️ File not found in workspace'}`,
                igluUri: eventSpecData.event.source,
                command: isFileFound ? {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(eventSchemaFile)]
                } : undefined,
                resourceUri: isFileFound ? vscode.Uri.file(eventSchemaFile) : undefined
            });
        }
        
        // Add tracked entities
        if (eventSpecData.entities?.tracked) {
            for (const entity of eventSpecData.entities.tracked) {
                const cardinality = entity.minCardinality !== undefined || entity.maxCardinality !== undefined
                    ? ` (${entity.minCardinality || 0}-${entity.maxCardinality || '∞'})`
                    : '';
                
                const entityFile = this.findDataStructureFile(entity.source);
                const isFileFound = entityFile !== null;
                
                assets.push({
                    label: `📦 ${this.extractSchemaName(entity.source)}${cardinality}`,
                    filePath: entityFile || dataProductPath,
                    type: isFileFound ? 'data-structure' : 'entity',
                    contextValue: isFileFound ? 'dataStructure' : 'trackedEntity',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    iconPath: new vscode.ThemeIcon('symbol-structure', new vscode.ThemeColor('charts.green')),
                    tooltip: `Tracked Entity: ${entity.source}${cardinality}${isFileFound ? `\nFile: ${entityFile}` : '\n⚠️ File not found in workspace'}`,
                    igluUri: entity.source,
                    command: isFileFound ? {
                        command: 'vscode.open',
                        title: 'Open File',
                        arguments: [vscode.Uri.file(entityFile)]
                    } : undefined,
                    resourceUri: isFileFound ? vscode.Uri.file(entityFile) : undefined
                });
            }
        }
        
        // Add enriched entities
        if (eventSpecData.entities?.enriched) {
            for (const entity of eventSpecData.entities.enriched) {
                const entityFile = this.findDataStructureFile(entity.source);
                const isFileFound = entityFile !== null;
                
                assets.push({
                    label: `🔍 ${this.extractSchemaName(entity.source)}`,
                    filePath: entityFile || dataProductPath,
                    type: isFileFound ? 'data-structure' : 'entity',
                    contextValue: isFileFound ? 'dataStructure' : 'enrichedEntity',
                    collapsibleState: vscode.TreeItemCollapsibleState.None,
                    iconPath: new vscode.ThemeIcon('symbol-structure', new vscode.ThemeColor('charts.orange')),
                    tooltip: `Enriched Entity: ${entity.source}${isFileFound ? `\nFile: ${entityFile}` : '\n⚠️ File not found in workspace'}`,
                    igluUri: entity.source,
                    command: isFileFound ? {
                        command: 'vscode.open',
                        title: 'Open File',
                        arguments: [vscode.Uri.file(entityFile)]
                    } : undefined,
                    resourceUri: isFileFound ? vscode.Uri.file(entityFile) : undefined
                });
            }
        }
        
        return Promise.resolve(assets);
    }

    private extractSchemaName(igluUri: string): string {
        // Extract schema name from Iglu URI like "iglu:com.example/campaign_click/jsonschema/1-0-0"
        const parts = igluUri.split('/');
        if (parts.length >= 2) {
            const vendor = parts[0].replace('iglu:', '');
            const name = parts[1];
            return `${vendor.split('.').pop()}/${name}`;
        }
        return igluUri;
    }

    private findDataStructureFile(igluUri: string): string | null {
        if (!this.workspaceRoot || !igluUri.startsWith('iglu:')) {
            return null;
        }

        // Parse Iglu URI: iglu:com.example/campaign_click/jsonschema/1-0-0
        const uriParts = igluUri.replace('iglu:', '').split('/');
        if (uriParts.length < 4) {
            return null;
        }

        const vendor = uriParts[0];
        const name = uriParts[1];
        const version = uriParts[3];

        const dataStructuresDir = path.join(this.workspaceRoot, 'data-structures', vendor);
        
        // Try different possible file paths
        const possiblePaths = [
            path.join(dataStructuresDir, name, `${version}.json`),
            path.join(dataStructuresDir, name, `${version}.yaml`),
            path.join(dataStructuresDir, name, `${version}.yml`),
            path.join(dataStructuresDir, `${name}_${version}.json`),
            path.join(dataStructuresDir, `${name}_${version}.yaml`),
            path.join(dataStructuresDir, `${name}_${version}.yml`),
            path.join(dataStructuresDir, `${name}.json`),
            path.join(dataStructuresDir, `${name}.yaml`),
            path.join(dataStructuresDir, `${name}.yml`)
        ];

        // Check if any of these files exist
        for (const filePath of possiblePaths) {
            if (fs.existsSync(filePath)) {
                return filePath;
            }
        }

        return null;
    }

}

export class SnowplowStatusManager {
    private statusBarItem: vscode.StatusBarItem;
    private static instance: SnowplowStatusManager;

    private constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'snowplow.refresh';
        this.updateStatus('ready');
        this.statusBarItem.show();
    }

    static getInstance(): SnowplowStatusManager {
        if (!SnowplowStatusManager.instance) {
            SnowplowStatusManager.instance = new SnowplowStatusManager();
        }
        return SnowplowStatusManager.instance;
    }

    updateStatus(status: 'ready' | 'validating' | 'publishing' | 'error', message?: string) {
        switch (status) {
            case 'ready':
                this.statusBarItem.text = '$(snowflake) Snowplow Ready';
                this.statusBarItem.tooltip = 'Snowplow CLI is ready. Click to refresh assets.';
                this.statusBarItem.backgroundColor = undefined;
                break;
            case 'validating':
                this.statusBarItem.text = '$(sync~spin) Validating...';
                this.statusBarItem.tooltip = 'Validating Snowplow assets...';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'publishing':
                this.statusBarItem.text = '$(cloud-upload) Publishing...';
                this.statusBarItem.tooltip = 'Publishing Snowplow assets...';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
                break;
            case 'error':
                this.statusBarItem.text = '$(error) Snowplow Error';
                this.statusBarItem.tooltip = message || 'Error in Snowplow operation. Click to refresh.';
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                break;
        }
    }

    dispose() {
        this.statusBarItem.dispose();
    }
}

// Auto-refresh functionality
export function setupAutoRefresh(provider: SnowplowAssetProvider) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/{data-products,data-structures}/**/*.{json,yaml,yml}');
    
    watcher.onDidCreate(() => {
        provider.refresh();
        vscode.window.showInformationMessage('📁 New Snowplow asset detected - Explorer refreshed');
    });
    
    watcher.onDidDelete(() => {
        provider.refresh();
        vscode.window.showInformationMessage('🗑️ Snowplow asset deleted - Explorer refreshed');
    });
    
    watcher.onDidChange(() => {
        provider.refresh();
    });
    
    // Also watch for new vendor directories being created
    const vendorWatcher = vscode.workspace.createFileSystemWatcher('**/data-structures/*/', false, true, false);
    
    vendorWatcher.onDidCreate(() => {
        provider.refresh();
        vscode.window.showInformationMessage('📁 New vendor directory detected - Explorer refreshed');
    });
    
    vendorWatcher.onDidDelete(() => {
        provider.refresh();
        vscode.window.showInformationMessage('🗑️ Vendor directory deleted - Explorer refreshed');
    });
    
    return [watcher, vendorWatcher];
}