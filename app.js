// Rewritten app.js with enhanced debugging for modal display issue

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM fully loaded and parsed. Initializing Inventory Tracker script...');

  const API = 'https://inventory-database.accounts-millernj.workers.dev';

  // ─── ELEMENT REFERENCES ────────────────────────────────────────────────────
  // Ensure these IDs match your HTML EXACTLY.
  const tableBody      = document.querySelector('#inventory-table tbody');
  const filterType     = document.getElementById('filter-type');
  const addItemBtn     = document.getElementById('add-item-btn');
  const scanBtn        = document.getElementById('scan-barcode-btn');

  const itemModal      = document.getElementById('item-modal');
  const itemForm       = document.getElementById('item-form');
  const itemTitle      = document.getElementById('item-modal-title');

  const caseModal      = document.getElementById('case-modal');
  const caseForm       = document.getElementById('case-form');

  const casesListModal = document.getElementById('cases-list-modal');
  const casesList      = document.getElementById('cases-list');

  // Log if critical elements for modal functionality are found
  console.log('Attempting to select #add-item-btn:', addItemBtn);
  console.log('Attempting to select #item-modal:', itemModal);

  if (!addItemBtn) {
    console.error('CRITICAL FAILURE: The "Add Item" button (id="add-item-btn") was not found in the HTML. The modal cannot be opened by this button.');
  }
  if (!itemModal) {
    console.error('CRITICAL FAILURE: The Item Modal (id="item-modal") was not found in the HTML. This modal cannot be displayed.');
  }
  if (!itemForm) {
    console.warn('Item Form (id="item-form") not found. Item creation/editing will fail.');
  }
  if (!itemTitle) {
    console.warn('Item Modal Title (id="item-modal-title") not found. Modal title will not be set.');
  }


  let currentItemId = null;

  // ─── INITIALIZE MODALS ──────────────────────────────────────────────────
  // This explicitly hides modals using inline styles.
  // CSS rules with "!important" can still override this.
  const allModals = [itemModal, caseModal, casesListModal];
  allModals.forEach(modal => {
    if (modal) {
      modal.style.display = 'none';
      console.log(`Modal '${modal.id}' display style initialized to 'none'.`);
    } else {
      // This indicates a mismatch between JS const names and actual modal elements
      console.warn('A modal variable is null during initialization. Check HTML IDs and JS const declarations for itemModal, caseModal, or casesListModal.');
    }
  });

  // ─── OPEN / CLOSE MODAL HELPERS ─────────────────────────────────────────────────
  function openModal(modalToOpen) {
    if (!modalToOpen) {
      console.error('ERROR: openModal was called with a null or undefined modal element.');
      alert('Developer Error: Tried to open an invalid modal dialog. Check console.');
      return;
    }
    console.log(`Attempting to open modal: '${modalToOpen.id}'`);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    modalToOpen.style.display = 'flex';      // KEY: This makes the modal visible.
                                             // 'flex' is common for centering. 'block' is another option.

    // Log computed styles to help debug CSS issues
    const computedStyles = getComputedStyle(modalToOpen);
    console.log(`Modal '${modalToOpen.id}' inline display style set to 'flex'.`);
    console.log(`Modal '${modalToOpen.id}' COMPUTED styles: display='${computedStyles.display}', visibility='${computedStyles.visibility}', opacity='${computedStyles.opacity}', z-index='${computedStyles.zIndex}', position='${computedStyles.position}', top='${computedStyles.top}', left='${computedStyles.left}', width='${computedStyles.width}', height='${computedStyles.height}'.`);

    // **** IF MODAL IS NOT VISIBLE, CHECK CSS ('styles.css') ****
    // 1. display: none !important;
    // 2. visibility: hidden;
    // 3. opacity: 0;
    // 4. Positioned off-screen (e.g., left: -9999px;)
    // 5. Zero height/width (e.g., height: 0;)
    // 6. Lower z-index than an overlay
    // Try commenting out your styles.css link in the HTML to see if the modal appears (unstyled).
  }

  function closeModal(modalToClose) {
    if (!modalToClose) {
      console.error('ERROR: closeModal was called with a null or undefined modal element.');
      return;
    }
    console.log(`Attempting to close modal: '${modalToClose.id}'`);
    modalToClose.style.display = 'none';
    console.log(`Modal '${modalToClose.id}' display style set to 'none'.`);

    // Restore body overflow only if all modals are closed
    const anyModalOpen = allModals.some(m => m && getComputedStyle(m).display !== 'none');
    if (!anyModalOpen) {
      document.body.style.overflow = '';
      console.log("All modals closed, body overflow restored.");
    }
  }

  // Wire up all "close" buttons within modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const parentModal = event.target.closest('.modal'); // .closest() is great for this
      if (parentModal) {
        console.log(`Close button clicked in modal: '${parentModal.id}'`);
        closeModal(parentModal);
      } else {
        console.warn('A .modal-close button was clicked, but it\'s not inside an element with class "modal".');
      }
    });
  });

  // ─── SIMPLE FETCH WRAPPER ─────────────────────────────────────────────────
  async function api(path, opts = {}) {
    const fullUrl = API + path;
    console.log(`API Call: ${opts.method || 'GET'} to ${fullUrl}`, opts.body ? JSON.parse(opts.body) : '');
    try {
      const res = await fetch(fullUrl, opts);
      const responseBody = await res.text(); // Get text first to avoid parsing error on empty/non-JSON
      if (!res.ok) {
        console.error(`API Error ${res.status} for ${path}: ${responseBody}`);
        throw new Error(`Server error (${res.status}): ${responseBody}`);
      }
      if (responseBody) {
        const data = JSON.parse(responseBody); // Parse if not empty
        console.log(`API Success for ${path}:`, data);
        return data;
      }
      console.log(`API Success for ${path} (No content or empty response)`);
      return null; // Or appropriate value for empty successful response
    } catch (err) {
      console.error(`Workspace failed for ${fullUrl}:`, err);
      alert(`An error occurred communicating with the server: ${err.message}. Check the console for more details.`);
      throw err;
    }
  }

  // ─── LOAD & RENDER INVENTORY ───────────────────────────────────────────────
  async function loadInventory() {
    console.log('Loading inventory...');
    if (!tableBody) {
        console.error("Inventory table body not found. Cannot render inventory.");
        return;
    }
    tableBody.innerHTML = '<tr><td colspan="9">Loading inventory data...</td></tr>'; // Show loading state

    try {
      const items = await api('/items');
      tableBody.innerHTML = ''; // Clear loading/previous items

      if (!filterType) {
          console.warn("Filter type select element not found. Filtering will be limited.");
      } else {
          const currentFilterValue = filterType.value;
          filterType.innerHTML = '<option value="">All</option>';
          const uniqueTypes = new Set(items.map(it => it.type).filter(Boolean)); // Get unique, non-empty types
          uniqueTypes.forEach(type => {
            const o = document.createElement('option');
            o.value = type;
            o.textContent = String(type).charAt(0).toUpperCase() + String(type).slice(1); // Capitalize
            filterType.appendChild(o);
          });
          if ([...filterType.options].some(o => o.value === currentFilterValue)) {
            filterType.value = currentFilterValue; // Restore selection if still valid
          }
      }

      const selectedType = filterType ? filterType.value : "";
      if (items.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9">No items found.</td></tr>';
        console.log('No items to display.');
        return;
      }

      for (const it of items) {
        if (selectedType && it.type !== selectedType) continue;

        const summary = await api(`/items/${it.id}/summary`);
        const totalCases = Array.isArray(summary) ? summary.reduce((sum, v) => sum + (v.total_cases || 0), 0) : 0;

        let rowClass = 'stock-regular';
        if (it.threshold_enabled) {
          if (it.high_stock_threshold != null && totalCases >= it.high_stock_threshold) rowClass = 'stock-high';
          else if (it.low_stock_threshold != null && totalCases <= it.low_stock_threshold) rowClass = 'stock-low';
        }

        const tr = document.createElement('tr');
        tr.className = rowClass;
        tr.innerHTML = `
          <td>${it.inventory_code || 'N/A'}</td>
          <td>${it.upc || 'N/A'}</td>
          <td>${it.name || 'N/A'}</td>
          <td>${it.brand || 'N/A'}</td>
          <td>${it.type || 'N/A'}</td>
          <td>${it.capacity || ''}</td>
          <td>${totalCases}</td>
          <td><button class="view-cases" data-item-id="${it.id}">View Cases</button></td>
          <td>
            <button class="edit-item" data-item-id="${it.id}">Edit</button>
            <button class="add-case" data-item-id="${it.id}">Add Case</button>
            <button class="delete-item" data-item-id="${it.id}">Delete</button>
          </td>
        `;
        tableBody.appendChild(tr);

        tr.querySelector('.edit-item')?.addEventListener('click', () => showItemModal(it, true));
        tr.querySelector('.delete-item')?.addEventListener('click', async () => {
          if (confirm(`Are you sure you want to delete item: ${it.name}? This action cannot be undone.`)) {
            try {
              await api(`/items/${it.id}`, { method: 'DELETE' });
              loadInventory();
            } catch (err) { /* Error already alerted by api() */ }
          }
        });
        tr.querySelector('.add-case')?.addEventListener('click', async () => {
          console.log(`Add Case button clicked for item ID: ${it.id} (${it.name})`);
          currentItemId = it.id;
          if (caseForm) caseForm.reset();
          await populateCaseFormDropdown(it.id);
          if (caseModal) openModal(caseModal);
          else console.error("Case Modal element not found, cannot open for 'Add Case'.");
        });
        tr.querySelector('.view-cases')?.addEventListener('click', () => showCases(it.id));
      }
      console.log('Inventory loaded and rendered successfully.');
    } catch (error) {
      console.error('Failed to load or render inventory:', error);
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="9">Error loading inventory: ${error.message}. Check console.</td></tr>`;
    }
  }

  // ─── SHOW ITEM MODAL (FOR ADD OR EDIT) ───────────────────────────────────
  function showItemModal(item = {}, isEdit = false) {
    console.log(`showItemModal called. isEdit: ${isEdit}`, isEdit ? item : '(New Item)');
    if (!itemModal || !itemForm || !itemTitle) {
        console.error("Cannot show item modal - one or more required modal elements (itemModal, itemForm, itemTitle) are missing from the DOM or from JS selection.");
        alert("Error: The item dialog components are missing. Please contact support or check console.");
        return;
    }

    currentItemId = isEdit ? item.id : null;
    itemTitle.textContent = isEdit ? `Edit Item: ${item.name || ''}` : 'Add New Item';
    itemForm.reset();

    if (isEdit && item) {
      console.log("Populating item form for editing item ID:", item.id);
      itemForm.upc.value                   = item.upc || '';
      itemForm.name.value                  = item.name || '';
      itemForm.brand.value                 = item.brand || '';
      itemForm.type.value                  = item.type || '';
      itemForm.capacity.value              = item.capacity || '';
      itemForm.items_per_case.value        = item.items_per_case || '';
      itemForm.cases_per_box.value         = item.cases_per_box || '';
      itemForm.high_stock_threshold.value    = item.high_stock_threshold ?? ''; // Use ?? for null/undefined
      itemForm.regular_stock_threshold.value = item.regular_stock_threshold ?? '';
      itemForm.low_stock_threshold.value     = item.low_stock_threshold ?? '';
      itemForm.threshold_enabled.checked   = !!item.threshold_enabled;
    } else {
      console.log("Item form is reset for adding a new item.");
      // Optionally set default values for a new item here if needed
      // itemForm.type.value = 'other'; // Example default
    }
    openModal(itemModal); // This is the crucial call to display the modal
  }

  // ─── ITEM FORM SUBMIT ───────────────────────────────────────────────────
  if (itemForm) {
    itemForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      console.log('Item form submitted.');
      const formData = new FormData(itemForm);
      const data = Object.fromEntries(formData.entries());

      data.threshold_enabled = itemForm.threshold_enabled.checked; // Ensure boolean
      data.capacity = data.capacity?.trim() || null; // Trim or nullify

      // Convert numeric fields explicitly, ensuring they are numbers or null
      ['items_per_case', 'cases_per_box', 'high_stock_threshold', 'regular_stock_threshold', 'low_stock_threshold'].forEach(field => {
          data[field] = data[field] ? Number(data[field]) : null;
          if (data[field] !== null && isNaN(data[field])) {
              alert(`Invalid number for ${field}. Please enter a valid number or leave blank.`);
              console.warn(`Invalid number submitted for ${field}:`, itemForm[field].value);
              // Consider stopping submission here if validation fails critically
              throw new Error(`Validation Error: Invalid number for ${field}`);
          }
      });

      console.log('Submitting item data to API:', data);

      const method = currentItemId ? 'PATCH' : 'POST';
      const url    = currentItemId ? `/items/${currentItemId}` : '/items';

      try {
        await api(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (itemModal) closeModal(itemModal);
        loadInventory();
        console.log(`Item ${currentItemId ? 'updated' : 'created'} successfully.`);
      } catch (err) {
        console.error(`Error ${method === 'POST' ? 'creating' : 'updating'} item:`, err.message);
        // Alert already shown by api() function, but you could add more specific UI feedback here.
      }
    });
  } else {
    console.error("Item Form (id='item-form') not found. Item submissions will not work.");
  }

  // ─── POPULATE CASE FORM DROPDOWN ─────────────────────────────────────────
  async function populateCaseFormDropdown(selectedItemId = null) {
    console.log(`Populating case form dropdown. Selected item ID (if any): ${selectedItemId}`);
    if (!caseForm) {
        console.error("Case form element not found, cannot populate its dropdown.");
        return;
    }
    const selectElement = caseForm.querySelector('select[name="item_id"]');
    if (!selectElement) {
        console.error("Item ID select dropdown (select[name='item_id']) not found in case form.");
        return;
    }
    selectElement.innerHTML = '<option value="">Loading items...</option>'; // Placeholder

    try {
        const items = await api('/items');
        selectElement.innerHTML = '<option value="" disabled>Select Item</option>';
        items.forEach(it => {
            const option = document.createElement('option');
            option.value = it.id;
            option.textContent = `${it.inventory_code || it.upc || 'ID:'+it.id} - ${it.name}`;
            if (selectedItemId && String(it.id) === String(selectedItemId)) { // Ensure type consistency for comparison
                option.selected = true;
            }
            selectElement.appendChild(option);
        });
        console.log("Case form dropdown populated.");
        if (selectedItemId) { // Re-ensure selection after populating
            selectElement.value = selectedItemId;
        }
    } catch (error) {
        console.error("Failed to populate case form dropdown:", error);
        selectElement.innerHTML = '<option value="">Error loading items</option>';
    }
  }

  // ─── CASE FORM SUBMIT ───────────────────────────────────────────────────
  if (caseForm) {
    caseForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      console.log('Case form submitted.');
      const formData = new FormData(caseForm);
      const data = Object.fromEntries(formData.entries());
      data.quantity = Number(data.quantity);

      if (!data.item_id) {
          alert("Please select an item for the case.");
          console.warn("Case form submitted without an item_id.");
          return;
      }
      if (isNaN(data.quantity) || data.quantity <= 0) {
          alert("Please enter a valid, positive quantity for cases.");
          console.warn("Case form submitted with invalid quantity:", data.quantity);
          return;
      }
      console.log('Adding case data to API:', data);
      try {
        await api('/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (caseModal) closeModal(caseModal);
        loadInventory();
        console.log("Cases added successfully.");
      } catch (err) {
        console.error('Error adding cases:', err.message);
      }
    });
  } else {
    console.error("Case Form (id='case-form') not found. Case submissions will not work.");
  }

  // ─── SHOW CASES LIST & HANDLE USE / DELETE ────────────────────────────────
  async function showCases(itemId) {
    console.log(`Showing cases for item ID: ${itemId}`);
    if (!casesList || !casesListModal) {
        console.error("Cases list UL or cases list modal element not found. Cannot display case history.");
        alert("Error: Cannot display case history, dialog components are missing.");
        return;
    }
    casesList.innerHTML = '<li>Loading case history...</li>';
    if (casesListModal) openModal(casesListModal);
    else {
        console.error("Cases List Modal not found, cannot open for 'Show Cases'.");
        return;
    }

    try {
        const caseEntries = await api(`/cases?item_id=${itemId}`);
        casesList.innerHTML = ''; // Clear loading
        if (!caseEntries || caseEntries.length === 0) {
            casesList.innerHTML = '<li>No case history recorded for this item.</li>';
        } else {
            caseEntries.forEach(c => {
                const li = document.createElement('li');
                const purchaseDate = c.purchase_date ? new Date(c.purchase_date).toLocaleDateString() : 'N/A';
                const usedDate = c.used_date ? new Date(c.used_date).toLocaleDateString() : '';
                
                let textContent = `Purchased: ${purchaseDate}, Qty: ${c.quantity}`;
                if (usedDate) textContent += ` (Used: ${usedDate})`;
                li.textContent = textContent;

                if (!usedDate) {
                    const useBtn = document.createElement('button');
                    useBtn.textContent = 'Mark Used';
                    useBtn.style.marginLeft = '10px';
                    useBtn.addEventListener('click', async () => {
                        console.log(`Marking case ID ${c.id} as used.`);
                        try {
                            await api(`/cases/${c.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ used_date: new Date().toISOString().slice(0, 10) })
                            });
                            showCases(itemId);
                            loadInventory();
                        } catch (err) { /* Already handled */ }
                    });
                    li.appendChild(useBtn);
                }

                const delBtn = document.createElement('button');
                delBtn.textContent = 'Delete';
                delBtn.style.marginLeft = '10px';
                delBtn.addEventListener('click', async () => {
                    if (confirm(`Delete this case entry (Purchased: ${purchaseDate}, Qty: ${c.quantity})?`)) {
                        console.log(`Deleting case ID ${c.id}.`);
                        try {
                            await api(`/cases/${c.id}`, { method: 'DELETE' });
                            showCases(itemId);
                            loadInventory();
                        } catch (err) { /* Already handled */ }
                    }
                });
                li.appendChild(delBtn);
                casesList.appendChild(li);
            });
        }
        console.log("Cases list displayed.");
    } catch (error) {
        console.error(`Failed to load or display cases for item ID ${itemId}:`, error);
        casesList.innerHTML = `<li>Error loading case history: ${error.message}.</li>`;
    }
  }

  // ─── BARCODE SCAN HOOK (Placeholder) ──────────────────────────────────────
  // Ensure QuaggaJS is loaded and scanBarcode function is properly defined
  // For now, this just logs and alerts if scanBarcode isn't available.
  function scanBarcode() {
      if (typeof Quagga !== 'undefined') {
          // Basic QuaggaJS invocation example - you'll need a container for the video stream
          // and proper configuration. This is highly simplified.
          alert("QuaggaJS is available. Implement scanner initialization here.");
          console.log("QuaggaJS found. Scanner implementation needed.");
          // Example: Quagga.init({ inputStream: { ... }, decoder: { ... } }, err => {});
          // Quagga.onDetected(data => { ... });
          // Quagga.start();
      } else {
          alert('Barcode scanning library (QuaggaJS) is not available.');
          console.warn('Quagga object not found. Barcode scanning disabled.');
      }
  }

  if (scanBtn) {
    scanBtn.addEventListener('click', () => {
        console.log('Scan UPC button clicked.');
        scanBarcode(); // Call the defined scanBarcode function
    });
  } else {
    console.warn('Scan Barcode Button (id="scan-barcode-btn") not found.');
  }

  // ─── OTHER UI HOOKS / EVENT LISTENERS ───────────────────────────────────
  if (filterType) {
    filterType.addEventListener('change', () => {
        console.log(`Filter type changed to: '${filterType.value}'`);
        loadInventory();
    });
  } else {
    console.warn("Filter Type select (id='filter-type') not found. Filtering will not work.");
  }

  if (addItemBtn) {
    addItemBtn.addEventListener('click', () => {
      console.log('Add Item button was clicked. Calling showItemModal() to display the modal.');
      showItemModal(); // This should open the itemModal for adding a new item
    });
  }
  // else: Error already logged if addItemBtn is not found.

  // ─── INITIAL LOAD ──────────────────────────────────────────────────────────
  console.log('Script initialization complete. Starting initial inventory load...');
  loadInventory();

  console.log("Inventory Tracker application fully initialized. Monitoring for events.");
  // A one-time reminder for the user.
  // setTimeout(() => alert("Reminder: Check your browser's developer console (F12) for detailed logs and error messages if you encounter issues."), 2000);

}); // End of DOMContentLoaded