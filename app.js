// app.js
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded. Initializing Inventory Tracker script...');

  const API_BASE_URL = 'https://inventory-database.accounts-millernj.workers.dev'; // Your actual API base URL

  // Element References
  const tableBody = document.querySelector('#inventory-table tbody');
  const filterTypeSelect = document.getElementById('filter-type');
  const addItemBtn = document.getElementById('add-item-btn');
  const scanBarcodeBtn = document.getElementById('scan-barcode-btn');

  const itemModalEl = document.getElementById('item-modal');
  const itemFormEl = document.getElementById('item-form');
  const itemModalTitleEl = document.getElementById('item-modal-title');

  const caseModalEl = document.getElementById('case-modal');
  const caseFormEl = document.getElementById('case-form');

  const casesListModalEl = document.getElementById('cases-list-modal');
  const casesListUl = document.getElementById('cases-list');

  let currentEditingItemId = null; // To track if editing or adding

  // Helper: Initialize Modals (Hide them)
  [itemModalEl, caseModalEl, casesListModalEl].forEach(modal => {
    if (modal) modal.style.display = 'none';
  });

  // Helper: Open Modal
  function openModal(modalElement) {
    if (!modalElement) return;
    document.body.style.overflow = 'hidden';
    modalElement.style.display = 'flex';
    console.log(`Modal '${modalElement.id}' opened.`);
  }

  // Helper: Close Modal
  function closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.style.display = 'none';
    // Restore body scroll only if all modals are closed
    const anyModalOpen = [itemModalEl, caseModalEl, casesListModalEl].some(m => m && getComputedStyle(m).display !== 'none');
    if (!anyModalOpen) {
      document.body.style.overflow = '';
    }
    console.log(`Modal '${modalElement.id}' closed.`);
  }

  // Wire up all modal close buttons
  document.querySelectorAll('.modal-close').forEach(button => {
    button.addEventListener('click', (event) => {
      const modal = event.target.closest('.modal');
      if (modal) closeModal(modal);
    });
  });

  // API Fetch Wrapper
  async function apiRequest(path, options = {}) {
    const fullUrl = API_BASE_URL + path;
    console.log(`API Call: ${options.method || 'GET'} ${fullUrl}`, options.body ? JSON.parse(options.body) : '');
    try {
      const response = await fetch(fullUrl, options);
      const responseText = await response.text();
      if (!response.ok) {
        let errorData = { message: responseText || `Request failed with status ${response.status}` };
        try { errorData = JSON.parse(responseText); } catch (e) { /* not JSON */ }
        console.error(`API Error ${response.status} for ${path}:`, errorData);
        throw new Error(errorData.error || errorData.message);
      }
      if (response.status === 204 || !responseText) { // Handle No Content
        console.log(`API Success for ${path} (No Content)`);
        return null;
      }
      const data = JSON.parse(responseText);
      console.log(`API Success for ${path}:`, data);
      return data;
    } catch (error) {
      console.error(`Workspace operation failed for ${fullUrl}:`, error);
      alert(`Operation failed: ${error.message}. See console for details.`);
      throw error;
    }
  }

  // Load and Render Inventory Table
  async function loadAndRenderInventory() {
    console.log('Loading inventory...');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="9">Loading inventory...</td></tr>';
    try {
      const items = await apiRequest('/items');
      tableBody.innerHTML = ''; // Clear table

      // Populate filter dropdown
      if (filterTypeSelect) {
        const currentFilter = filterTypeSelect.value;
        filterTypeSelect.innerHTML = '<option value="">All Types</option>';
        const types = [...new Set(items.map(item => item.type).filter(Boolean))].sort();
        types.forEach(type => {
          const option = document.createElement('option');
          option.value = type;
          option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
          filterTypeSelect.appendChild(option);
        });
        filterTypeSelect.value = currentFilter;
      }

      const typeFilter = filterTypeSelect ? filterTypeSelect.value : "";
      const itemsToDisplay = items.filter(item => !typeFilter || item.type === typeFilter);

      if (itemsToDisplay.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9">${typeFilter ? 'No items found for this type.' : 'No items in inventory. Add one!'}</td></tr>`;
        return;
      }

      for (const item of itemsToDisplay) {
        let totalCasesInStock = 0;
        try {
          const summary = await apiRequest(`/items/${item.id}/summary`);
          if (summary && Array.isArray(summary)) {
            totalCasesInStock = summary.reduce((acc, ver) => acc + (ver.total_cases || 0), 0);
          }
        } catch (e) { console.warn(`Failed to load summary for item ${item.id}`, e); }

        let stockClass = 'stock-regular';
        if (item.threshold_enabled && item.high_stock_threshold != null && item.low_stock_threshold != null) {
          if (totalCasesInStock >= item.high_stock_threshold) stockClass = 'stock-high';
          else if (totalCasesInStock <= item.low_stock_threshold) stockClass = 'stock-low';
        }

        const row = tableBody.insertRow();
        row.className = stockClass;
        row.innerHTML = `
          <td>${item.inventory_code || 'N/A'}</td>
          <td>${item.upc || 'N/A'}</td>
          <td>${item.name || 'N/A'}</td>
          <td>${item.brand || 'N/A'}</td>
          <td>${item.type || 'N/A'}</td>
          <td>${item.capacity || ''}</td>
          <td>${totalCasesInStock}</td>
          <td><button class="view-cases">View Cases</button></td>
          <td>
            <button class="edit-item">Edit</button>
            <button class="add-case">Add Case</button>
            <button class="delete-item">Delete</button>
          </td>
        `;
        row.querySelector('.edit-item').addEventListener('click', () => openItemModal(item, true));
        row.querySelector('.delete-item').addEventListener('click', () => deleteItem(item));
        row.querySelector('.add-case').addEventListener('click', () => openCaseModal(item.id));
        row.querySelector('.view-cases').addEventListener('click', () => displayCaseHistory(item.id));
      }
    } catch (error) {
      tableBody.innerHTML = `<tr><td colspan="9">Error loading inventory: ${error.message}</td></tr>`;
    }
  }

  // Open Item Modal (Add or Edit)
  function openItemModal(itemData = null, isEditing = false) {
    if (!itemModalEl || !itemFormEl || !itemModalTitleEl) return;
    currentEditingItemId = isEditing ? itemData.id : null;
    itemModalTitleEl.textContent = isEditing ? `Edit Item: ${itemData.name}` : 'Add New Item';
    itemFormEl.reset();

    if (isEditing && itemData) {
      // Populate standard item fields
      ['upc', 'name', 'brand', 'type', 'capacity'].forEach(key => {
        if (itemFormEl[key]) itemFormEl[key].value = itemData[key] || '';
      });
      ['high_stock_threshold', 'regular_stock_threshold', 'low_stock_threshold'].forEach(key => {
        if (itemFormEl[key]) itemFormEl[key].value = itemData[key] ?? ''; // Nullish coalescing for thresholds
      });
      if (itemFormEl.threshold_enabled) itemFormEl.threshold_enabled.checked = !!itemData.threshold_enabled;

      // Asynchronously fetch and populate packaging fields
      itemFormEl.items_per_case.value = ''; // Placeholder
      itemFormEl.cases_per_box.value = '';  // Placeholder
      apiRequest(`/items/${itemData.id}/packaging`)
        .then(packagingVersions => {
          if (packagingVersions && packagingVersions.length > 0) {
            const latestPackaging = packagingVersions[0]; // Worker sorts DESC
            itemFormEl.items_per_case.value = latestPackaging.items_per_case || '1';
            itemFormEl.cases_per_box.value = latestPackaging.cases_per_box || '1';
          } else { // No existing packaging, use defaults
            itemFormEl.items_per_case.value = '1';
            itemFormEl.cases_per_box.value = '1';
          }
        })
        .catch(err => { // Fallback on error
          console.error("Error fetching packaging for edit:", err);
          itemFormEl.items_per_case.value = '1';
          itemFormEl.cases_per_box.value = '1';
        });
    } else { // New item, set defaults
      itemFormEl.items_per_case.value = '1';
      itemFormEl.cases_per_box.value = '1';
    }
    openModal(itemModalEl);
  }

  // Handle Item Form Submission
  itemFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(itemFormEl);
    const itemPayload = {
      upc: formData.get('upc'), name: formData.get('name'), brand: formData.get('brand'),
      type: formData.get('type'), capacity: formData.get('capacity')?.trim() || null,
      high_stock_threshold: formData.get('high_stock_threshold') ? Number(formData.get('high_stock_threshold')) : null,
      regular_stock_threshold: formData.get('regular_stock_threshold') ? Number(formData.get('regular_stock_threshold')) : null,
      low_stock_threshold: formData.get('low_stock_threshold') ? Number(formData.get('low_stock_threshold')) : null,
      threshold_enabled: itemFormEl.threshold_enabled.checked
    };
    // Basic validation for numbers
    for (const field of ['high_stock_threshold', 'regular_stock_threshold', 'low_stock_threshold']) {
        if (itemPayload[field] !== null && isNaN(itemPayload[field])) {
            alert(`Invalid number for ${field}.`); return;
        }
    }

    const itemsPerCase = formData.get('items_per_case') ? Number(formData.get('items_per_case')) : 1;
    const casesPerBox = formData.get('cases_per_box') ? Number(formData.get('cases_per_box')) : 1;
    if (itemsPerCase <= 0 || casesPerBox <= 0 || isNaN(itemsPerCase) || isNaN(casesPerBox)) {
        alert("Items per case and Cases per box must be positive numbers."); return;
    }

    try {
      if (currentEditingItemId) { // --- Editing Item ---
        await apiRequest(`/items/${currentEditingItemId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(itemPayload)
        });
        // After patching item details, create a new packaging version
        const packagingPayload = {
          items_per_case: itemsPerCase, cases_per_box: casesPerBox,
          effective_date: new Date().toISOString().slice(0, 10)
        };
        await apiRequest(`/items/${currentEditingItemId}/packaging`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(packagingPayload)
        });
        console.log(`Item ${currentEditingItemId} and packaging updated.`);
      } else { // --- Adding New Item ---
        const fullPayload = { ...itemPayload, items_per_case: itemsPerCase, cases_per_box: casesPerBox };
        await apiRequest('/items', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullPayload)
        });
        console.log('New item created.');
      }
      closeModal(itemModalEl);
      loadAndRenderInventory();
    } catch (error) { /* Error already alerted by apiRequest */ }
  });

  // Delete Item
  async function deleteItem(item) {
    if (confirm(`Are you sure you want to delete item: ${item.name} (${item.inventory_code})?\nThis will delete all its packaging versions and case history.`)) {
      try {
        await apiRequest(`/items/${item.id}`, { method: 'DELETE' });
        loadAndRenderInventory();
      } catch (error) { /* Error already alerted */ }
    }
  }

  // Open Case Modal (for adding cases to an item)
  async function openCaseModal(itemId) {
    if (!caseModalEl || !caseFormEl) return;
    caseFormEl.reset();
    await populateCaseFormItemDropdown(itemId); // Populate and select item
    openModal(caseModalEl);
  }

  // Populate Item Dropdown in Case Form
  async function populateCaseFormItemDropdown(selectedItemId = null) {
    const selectEl = caseFormEl?.querySelector('select[name="item_id"]');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">Loading...</option>';
    try {
      const items = await apiRequest('/items');
      selectEl.innerHTML = '<option value="" disabled>Select Item</option>';
      items.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.inventory_code} - ${item.name}`;
        selectEl.appendChild(option);
      });
      if (selectedItemId) selectEl.value = selectedItemId;
      else selectEl.selectedIndex = 0; // "Select Item"
    } catch (error) {
      selectEl.innerHTML = '<option value="">Error loading items</option>';
    }
  }

  // Handle Case Form Submission
  caseFormEl?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(caseFormEl);
    const payload = {
      item_id: formData.get('item_id'),
      quantity: Number(formData.get('quantity'))
    };
    if (!payload.item_id) { alert("Please select an item."); return; }
    if (isNaN(payload.quantity) || payload.quantity <= 0) {
      alert("Please enter a valid positive quantity."); return;
    }
    try {
      await apiRequest('/cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      closeModal(caseModalEl);
      loadAndRenderInventory(); // Refresh to show new stock
    } catch (error) { /* Error already alerted */ }
  });

  // Display Case History and Handle "Mark Used"
  async function displayCaseHistory(itemId) {
    if (!casesListModalEl || !casesListUl) return;
    casesListUl.innerHTML = '<li>Loading case history...</li>';
    openModal(casesListModalEl);
    try {
      const caseEntries = await apiRequest(`/cases?item_id=${itemId}`);
      casesListUl.innerHTML = '';
      if (!caseEntries || caseEntries.length === 0) {
        casesListUl.innerHTML = '<li>No case history for this item.</li>';
        return;
      }
      caseEntries.forEach(entry => {
        const li = document.createElement('li');
        const purchaseDt = entry.purchase_date ? new Date(entry.purchase_date + 'T00:00:00Z').toLocaleDateString() : 'N/A';
        const usedDt = entry.used_date ? new Date(entry.used_date + 'T00:00:00Z').toLocaleDateString() : '';
        li.innerHTML = `Purchased: ${purchaseDt}, Qty: ${entry.quantity} ${usedDt ? `(Used: ${usedDt})` : ''}`;

        if (!entry.used_date) {
          const markUsedBtn = document.createElement('button');
          markUsedBtn.textContent = 'Mark Used';
          markUsedBtn.style.marginLeft = '10px';
          markUsedBtn.addEventListener('click', async () => {
            let numToUse = 1;
            if (entry.quantity > 1) {
              const input = prompt(`Batch Qty: ${entry.quantity}. How many to mark used?`, '1');
              if (input === null) return; // Cancelled
              numToUse = parseInt(input, 10);
              if (isNaN(numToUse) || numToUse <= 0 || numToUse > entry.quantity) {
                alert(`Invalid number. Must be between 1 and ${entry.quantity}.`); return;
              }
            }
            try {
              await apiRequest(`/cases/${entry.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  used_date: new Date().toISOString().slice(0, 10),
                  count_to_use: numToUse
                })
              });
              displayCaseHistory(itemId); // Refresh this modal
              loadAndRenderInventory(); // Refresh main table
            } catch (error) { /* Error already alerted */ }
          });
          li.appendChild(markUsedBtn);
        }

        const deleteCaseBtn = document.createElement('button');
        deleteCaseBtn.textContent = 'Delete Entry';
        deleteCaseBtn.style.marginLeft = '5px';
        deleteCaseBtn.style.color = 'red';
        deleteCaseBtn.addEventListener('click', async () => {
          if (confirm(`DELETE case entry (Qty: ${entry.quantity}, Purchased: ${purchaseDt})? This cannot be undone.`)) {
            try {
              await apiRequest(`/cases/${entry.id}`, { method: 'DELETE' });
              displayCaseHistory(itemId);
              loadAndRenderInventory();
            } catch (error) { /* Error already alerted */ }
          }
        });
        li.appendChild(deleteCaseBtn);
        casesListUl.appendChild(li);
      });
    } catch (error) {
      casesListUl.innerHTML = `<li>Error loading case history: ${error.message}</li>`;
    }
  }
  
  // Barcode Scanning Placeholder
  function scanBarcode() {
    if (typeof Quagga !== 'undefined') { // Check if QuaggaJS is loaded
        alert("QuaggaJS detected. Implement scanner initialization & capture logic here.");
        // Example: Quagga.init({ config }, err => { if (err) { ... } Quagga.start(); });
        // Quagga.onDetected(data => { console.log(data.codeResult.code); Quagga.stop(); });
    } else {
        alert("Barcode scanning library (QuaggaJS) not found or loaded.");
    }
  }
  if (scanBarcodeBtn) scanBarcodeBtn.addEventListener('click', scanBarcode);


  // Initial Setup: Event Listeners & Load Data
  if (addItemBtn) addItemBtn.addEventListener('click', () => openItemModal(null, false));
  if (filterTypeSelect) filterTypeSelect.addEventListener('change', loadAndRenderInventory);

  loadAndRenderInventory(); // Load inventory on page start
  console.log("Inventory Tracker application fully initialized.");
});