# Snowplow VS Code Extension

A comprehensive development environment for Snowplow data structures and data products with intelligent language features, advanced schema analysis, and powerful visualization tools.

## ✨ Key Features

### 🚀 Intelligent Development Experience
- **Smart Code Completion**: Context-aware auto-completion for JSON/YAML schemas
- **Real-time Validation**: Instant feedback with Snowplow-specific validation rules
- **Hover Documentation**: Rich information on field types, constraints, and examples
- **Quick Fixes**: Automated code actions for common schema issues

### 📊 Advanced Schema Analysis
- **Schema Metrics**: Complexity analysis, depth calculation, and optimization suggestions
- **Dependency Tracking**: Visualize relationships between schemas and dependencies
- **Test Data Generation**: Create sample data matching your schema constraints
- **Format Conversion**: Seamlessly convert between JSON and YAML formats

### 🎯 Visual Schema Explorer
- **Interactive Tree View**: Navigate schema structure with expandable property trees
- **Smart Navigation**: Click to jump directly to schema properties in your editor
- **Type Visualization**: Color-coded icons for different data types and constraints
- **Real-time Sync**: Automatically updates as you edit your schemas

### 🎨 Enhanced Syntax Highlighting
- **Custom Grammar**: Specialized TextMate grammars for Snowplow schemas
- **Semantic Tokens**: Rich highlighting for Snowplow-specific fields and values
- **Theme Support**: Beautiful syntax highlighting with custom Snowplow theme

### ⚡ Performance Optimized
- **Debounced Validation**: Smart validation delays to reduce CPU usage
- **Intelligent Caching**: Parsed schema caching with content-based invalidation
- **Background Processing**: Non-blocking operations with progress indicators

## 🏗️ Supported File Structures

### Data Structures
```
data-structures/
├── com.example/
│   ├── page_view/
│   │   └── jsonschema/
│   │       └── 1-0-0.json
│   └── user_signup.yaml
```

### Data Products
```
data-products/
├── marketing/
│   └── customer-journey.json
└── ecommerce/
    └── purchase-events.yaml
```

## 🚦 Getting Started

1. **Open a Snowplow Project**: Open any folder containing `data-structures/` or `data-products/` directories
2. **Explore the Sidebar**: Use the Snowplow Explorer in the sidebar to navigate your schemas
3. **Edit with Intelligence**: Open any `.json` or `.yaml` file to experience smart completion and validation
4. **Visualize Schemas**: Right-click any schema file → "Analyze Schema" for detailed insights

## 📋 Command Palette

Access powerful features through VS Code's Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Snowplow: Analyze Schema` - Generate detailed schema analysis report
- `Snowplow: Convert JSON/YAML Format` - Convert between formats
- `Snowplow: Generate Test Data` - Create sample data for testing
- `Snowplow: Visualize Current Schema` - Open schema tree view
- `Snowplow: Edit Data Structure with Form` - Visual schema editor

## 🔧 Context Menus

Right-click on schema files in the Explorer for quick access to:
- **Schema Analysis**: Deep dive into schema complexity and structure
- **Format Conversion**: Quick JSON ↔ YAML conversion
- **Test Data Generation**: Generate sample data for validation
- **Visual Editor**: Form-based schema editing experience

## ⌨️ Keyboard Shortcuts

| Action | Windows/Linux | macOS |
|--------|---------------|-------|
| Validate Current File | `Ctrl+Shift+V` | `Cmd+Shift+V` |
| Publish Current File | `Ctrl+Shift+P` | `Cmd+Shift+P` |

## 🎯 Advanced Features

### Schema Analysis Report
Generate comprehensive reports including:
- **Complexity Metrics**: Depth, property count, required field ratios
- **Optimization Suggestions**: Identify redundant or overly complex structures
- **Validation Insights**: Common patterns and potential issues

### Dependency Visualization
Understand schema relationships with:
- **Reference Tracking**: See which schemas reference others
- **Dependency Graphs**: Visual representation of schema interconnections
- **Version Management**: Track schema evolution across versions

### Performance Monitoring
Built-in performance optimizations:
- **Smart Caching**: Content-aware caching reduces parsing overhead
- **Debounced Validation**: Configurable delay prevents excessive CPU usage
- **Background Processing**: Long operations run with progress indicators

## 🔧 Configuration

The extension works out-of-the-box but can be customized:

```json
{
  "snowplow.snowplowCliPath": "/path/to/snowplow",
  "snowplow.validationDelay": 500
}
```

## 🐛 Troubleshooting

### Language Features Not Working?
- Ensure files are in `data-structures/` or `data-products/` directories
- Check file extensions (`.json`, `.yaml`, `.yml`)
- Restart VS Code if needed

### Performance Issues?
- Use schema analysis to identify complex structures
- Consider breaking large schemas into smaller components
- Clear extension cache by restarting VS Code

## 📚 Resources

- [Complete Usage Guide](./COMPLETE_USAGE_GUIDE.md) - Detailed feature documentation
- [Schema Visualization Guide](./SCHEMA_VISUALIZATION_GUIDE.md) - Tree view and navigation
- [Syntax Highlighting Test](./SYNTAX_HIGHLIGHTING_TEST.md) - Test highlighting features

## 🚀 Development

### Prerequisites
- Node.js 16+
- VS Code 1.89+

### Setup
```bash
npm install
npm run compile
```

### Debug
Use the provided launch configurations:
- **Run Extension**: Launch development instance
- **Extension Tests**: Run test suite

## 📝 License

This extension is built for the Snowplow community to enhance the development experience with intelligent tooling and seamless integration.

---

**Experience the future of Snowplow schema development with intelligent assistance, powerful analysis, and beautiful visualization.**
