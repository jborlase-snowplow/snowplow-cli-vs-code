// Initialize VS Code API
const vscode = acquireVsCodeApi();

// Initialize debounced preview update
let previewUpdateTimeout;

// UUID generation utility
function generateUUID() {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    
    document.getElementById('resourceName').value = uuid;
    updatePreview();
}

// Source Application management
function addSourceApp() {
    const container = document.getElementById('source-apps-container');
    const sourceAppHtml = SOURCE_APP_TEMPLATE.replace(/COUNTER/g, sourceAppCounter);
    container.insertAdjacentHTML('beforeend', sourceAppHtml);
    sourceAppCounter++;
    updatePreview();
}

function removeSourceApp(index) {
    const sourceAppElement = document.getElementById(`source-app-${index}`);
    if (sourceAppElement) {
        sourceAppElement.remove();
        updatePreview();
    }
}

// Event Specification management
function addEventSpec() {
    const container = document.getElementById('event-specs-container');
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    
    const eventSpecHtml = EVENT_SPEC_TEMPLATE
        .replace(/COUNTER/g, eventSpecCounter)
        .replace(/EVENTSPEC_RESOURCE_NAME/g, uuid);
    
    container.insertAdjacentHTML('beforeend', eventSpecHtml);
    eventSpecCounter++;
    updatePreview();
}

function removeEventSpec(index) {
    const eventSpecElement = document.getElementById(`event-spec-${index}`);
    if (eventSpecElement) {
        eventSpecElement.remove();
        updatePreview();
    }
}

function generateEventSpecUUID(index) {
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    
    const resourceNameInput = document.getElementById(`eventspec-resourcename-${index}`);
    if (resourceNameInput) {
        resourceNameInput.value = uuid;
        updatePreview();
    }
}

// Entity management
function addEntity(eventSpecIndex, entityType) {
    const container = document.getElementById(`${entityType}-entities-${eventSpecIndex}`);
    const entityHtml = ENTITY_TEMPLATE
        .replace(/EVENTSPEC_COUNTER/g, eventSpecIndex)
        .replace(/ENTITY_TYPE/g, entityType)
        .replace(/ENTITY_COUNTER/g, entityCounter);
    
    container.insertAdjacentHTML('beforeend', entityHtml);
    entityCounter++;
    updatePreview();
}

function removeEntity(eventSpecIndex, entityType, entityIndex) {
    const entityElement = document.getElementById(`entity-${eventSpecIndex}-${entityType}-${entityIndex}`);
    if (entityElement) {
        entityElement.remove();
        updatePreview();
    }
}

function switchEntityTab(eventSpecIndex, entityType) {
    // Update tab states
    const tabs = document.querySelectorAll(`#event-spec-${eventSpecIndex} .entity-tab`);
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`#event-spec-${eventSpecIndex} [data-entity-type="${entityType}"]`).classList.add('active');
    
    // Show/hide entity lists
    const lists = document.querySelectorAll(`#event-spec-${eventSpecIndex} .entity-list`);
    lists.forEach(list => {
        list.style.display = 'none';
    });
    document.getElementById(`${entityType}-entities-${eventSpecIndex}`).style.display = 'flex';
}

// Form data collection
function getFormData() {
    const data = {
        apiVersion: 'v1',
        resourceType: 'data-product',
        resourceName: document.getElementById('resourceName')?.value || '',
        data: {
            name: document.getElementById('name')?.value || '',
            domain: document.getElementById('domain')?.value || '',
            owner: document.getElementById('owner')?.value || '',
            description: document.getElementById('description')?.value || '',
            sourceApplications: [],
            eventSpecifications: []
        }
    };

    // Collect source applications
    const sourceAppItems = document.querySelectorAll('.source-app-item');
    sourceAppItems.forEach(item => {
        const input = item.querySelector('input');
        if (input && input.value.trim()) {
            data.data.sourceApplications.push({
                '$ref': input.value.trim()
            });
        }
    });

    // Collect event specifications
    const eventSpecItems = document.querySelectorAll('.event-spec-card');
    eventSpecItems.forEach(item => {
        const resourceName = item.querySelector('[name*="resourceName"]')?.value || '';
        const name = item.querySelector('[name*="name"]')?.value || '';
        const descriptionTextarea = item.querySelector('[name*="description"]');
        const description = descriptionTextarea ? descriptionTextarea.value || '' : '';
        const eventSource = item.querySelector('[name*="eventSource"]')?.value || '';

        if (name) {
            const eventSpec = {
                resourceName: resourceName || generateUUID(),
                name,
                description,
                event: {
                    source: eventSource
                },
                entities: {
                    tracked: [],
                    enriched: []
                }
            };

            // Collect tracked entities
            const trackedEntities = item.querySelectorAll('.entity-item[data-entity-type="tracked"]');
            trackedEntities.forEach(entityItem => {
                const source = entityItem.querySelector('[name*="source"]')?.value || '';
                const minCardinality = entityItem.querySelector('[name*="minCardinality"]')?.value || '';
                const maxCardinality = entityItem.querySelector('[name*="maxCardinality"]')?.value || '';

                if (source) {
                    const entity = { source };
                    if (minCardinality) entity.minCardinality = parseInt(minCardinality);
                    if (maxCardinality) entity.maxCardinality = parseInt(maxCardinality);
                    eventSpec.entities.tracked.push(entity);
                }
            });

            // Collect enriched entities
            const enrichedEntities = item.querySelectorAll('.entity-item[data-entity-type="enriched"]');
            enrichedEntities.forEach(entityItem => {
                const source = entityItem.querySelector('[name*="source"]')?.value || '';
                if (source) {
                    eventSpec.entities.enriched.push({ source });
                }
            });

            data.data.eventSpecifications.push(eventSpec);
        }
    });

    return data;
}

// Main action functions
function validateForm() {
    const data = getFormData();
    vscode.postMessage({
        command: 'validate',
        data: data
    });
}

function saveDataProduct() {
    const data = getFormData();
    vscode.postMessage({
        command: 'save',
        data: data
    });
}

// Message handling from extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'validationResult':
            showValidationResults(message.data);
            break;
        case 'showPreview':
            showDataProductPreview(message.data, message.format);
            break;
        case 'dataStructures':
            populateDataStructures(message.data);
            break;
        case 'dataStructureCreated':
            if (message.data) {
                applyDataStructureSelection(message.data.igluUri);
                closeDataStructureModal();
                showNotification('Data structure created and selected successfully!');
                
                // Refresh the available structures list
                vscode.postMessage({
                    command: 'getDataStructures'
                });
            }
            break;
    }
});

// Display functions
function showValidationResults(validation) {
    const statusElement = document.getElementById('validation-status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    
    if (validation.isValid) {
        statusIcon.textContent = '✅';
        statusText.textContent = 'Valid data product';
        statusElement.className = 'validation-status valid';
    } else {
        statusIcon.textContent = '❌';
        statusText.textContent = `Invalid data product - ${validation.errors.length} error(s)`;
        statusElement.className = 'validation-status invalid';
    }
}

function showDataProductPreview(dataProductData, format) {
    const container = document.getElementById('dataproduct-preview');
    
    let content;
    if (format === 'json') {
        content = JSON.stringify(dataProductData, null, 2);
    } else {
        content = jsonToYaml(dataProductData);
    }
    
    container.innerHTML = `<code id="dataproduct-code">${content}</code>`;
}

// YAML conversion utility
function jsonToYaml(obj, indent = 0) {
    let yaml = '';
    const spaces = '  '.repeat(indent);
    
    if (obj === null) return 'null';
    if (typeof obj === 'undefined') return 'undefined';
    if (typeof obj === 'string') return obj.includes('\n') ? `|\n${obj.split('\n').map(line => '  ' + spaces + line).join('\n')}` : obj;
    if (typeof obj === 'number' || typeof obj === 'boolean') return obj.toString();
    
    if (Array.isArray(obj)) {
        if (obj.length === 0) return '[]';
        obj.forEach(item => {
            yaml += `\n${spaces}- `;
            const itemYaml = jsonToYaml(item, indent + 1);
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                yaml += itemYaml.split('\n').join(`\n${spaces}  `);
            } else {
                yaml += itemYaml;
            }
        });
        return yaml;
    }
    
    if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        if (keys.length === 0) return '{}';
        
        keys.forEach((key, index) => {
            if (index > 0 || indent > 0) yaml += '\n';
            yaml += `${spaces}${key}: `;
            const value = obj[key];
            const valueYaml = jsonToYaml(value, indent + 1);
            
            if (typeof value === 'object' && value !== null) {
                if (Array.isArray(value) && value.length > 0) {
                    yaml += valueYaml;
                } else if (!Array.isArray(value) && Object.keys(value).length > 0) {
                    yaml += valueYaml.split('\n').join(`\n${spaces}  `);
                } else {
                    yaml += valueYaml;
                }
            } else {
                yaml += valueYaml;
            }
        });
        return yaml;
    }
    
    return obj.toString();
}

// Live preview functionality
function updatePreview() {
    clearTimeout(previewUpdateTimeout);
    previewUpdateTimeout = setTimeout(() => {
        const data = getFormData();
        displayPreview(data);
        updateValidationStatus(data);
    }, 300); // Debounce for 300ms
}

function displayPreview(dataProduct) {
    const codeElement = document.getElementById('dataproduct-code');
    
    let content;
    if (currentFormat === 'json') {
        content = JSON.stringify(dataProduct, null, 2);
    } else {
        content = jsonToYaml(dataProduct);
    }
    
    codeElement.textContent = content;
}

function updateValidationStatus(dataProduct) {
    const statusElement = document.getElementById('validation-status');
    const statusIcon = statusElement.querySelector('.status-icon');
    const statusText = statusElement.querySelector('.status-text');
    
    // Basic validation
    const isValid = dataProduct.resourceName && 
                   dataProduct.data.name && 
                   dataProduct.data.eventSpecifications.length > 0;
    
    if (isValid) {
        statusIcon.textContent = '✅';
        statusText.textContent = 'Valid data product';
        statusElement.className = 'validation-status valid';
    } else {
        statusIcon.textContent = '❌';
        statusText.textContent = 'Invalid data product - missing required fields';
        statusElement.className = 'validation-status invalid';
    }
}

// Preview format switching
function switchPreviewFormat(format) {
    currentFormat = format;
    
    // Update tab states
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-format="${format}"]`).classList.add('active');
    
    updatePreview();
}

// Copy and download functionality
function copyDataProduct() {
    const data = getFormData();
    let content;
    
    if (currentFormat === 'json') {
        content = JSON.stringify(data, null, 2);
    } else {
        content = jsonToYaml(data);
    }
    
    navigator.clipboard.writeText(content).then(() => {
        showNotification('Data product copied to clipboard!');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Data product copied to clipboard!');
    });
}

function showNotification(message) {
    // Create notification element
    const notification = document.createElement('div');
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
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
        style.remove();
    }, 3000);
}

// Modal functionality for data structure selection
function selectEventDataStructure(eventSpecIndex) {
    currentModalTarget = {
        type: 'event',
        eventSpecIndex: eventSpecIndex,
        inputId: `eventspec-source-${eventSpecIndex}`
    };
    
    document.getElementById('modalTitle').textContent = 'Select Event Data Structure';
    document.getElementById('newStructureType').value = 'event';
    
    openDataStructureModal();
}

function selectEntityDataStructure(eventSpecIndex, entityType, entityIndex) {
    currentModalTarget = {
        type: 'entity',
        eventSpecIndex: eventSpecIndex,
        entityType: entityType,
        entityIndex: entityIndex,
        inputId: `entity-${eventSpecIndex}-${entityType}-${entityIndex}-source`
    };
    
    document.getElementById('modalTitle').textContent = 'Select Entity Data Structure';
    document.getElementById('newStructureType').value = 'entity';
    
    openDataStructureModal();
}

function openDataStructureModal() {
    // Reset modal state
    switchModalTab('existing');
    document.getElementById('structureSearch').value = '';
    
    // Request available data structures from the extension
    vscode.postMessage({
        command: 'getDataStructures'
    });
    
    document.getElementById('dataStructureModal').style.display = 'flex';
    
    // Add keyboard listener
    document.addEventListener('keydown', handleModalKeyboard);
    
    // Focus on search input
    setTimeout(() => {
        document.getElementById('structureSearch').focus();
    }, 100);
}

function closeDataStructureModal() {
    document.getElementById('dataStructureModal').style.display = 'none';
    currentModalTarget = null;
    
    // Remove keyboard listener
    document.removeEventListener('keydown', handleModalKeyboard);
}

function switchModalTab(tabName) {
    // Update tab states
    document.querySelectorAll('.modal-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Show/hide tab content
    document.getElementById('existingTab').style.display = tabName === 'existing' ? 'block' : 'none';
    document.getElementById('newTab').style.display = tabName === 'new' ? 'block' : 'none';
    
    // Update action button
    const actionBtn = document.getElementById('modalActionBtn');
    if (tabName === 'existing') {
        actionBtn.textContent = 'Select';
        actionBtn.onclick = selectDataStructure;
    } else {
        actionBtn.textContent = 'Create';
        actionBtn.onclick = createDataStructure;
        
        // Reset form when switching to new tab
        resetNewStructureForm();
    }
}

function resetNewStructureForm() {
    document.getElementById('newStructureName').value = '';
    document.getElementById('newStructureVendor').value = DEFAULT_VENDOR;
    document.getElementById('newStructureType').value = currentModalTarget?.type === 'entity' ? 'entity' : 'event';
    document.getElementById('newStructureDescription').value = '';
    
    // Clear all properties
    document.getElementById('propertiesList').innerHTML = '';
    propertyCounter = 0;
    
    // Add one default property for convenience
    addProperty();
}

function populateDataStructures(structures) {
    availableDataStructures = structures;
    filterDataStructures();
}

function filterDataStructures() {
    const searchTerm = document.getElementById('structureSearch').value.toLowerCase();
    const structureList = document.getElementById('structureList');
    
    const filteredStructures = availableDataStructures.filter(structure => 
        structure.name.toLowerCase().includes(searchTerm) ||
        structure.vendor.toLowerCase().includes(searchTerm) ||
        structure.description.toLowerCase().includes(searchTerm)
    );
    
    if (filteredStructures.length === 0) {
        structureList.innerHTML = '<div class="no-results">No data structures found</div>';
        return;
    }
    
    structureList.innerHTML = filteredStructures.map(structure => `
        <div class="structure-item" data-iglu-uri="${structure.igluUri}" onclick="selectStructureItem(this)" ondblclick="quickSelectStructure('${structure.igluUri}')">
            <div class="structure-name">${structure.name}</div>
            <div class="structure-details">
                <span class="structure-vendor">${structure.vendor}</span>
                <span class="structure-version">v${structure.version}</span>
                <span class="structure-type type-${structure.type}">${structure.type}</span>
            </div>
            <div class="structure-description">${structure.description || 'No description'}</div>
        </div>
    `).join('');
}

function quickSelectStructure(igluUri) {
    applyDataStructureSelection(igluUri);
    closeDataStructureModal();
}

function selectStructureItem(element) {
    // Remove previous selection
    document.querySelectorAll('.structure-item').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Add selection to clicked item
    element.classList.add('selected');
}

function selectDataStructure() {
    const selectedItem = document.querySelector('.structure-item.selected');
    if (!selectedItem) {
        showNotification('Please select a data structure');
        return;
    }
    
    const igluUri = selectedItem.dataset.igluUri;
    applyDataStructureSelection(igluUri);
    closeDataStructureModal();
}

function createDataStructure() {
    const name = document.getElementById('newStructureName').value.trim();
    const vendor = document.getElementById('newStructureVendor').value.trim();
    const type = document.getElementById('newStructureType').value;
    const description = document.getElementById('newStructureDescription').value.trim();
    
    if (!name || !vendor) {
        showNotification('Please fill in name and vendor fields');
        return;
    }
    
    // Collect properties
    const { properties, required } = collectProperties();
    
    // Send create request to extension
    vscode.postMessage({
        command: 'createDataStructure',
        data: {
            name: name,
            vendor: vendor,
            type: type,
            description: description,
            properties: properties,
            required: required
        }
    });
}

function applyDataStructureSelection(igluUri) {
    if (!currentModalTarget) {
        return;
    }
    
    // Find the correct input element
    let inputElement;
    
    if (currentModalTarget.type === 'event') {
        inputElement = document.querySelector(`[name="eventSpecs[${currentModalTarget.eventSpecIndex}][eventSource]"]`);
    } else if (currentModalTarget.type === 'entity') {
        inputElement = document.querySelector(`[name="entities[${currentModalTarget.eventSpecIndex}][${currentModalTarget.entityType}][${currentModalTarget.entityIndex}][source]"]`);
    }
    
    if (inputElement) {
        inputElement.value = igluUri;
        updatePreview();
        showNotification('Data structure selected successfully!');
    }
}

// Keyboard navigation for modal
function handleModalKeyboard(event) {
    if (event.key === 'Escape') {
        closeDataStructureModal();
    } else if (event.key === 'Enter') {
        const activeTab = document.querySelector('.modal-tab.active');
        if (activeTab && activeTab.dataset.tab === 'existing') {
            selectDataStructure();
        } else {
            createDataStructure();
        }
    }
}

// Property management for new data structures
let propertyCounter = 0;

function addProperty() {
    const propertiesList = document.getElementById('propertiesList');
    const propertyHtml = `
        <div class="property-item" id="property-${propertyCounter}">
            <div class="property-fields">
                <input type="text" placeholder="Property name" class="property-name" data-property-index="${propertyCounter}">
                <select class="property-type" data-property-index="${propertyCounter}">
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="integer">Integer</option>
                    <option value="boolean">Boolean</option>
                    <option value="array">Array</option>
                    <option value="object">Object</option>
                </select>
                <input type="text" placeholder="Description (optional)" class="property-description" data-property-index="${propertyCounter}">
                <label class="property-required">
                    <input type="checkbox" class="property-required-checkbox" data-property-index="${propertyCounter}">
                    Required
                </label>
                <button type="button" class="btn-icon-small btn-danger" onclick="removeProperty(${propertyCounter})" title="Remove">🗑</button>
            </div>
        </div>
    `;
    propertiesList.insertAdjacentHTML('beforeend', propertyHtml);
    propertyCounter++;
}

function removeProperty(index) {
    const propertyElement = document.getElementById(`property-${index}`);
    if (propertyElement) {
        propertyElement.remove();
    }
}

function collectProperties() {
    const properties = {};
    const required = [];
    
    document.querySelectorAll('.property-item').forEach(item => {
        const nameInput = item.querySelector('.property-name');
        const typeSelect = item.querySelector('.property-type');
        const descriptionInput = item.querySelector('.property-description');
        const requiredCheckbox = item.querySelector('.property-required-checkbox');
        
        const name = nameInput.value.trim();
        if (name) {
            properties[name] = {
                type: typeSelect.value,
                description: descriptionInput.value.trim() || undefined
            };
            
            if (requiredCheckbox.checked) {
                required.push(name);
            }
        }
    });
    
    return { properties, required };
}

// Initialize event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Add event listeners for live preview
    const form = document.getElementById('dataProductForm');
    if (form) {
        form.addEventListener('input', updatePreview);
        form.addEventListener('change', updatePreview);
    }
    
    // Preview format tabs
    document.querySelectorAll('.preview-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchPreviewFormat(tab.dataset.format);
        });
    });
    
    // Generate initial UUID if empty
    const resourceNameInput = document.getElementById('resourceName');
    if (resourceNameInput && !resourceNameInput.value) {
        generateUUID();
    }
    
    // Initial preview update
    updatePreview();
});
