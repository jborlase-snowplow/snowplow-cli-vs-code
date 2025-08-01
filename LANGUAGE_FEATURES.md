# Snowplow Data Structure Language Features

This document describes the language features provided by the Snowplow VS Code Extension for data structure files.

## Overview

The extension provides rich language support for Snowplow data structure files in both JSON and YAML formats. These features include:

- **Intelligent Code Completion**: Context-aware suggestions for Snowplow schema properties
- **Real-time Validation**: Immediate feedback on schema correctness
- **Hover Documentation**: Contextual help for schema properties
- **Code Actions**: Quick fixes for common issues

## Supported File Types

The language features activate for files:
- Located in `data-structures/` folders
- With `.json`, `.yaml`, or `.yml` extensions
- Containing Snowplow schema structure (detected automatically)

## Features

### 1. Code Completion

The extension provides intelligent code completion based on context:

#### Root Level Properties
- `apiVersion`: API version (currently "v1")
- `resourceType`: Resource type ("data-structure")
- `meta`: Metadata object with schema configuration
- `data`: The actual JSON schema definition

#### Meta Section Properties
- `hidden`: Whether to hide in BDP Console
- `schemaType`: Schema type ("event" or "entity")
- `customData`: Custom metadata object

#### Self Section Properties
- `vendor`: Vendor in reverse domain notation (e.g., "com.example")
- `name`: Schema name (lowercase, underscores)
- `format`: Schema format ("jsonschema")
- `version`: Schema version in SchemaVer format (e.g., "1-0-0")

#### Property Definitions
- Quick snippets for common property types (string, number, enum)
- JSON Schema type suggestions
- Property constraint suggestions

### 2. Real-time Validation

The extension validates:
- **Required Fields**: Ensures all mandatory Snowplow fields are present
- **Field Values**: Validates correct values for apiVersion, resourceType, etc.
- **Schema Types**: Ensures schemaType is either "event" or "entity"
- **Format Validation**: Checks vendor format, version format, and naming conventions
- **JSON/YAML Syntax**: Validates file syntax for both formats

### 3. Hover Documentation

Hover over any property to see:
- **Property Description**: What the property represents
- **Expected Values**: Valid values or formats
- **Usage Context**: When and how to use the property

### 4. Code Actions

Quick fixes for common issues:
- Add missing required fields (apiVersion, resourceType)
- Fix vendor format issues
- Correct schema type values

## Example Usage

### JSON Format
```json
{
  "apiVersion": "v1",
  "resourceType": "data-structure",
  "meta": {
    "hidden": false,
    "schemaType": "event",
    "customData": {}
  },
  "data": {
    "$schema": "http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#",
    "description": "User interaction event",
    "self": {
      "vendor": "com.example",
      "name": "user_interaction",
      "format": "jsonschema",
      "version": "1-0-0"
    },
    "type": "object",
    "properties": {
      "user_id": {
        "type": "string",
        "description": "Unique identifier for the user"
      },
      "action": {
        "type": "string",
        "enum": ["click", "view", "purchase"],
        "description": "The action performed"
      }
    },
    "required": ["user_id", "action"],
    "additionalProperties": false
  }
}
```

### YAML Format
```yaml
apiVersion: v1
resourceType: data-structure
meta:
  hidden: false
  schemaType: entity
  customData: {}
data:
  $schema: http://iglucentral.com/schemas/com.snowplowanalytics.self-desc/schema/jsonschema/1-0-0#
  description: Product entity
  self:
    vendor: com.example
    name: product_entity
    format: jsonschema
    version: 1-0-0
  type: object
  properties:
    product_id:
      type: string
      description: Unique product identifier
    name:
      type: string
      description: Product name
    category:
      type: string
      enum: [electronics, clothing, books]
      description: Product category
  required: 
    - product_id
    - name
  additionalProperties: false
```

## Validation Rules

The extension enforces Snowplow CLI schema requirements:

1. **apiVersion** must be "v1"
2. **resourceType** must be "data-structure"
3. **meta.schemaType** must be either "event" or "entity"
4. **data.self.vendor** must use reverse domain notation (letters, numbers, dots, hyphens)
5. **data.self.name** must use lowercase letters, numbers, underscores, and hyphens
6. **data.self.version** must follow SchemaVer format (X-Y-Z where X > 0)
7. **data.$schema** is required for JSON Schema validation

## Integration

The language features are automatically activated when the extension loads and will work seamlessly with:
- VS Code's built-in JSON and YAML support
- The Snowplow data structure editor
- The Snowplow CLI validation commands
- Git integration and version control

## Troubleshooting

If language features aren't working:
1. Ensure the file is in a `data-structures/` folder or contains Snowplow schema structure
2. Check that the file extension is `.json`, `.yaml`, or `.yml`
3. Verify VS Code recognizes the file language (shown in status bar)
4. Restart VS Code if features seem unresponsive

For more help, use the Snowplow extension commands in the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).
