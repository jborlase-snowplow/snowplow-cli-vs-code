// Initialize VS Code API
const vscode = acquireVsCodeApi();

// Initialize debounced preview update
let previewUpdateTimeout;
let isUpdatingPreview = false;

// Property management functions
function addProperty() {
    const container = document.getElementById('properties-container');
    const propertyHtml = PROPERTY_TEMPLATE.replace(/COUNTER/g, propertyCounter);
    container.insertAdjacentHTML('beforeend', propertyHtml);
    propertyCounter++;
    
    console.log('Added property with counter:', propertyCounter - 1);
    
    // Add event listeners to the new property fields
    const newProperty = document.getElementById(`property-${propertyCounter - 1}`);
    if (newProperty) {
        const inputs = newProperty.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', updatePreview);
            input.addEventListener('input', updatePreview);
        });
    }
    
    updatePreview();
}

function duplicateProperty(index) {
    const originalProperty = document.getElementById(`property-${index}`);
    if (!originalProperty) return;
    
    const container = document.getElementById('properties-container');
    const propertyHtml = PROPERTY_TEMPLATE.replace(/COUNTER/g, propertyCounter);
    container.insertAdjacentHTML('beforeend', propertyHtml);
    
    // Copy values from original property
    const originalInputs = originalProperty.querySelectorAll('input, select, textarea');
    const newProperty = document.getElementById(`property-${propertyCounter}`);
    const newInputs = newProperty.querySelectorAll('input, select, textarea');
    
    originalInputs.forEach((input, i) => {
        if (newInputs[i]) {
            if (input.type === 'checkbox') {
                newInputs[i].checked = input.checked;
            } else {
                newInputs[i].value = input.value;
            }
        }
    });
    
    // Update name to indicate it's a copy
    const nameInput = newProperty.querySelector('.field-name-input');
    if (nameInput && nameInput.value) {
        nameInput.value = nameInput.value + '_copy';
    }
    
    // If original property has constraints visible, show them for the new property too
    const originalConstraints = originalProperty.querySelector('.field-constraints');
    const newConstraints = newProperty.querySelector('.field-constraints');
    if (originalConstraints && newConstraints && originalConstraints.style.display !== 'none') {
        newConstraints.style.display = 'block';
        // Update constraint sections visibility based on current type
        const typeSelect = newProperty.querySelector('.field-type-select');
        if (typeSelect) {
            updatePropertyConstraints(propertyCounter, typeSelect.value);
        }
    }
    
    // Add event listeners to the duplicated property fields
    const duplicatedInputs = newProperty.querySelectorAll('input, select, textarea');
    duplicatedInputs.forEach(input => {
        input.addEventListener('change', updatePreview);
        input.addEventListener('input', updatePreview);
    });
    
    propertyCounter++;
    console.log('Duplicated property, new counter:', propertyCounter - 1);
    updatePreview();
}

function removeProperty(index) {
    const propertyElement = document.getElementById(`property-${index}`);
    if (propertyElement) {
        console.log('Removing property with index:', index);
        propertyElement.remove();
        updatePreview();
    } else {
        console.warn('Could not find property element to remove:', index);
    }
}

function updatePropertyConstraints(index, type) {
    // Show/hide constraint sections based on property type
    const constraintsContainer = document.getElementById(`constraints-${index}`);
    if (!constraintsContainer) return;
    
    const stringConstraints = constraintsContainer.querySelector('.string-constraints');
    const numberConstraints = constraintsContainer.querySelector('.number-constraints');
    const arrayConstraints = constraintsContainer.querySelector('.array-constraints');
    
    // Hide all constraint sections first
    if (stringConstraints) stringConstraints.style.display = 'none';
    if (numberConstraints) numberConstraints.style.display = 'none';
    if (arrayConstraints) arrayConstraints.style.display = 'none';
    
    // Show relevant constraint section based on type
    switch (type) {
        case 'string':
            if (stringConstraints) stringConstraints.style.display = 'block';
            break;
        case 'number':
        case 'integer':
            if (numberConstraints) numberConstraints.style.display = 'block';
            break;
        case 'array':
            if (arrayConstraints) arrayConstraints.style.display = 'block';
            break;
    }
    
    updatePreview();
}

function togglePropertyConstraints(index) {
    const constraintsContainer = document.getElementById(`constraints-${index}`);
    if (!constraintsContainer) return;
    
    const isVisible = constraintsContainer.style.display !== 'none';
    
    if (isVisible) {
        constraintsContainer.style.display = 'none';
    } else {
        constraintsContainer.style.display = 'block';
        // Update constraint sections visibility based on current type
        const typeSelect = document.querySelector(`select[name="properties[${index}][type]"]`);
        if (typeSelect) {
            updatePropertyConstraints(index, typeSelect.value);
        }
    }
}

// Form data collection
function getFormData() {
    try {
        const formData = new FormData(document.getElementById('dataStructureForm'));
        const data = {
            name: formData.get('name') || document.getElementById('name')?.value || '',
            vendor: formData.get('vendor') || document.getElementById('vendor')?.value || '',
            version: formData.get('version') || document.getElementById('version')?.value || '',
            description: formData.get('description') || document.getElementById('description')?.value || '',
            hidden: formData.get('hidden') === 'on' || document.getElementById('hidden')?.checked || false,
            allowAdditionalProperties: formData.get('allowAdditionalProperties') === 'on' || document.getElementById('allowAdditionalProperties')?.checked || true,
            properties: []
        };

        console.log('Basic form data collected:', { 
            name: data.name, 
            vendor: data.vendor, 
            version: data.version,
            propertyCount: document.querySelectorAll('.field-row').length
        });

        // Collect properties from field rows
        const propertyRows = document.querySelectorAll('.field-row');
        propertyRows.forEach((row, index) => {
            const nameInput = row.querySelector('.field-name-input');
            const typeSelect = row.querySelector('.field-type-select');
            const requiredCheckbox = row.querySelector('input[name*="[required]"]');
            const nullableCheckbox = row.querySelector('input[name*="[nullable]"]');
            const descriptionInput = row.querySelector('input[name*="[description]"]');
            
            if (!nameInput || !typeSelect || !nameInput.value || !typeSelect.value) {
                console.log(`Skipping incomplete property at index ${index}:`, {
                    hasName: !!nameInput?.value,
                    hasType: !!typeSelect?.value
                });
                return; // Skip incomplete properties
            }

            const property = {
                name: nameInput.value,
                type: typeSelect.value,
                description: descriptionInput?.value || '',
                required: requiredCheckbox?.checked || false,
                nullable: nullableCheckbox?.checked || false
            };

            console.log(`Collected property ${index}:`, property);

            // Add type-specific constraints
            const constraintInputs = row.querySelectorAll('input[name*="["], select[name*="["]');
            constraintInputs.forEach(input => {
                const nameAttr = input.name || '';
                const match = nameAttr.match(/\[([^\]]+)\]$/);
                if (match && match[1] && !['name', 'type', 'description', 'required', 'nullable'].includes(match[1])) {
                    const constraintName = match[1];
                    if (input.type === 'checkbox') {
                        if (input.checked) {
                            property[constraintName] = true;
                        }
                    } else if (input.value && input.value.trim() !== '') {
                        // Handle special cases
                        if (constraintName === 'enumValues') {
                            property[constraintName] = input.value.split(',').map(v => v.trim()).filter(v => v);
                        } else if (['minimum', 'maximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems'].includes(constraintName)) {
                            const numValue = parseFloat(input.value);
                            if (!isNaN(numValue)) {
                                property[constraintName] = numValue;
                            }
                        } else {
                            property[constraintName] = input.value;
                        }
                    }
                }
            });

            data.properties.push(property);
        });

        console.log('Final form data:', data);
        return data;
    } catch (error) {
        console.error('Error collecting form data:', error);
        // Return minimal data to prevent complete failure
        return {
            name: document.getElementById('name')?.value || 'untitled',
            vendor: document.getElementById('vendor')?.value || 'com.example',
            version: document.getElementById('version')?.value || '1-0-0',
            description: '',
            hidden: false,
            allowAdditionalProperties: true,
            properties: []
        };
    }
}

// Main action functions
function validateForm() {
    const data = getFormData();
    vscode.postMessage({
        command: 'validate',
        data: data
    });
}

function previewSchema() {
    const data = getFormData();
    vscode.postMessage({
        command: 'preview',
        data: data,
        format: data.outputFormat
    });
}

function saveDataStructure() {
    const data = getFormData();
    vscode.postMessage({
        command: 'save',
        data: data
    });
}

// Message handling from extension
window.addEventListener('message', event => {
    const message = event.data;
    console.log('Received message from extension:', message);
    
    switch (message.command) {
        case 'validationResult':
            showValidationResults(message.data);
            break;
        case 'showPreview':
            console.log('Showing preview with data:', message.data, 'format:', message.format);
            showSchemaPreview(message.data, message.format);
            // Reset the update flag
            isUpdatingPreview = false;
            break;
        default:
            console.log('Unknown message command:', message.command);
    }
});

// Display functions
function showValidationResults(validation) {
    const container = document.getElementById('validation-results');
    let html = '';

    if (validation.errors.length > 0) {
        html += `<div class="validation-errors">
            <h4>❌ Errors:</h4>
            <ul>${validation.errors.map(error => `<li>${error}</li>`).join('')}</ul>
        </div>`;
    }

    if (validation.warnings.length > 0) {
        html += `<div class="validation-warnings">
            <h4>⚠️ Warnings:</h4>
            <ul>${validation.warnings.map(warning => `<li>${warning}</li>`).join('')}</ul>
        </div>`;
    }

    if (validation.isValid && validation.warnings.length === 0) {
        html = '<div style="color: var(--vscode-testing-iconPassed); font-weight: bold;">✅ Validation passed!</div>';
    }

    container.innerHTML = html;
}

function showSchemaPreview(schemaData, format) {
    try {
        console.log('showSchemaPreview called with:', { schemaData, format, currentFormat });
        
        // Check if this is an error response
        if (schemaData && schemaData.error) {
            displayPreviewError(schemaData.error);
            return;
        }
        
        let content;
        
        // Always use the current format setting, not the format parameter
        if (currentFormat === 'yaml') {
            // Convert JSON to YAML for preview
            try {
                const yaml = require('js-yaml');
                content = yaml.dump(schemaData, { 
                    indent: 2, 
                    lineWidth: -1,
                    noRefs: true,
                    sortKeys: false 
                });
            } catch (yamlError) {
                console.warn('js-yaml not available, using fallback JSON-to-YAML conversion:', yamlError);
                // Fallback to simple JSON-to-YAML conversion
                content = jsonToYaml(schemaData);
            }
        } else {
            content = JSON.stringify(schemaData, null, 2);
        }
        
        console.log('Generated preview content:', content.substring(0, 200) + '...');
        
        // Update the preview content
        const codeElement = document.getElementById('schema-code');
        if (!codeElement) {
            console.error('Could not find schema-code element');
            return;
        }
        
        codeElement.textContent = content;
        
        // Update validation status
        updateValidationStatusFromSchema(schemaData);
        
        console.log('Preview updated successfully');
        
    } catch (error) {
        console.error('Error displaying schema preview:', error);
        displayPreviewError('Failed to display preview: ' + error.message);
    }
}

function updateValidationStatusFromSchema(schema) {
    const statusElement = document.getElementById('validation-status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    
    // Validate the schema structure
    const isValid = schema && 
                   schema.self && 
                   schema.self.name && 
                   schema.self.vendor && 
                   schema.self.version &&
                   schema.properties;
    
    if (isValid) {
        statusIcon.textContent = '✅';
        statusText.textContent = 'Valid schema';
        statusElement.className = 'validation-status valid';
    } else {
        statusIcon.textContent = '❌';
        statusText.textContent = 'Invalid schema - missing required fields';
        statusElement.className = 'validation-status invalid';
    }
}

// YAML conversion utility
function jsonToYaml(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let yaml = '';
    
    for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            yaml += `${spaces}${key}:\n`;
            yaml += jsonToYaml(value, indent + 1);
        } else if (Array.isArray(value)) {
            yaml += `${spaces}${key}:\n`;
            value.forEach(item => {
                if (typeof item === 'object') {
                    yaml += `${spaces}  -\n`;
                    yaml += jsonToYaml(item, indent + 2);
                } else {
                    yaml += `${spaces}  - ${item}\n`;
                }
            });
        } else {
            const valueStr = typeof value === 'string' ? `"${value}"` : value;
            yaml += `${spaces}${key}: ${valueStr}\n`;
        }
    }
    
    return yaml;
}

// Live preview functionality
function updatePreview() {
    // Prevent overlapping updates
    clearTimeout(previewUpdateTimeout);
    
    previewUpdateTimeout = setTimeout(() => {
        if (isUpdatingPreview) {
            console.log('Preview update already in progress, skipping...');
            return;
        }
        
        isUpdatingPreview = true;
        
        try {
            const data = getFormData();
            
            // Add debug logging
            console.log('Updating preview with data:', data);
            console.log('Current format:', currentFormat);
            
            // Use the extension's generateDataStructureJson function instead of local one
            vscode.postMessage({
                command: 'preview',
                data: data,
                format: currentFormat
            });
        } catch (error) {
            console.error('Error updating preview:', error);
            // Show error in preview
            displayPreviewError('Error generating preview: ' + error.message);
            isUpdatingPreview = false;
        }
    }, 300); // Increased debounce time for more stable updates
}

function displayPreviewError(errorMessage) {
    const codeElement = document.getElementById('schema-code');
    codeElement.textContent = `// Error: ${errorMessage}\n// Please check your schema configuration`;
    
    const statusElement = document.getElementById('validation-status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    
    statusIcon.textContent = '❌';
    statusText.textContent = 'Preview error';
    statusElement.className = 'validation-status invalid';
    
    // Reset update flag on error
    isUpdatingPreview = false;
}

function displayPreview(schema) {
    // This function is now handled by showSchemaPreview
    // Keeping for backward compatibility but redirecting to the new function
    showSchemaPreview(schema, currentFormat);
}

// Preview format switching
function switchPreviewFormat(format) {
    if (currentFormat === format) {
        console.log('Format already set to', format);
        return; // No change needed
    }
    
    console.log('Switching preview format from', currentFormat, 'to', format);
    currentFormat = format;
    
    // Update tab states
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    const activeTab = document.querySelector(`[data-format="${format}"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Force immediate update for format changes
    updatePreview();
}

// Copy and download functionality
function copySchema() {
    const schemaCode = document.getElementById('schema-code');
    const text = schemaCode.textContent;
    
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Schema copied to clipboard!');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Schema copied to clipboard!');
    });
}

function showNotification(message) {
    // Create a simple notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--vscode-notifications-background);
        color: var(--vscode-notifications-foreground);
        padding: 12px 16px;
        border-radius: 4px;
        border: 1px solid var(--vscode-notifications-border);
        z-index: 1000;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Initialize constraint sections for existing properties
function initializeConstraintSections() {
    // Go through all existing property rows and set up their constraint sections
    const propertyRows = document.querySelectorAll('.field-row');
    propertyRows.forEach((row) => {
        const typeSelect = row.querySelector('.field-type-select');
        if (typeSelect && typeSelect.value) {
            const match = row.id.match(/property-(\d+)/);
            if (match) {
                const index = match[1];
                // Initialize constraint sections but keep them hidden initially
                updatePropertyConstraints(index, typeSelect.value);
                // Hide the constraints section
                const constraintsContainer = document.getElementById(`constraints-${index}`);
                if (constraintsContainer) {
                    constraintsContainer.style.display = 'none';
                }
            }
        }
    });
}

// DOM ready initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing editor...');
    
    // Initialize existing properties
    initializeConstraintSections();
    
    // Add event listeners to basic form fields
    const basicFields = ['name', 'vendor', 'version', 'description', 'hidden', 'allowAdditionalProperties'];
    basicFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', updatePreview);
            field.addEventListener('input', updatePreview);
        }
    });
    
    // Add event listeners to existing property fields
    document.querySelectorAll('.field-row').forEach(row => {
        const inputs = row.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('change', updatePreview);
            input.addEventListener('input', updatePreview);
        });
    });
    
    // Set up schema type selection
    document.querySelectorAll('.schema-badge').forEach(badge => {
        badge.addEventListener('click', function() {
            document.querySelectorAll('.schema-badge').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            updatePreview();
        });
    });
    
    // Set up preview format tabs
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const format = this.dataset.format;
            console.log('Preview tab clicked:', format);
            switchPreviewFormat(format);
        });
    });
    
    // Ensure the correct tab is marked as active on load
    const activeTab = document.querySelector('.preview-tab.active');
    if (activeTab) {
        currentFormat = activeTab.dataset.format || 'json';
        console.log('Set initial format from active tab:', currentFormat);
    }
    
    // Initial preview update with a small delay to ensure DOM is fully ready
    setTimeout(() => {
        console.log('Triggering initial preview update...');
        updatePreview();
    }, 100);
});
