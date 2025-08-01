# Snowplow VS Code Extension - Complete Usage Guide

## Overview

The Snowplow VS Code Extension provides comprehensive development tools for working with Snowplow data structures and data products, including intelligent code completion, validation, visualization, and advanced schema analysis features.

## Features

### 🔧 Core Development Tools

#### Data Structure Editor
- **Command**: `Snowplow: Edit Data Structure with Form`
- **Purpose**: Visual form-based editor for creating and editing Snowplow data structures
- **Usage**: Right-click on a data structure file → "Edit Data Structure with Form"

#### CLI Integration
- **Validate**: `Snowplow: Validate File` - Validates schemas against Snowplow CLI
- **Publish**: `Snowplow: Publish File` - Publishes schemas to Snowplow
- **Bulk Operations**: Validate/publish all data structures or data products at once

### 🧠 Language Features (LSP)

#### Intelligent Code Completion
- **JSON/YAML Support**: Auto-completion for both formats
- **Context-Aware**: Provides only relevant fields based on current cursor position and document structure
- **Schema Types**: Smart completion for data structures and data products
- **Performance**: Debounced validation (500ms delay) with caching
- **Precise Context Detection**: Advanced parsing determines exact completion context (root, meta, self, properties, etc.)
- **YAML Key/Value Detection**: Distinguishes between key completions and value completions in YAML files
- **Section-Specific Completions**: Only shows completions relevant to the current section being edited

#### Real-time Validation
- **Syntax Checking**: JSON/YAML syntax validation
- **Schema Validation**: Snowplow-specific field validation
- **Data Product Validation**: UUID, email, Iglu URI format checking
- **Error Highlighting**: Inline error display with suggestions

#### Hover Information
- **Field Documentation**: Hover over fields for detailed descriptions
- **Type Information**: Shows expected data types and constraints
- **Examples**: Provides usage examples for complex fields

#### Code Actions (Quick Fixes)
- **Fix Vendor Format**: Automatically suggests correct vendor formats
- **Add Missing Fields**: Quick actions to add required fields
- **Format Corrections**: Auto-fix common formatting issues

### 📊 Schema Visualization

#### Interactive Tree View
- **Real-time Updates**: Automatically updates when editing schemas
- **Property Navigation**: Click to navigate to specific schema properties
- **Type Icons**: Visual indicators for different data types
- **Required Fields**: Special marking for required properties
- **Constraints**: Visual indicators for field constraints

#### Commands
- `Snowplow: Visualize Current Schema` - Focus on current file
- `Snowplow: Refresh Schema Visualization` - Manual refresh
- `Snowplow: Navigate to Property` - Jump to specific property

### 🔍 Schema Analysis (Advanced)

#### Schema Metrics
- **Command**: `Snowplow: Analyze Schema`
- **Metrics**: Complexity, depth, property count, required ratio
- **Report**: Generates detailed markdown analysis report

#### Format Conversion
- **Command**: `Snowplow: Convert JSON/YAML Format`
- **Purpose**: Convert between JSON and YAML formats
- **Preserves**: All data structure and formatting

#### Test Data Generation
- **Command**: `Snowplow: Generate Test Data`
- **Purpose**: Generate sample data based on schema structure
- **Output**: Valid JSON test data matching schema constraints

#### Schema Dependencies
- **Command**: `Snowplow: Show Schema Dependencies`
- **Purpose**: Analyze relationships between schemas
- **Visualization**: Dependency graph and reference tracking

#### Schema Optimization
- **Command**: `Snowplow: Optimize Schema`
- **Purpose**: Suggest improvements for schema efficiency
- **Analysis**: Identifies redundant fields and optimization opportunities

### 🎨 Syntax Highlighting

#### Enhanced JSON/YAML Highlighting
- **Grammar Injection**: Custom TextMate grammars for Snowplow schemas
- **Semantic Tokens**: Special highlighting for Snowplow-specific fields
- **Theme Support**: Custom "Snowplow Syntax" theme available

#### Special Highlighting
- **API Versions**: Highlighted version numbers
- **Resource Types**: Special formatting for Snowplow resource types
- **Iglu URIs**: Regex-style highlighting for schema identifiers
- **Schema Types**: Distinguished highlighting for event/entity types

## File Structure Support

### Data Structures
```
data-structures/
├── com.example/
│   ├── event_name/
│   │   └── jsonschema/
│   │       └── 1-0-0.json
│   └── entity_name.yaml
```

### Data Products
```
data-products/
├── marketing/
│   └── campaigns.json
└── ecommerce/
    └── interactions.yaml
```

## Configuration

### Language Association
The extension automatically recognizes:
- **Data Structures**: Files in `**/data-structures/**` folders
- **Data Products**: Files in `**/data-products/**` folders
- **Formats**: Both `.json` and `.yaml`/`.yml` files

### Validation Schemas
- **JSON Schema**: `/schemas/snowplow-data-structure-schema.json`
- **Data Product Schema**: `/schemas/snowplow-data-product-schema.json`

## Performance Features

### Debounced Validation
- **Delay**: 500ms after typing stops
- **Purpose**: Reduces CPU usage during active editing
- **Cache**: Parsed schemas cached with content hashing

### Smart Caching
- **Schema Cache**: Parsed schemas cached to avoid re-parsing
- **Cache Size**: Limited to 50 entries (LRU eviction)
- **Performance**: Significantly faster validation and completion

## Keyboard Shortcuts

| Command | Windows/Linux | macOS |
|---------|---------------|-------|
| Validate Current File | `Ctrl+Shift+V` | `Cmd+Shift+V` |
| Publish Current File | `Ctrl+Shift+P` | `Cmd+Shift+P` |

## Commands Reference

### File Operations
- `snowplow.validateFile` - Validate selected file
- `snowplow.publishFile` - Publish selected file
- `snowplow.validateCurrentFile` - Validate active file
- `snowplow.publishCurrentFile` - Publish active file

### Generation
- `snowplow.generateDataStructure` - Create new data structure
- `snowplow.generateDataProduct` - Create new data product
- `snowplow.editDataStructure` - Open form editor

### Analysis
- `snowplow.analyzeSchema` - Generate schema analysis
- `snowplow.convertFormat` - Convert JSON ↔ YAML
- `snowplow.generateTestData` - Create test data
- `snowplow.showSchemaDependencies` - Show dependency graph
- `snowplow.optimizeSchema` - Schema optimization suggestions

### Visualization
- `snowplow.visualizeCurrentSchema` - Show schema tree
- `snowplow.refreshSchemaVisualization` - Refresh tree view
- `snowplow.navigateToProperty` - Jump to property

### Bulk Operations
- `snowplow.validateAllDataStructures` - Validate all data structures
- `snowplow.publishAllDataStructuresToDev` - Publish all to dev
- `snowplow.publishAllDataStructuresToProd` - Publish all to prod
- `snowplow.validateAllDataProducts` - Validate all data products
- `snowplow.publishAllDataProducts` - Publish all data products

## Troubleshooting

### Common Issues

1. **Language Features Not Working**
   - Ensure files are in correct directories (`data-structures/` or `data-products/`)
   - Check file extensions (`.json`, `.yaml`, `.yml`)
   - Restart VS Code if needed

2. **Validation Errors**
   - Check JSON/YAML syntax first
   - Verify required Snowplow fields are present
   - Use hover information for field requirements

3. **Performance Issues**
   - Large schemas: Consider schema optimization
   - Frequent validation: Adjust debounce delay in settings
   - Clear cache: Restart extension

### Debug Commands
- `snowplow.debugFileContext` - Shows current file context information
- Check VS Code Developer Console for detailed error logs

## Best Practices

### Schema Development
1. **Use Form Editor**: Start with the visual editor for structure
2. **Validate Early**: Use real-time validation during development
3. **Analyze Complexity**: Run schema analysis for optimization
4. **Test Data**: Generate test data to verify schema correctness

### Performance
1. **File Organization**: Keep schemas in appropriate directories
2. **Schema Size**: Consider breaking large schemas into smaller components
3. **Caching**: Let the extension cache parsed schemas for performance

### Team Collaboration
1. **Format Consistency**: Use format conversion for team standards
2. **Validation**: Always validate before committing
3. **Documentation**: Use hover information for field understanding

## Extension Development

### Debugging
Use the provided launch configurations in `.vscode/launch.json`:
- **Run Extension**: Launch extension in development mode
- **Extension Tests**: Run test suite

### Building
```bash
npm install
npm run compile
```

### Testing
```bash
npm test
```

## Contributing

The extension is built with modularity in mind:
- **Language Features**: `src/languageFeatures.ts`
- **Schema Visualization**: `src/schemaVisualization.ts`
- **Schema Analysis**: `src/schemaAnalyzer.ts`
- **Form Editor**: `media/` directory
- **CLI Integration**: `src/snowplow.ts`

Each module can be extended independently while maintaining compatibility with the overall architecture.
