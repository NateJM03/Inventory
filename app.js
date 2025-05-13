// app.js — UI logic: modals, table rendering, and barcode scanning.

const API_BASE = 'https://inventory-database.accounts-millernj.workers.dev'; 
// ← Change this to your Worker URL

// Cache DOM elements
const tableBody       = document.querySelector('#inventory-table tbody');
const filterType      = document.querySelector('#filter-type');
const addItemBtn      = document.querySelector('#add-item-btn');
const scanBarcodeBtn  = document.querySelector('#scan-barcode-btn');

// Modals & forms
const itemModal       = document.getElementById('item-modal');
const itemForm        = document.getElementById('item-form');
const itemModalTitle  = document.getElementById('item-modal-title');

const packagingModal  = document.getElementById('packaging-modal');
const packagingForm   = document.getElementById('packaging-form');

const caseModal       = document.getElementById('case-modal');
const caseForm        = document.getElementById('case-form');

const casesListModal  = document.getElementById('cases-list-modal');
const casesList       = document.getElementById('cases-list');

// State for current item in edit flows
let currentItemId     = null;

// Utility: open/close modals
function openModal(modal) { modal.classList.remove('hidden'); }
function closeModal(modal) { modal.classList.add('hidden'); }
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
});

// Simple fetch wrapper
async function api(path, opts={}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts
  });
  if (!res.ok) throw new Error(await res.text());
  return res.status === 204 ? null : res.json();
}

// Load & render inventory
async function loadInventory() {
  const items = await api('/items');
  tableBody.innerHTML = '';
  const filter = filterType.value;

  for (const it of items) {
    if (filter && it.type !== filter) continue;

    // Fetch summary array & compute aggregate cases
    const summaries = await api(`/items/${it.id}/summary`);
    const totalCases = summaries.reduce((sum, s) => sum + s.total_cases, 0);

    // Determine stock level class
    let levelClass = 'stock-regular';
    if (totalCases >= it.high_stock_threshold)      levelClass = 'stock-high';
    else if (totalCases <= it.low_stock_threshold)  levelClass = 'stock-low';

    // Build row
    const tr = document.createElement('tr');
    tr.classList.add(levelClass);
    tr.innerHTML = `
      <td>${it.upc}</td>
      <td>${it.name}</td>
      <td>${it.brand}</td>
      <td>${it.type}</td>
      <td>
        ${totalCases} cases 
        <button class="view-cases">📋</button>
      </td>
      <td>
        <button class="add-case">➕ Case</button>
      </td>
      <td>
        <button class="edit-item">✏️</button>
        <button class="add-packaging">📦</button>
        <button class="delete-item">🗑️</button>
      </td>
    `;
    tableBody.appendChild(tr);

    // Hook actions
    tr.querySelector('.edit-item')
      .addEventListener('click', () => showItemModal(it, true));
    tr.querySelector('.delete-item')
      .addEventListener('click', async () => {
        if (confirm('Delete this item?')) {
          await api(`/items/${it.id}`, { method: 'DELETE' });
          loadInventory();
        }
      });
    tr.querySelector('.add-packaging')
      .addEventListener('click', () => {
        currentItemId = it.id;
        packagingForm.reset();
        openModal(packagingModal);
      });
    tr.querySelector('.add-case')
      .addEventListener('click', () => {
        currentItemId = it.id;
        caseForm.reset();
        caseForm.purchase_date.value = new Date().toISOString().slice(0,10);
        openModal(caseModal);
      });
    tr.querySelector('.view-cases')
      .addEventListener('click', () => showCasesList(it.id));
  }
}

// —————————— Modals Flows ——————————

async function showItemModal(item = {}, isEdit = false) {
  currentItemId = isEdit ? item.id : null;
  itemModalTitle.textContent = isEdit ? 'Edit Item' : 'Add Item';
  itemForm.upc.value      = item.upc || '';
  itemForm.name.value     = item.name || '';
  itemForm.brand.value    = item.brand || '';
  itemForm.type.value     = item.type || 'beverages';
  itemForm.high_stock_threshold.value    = item.high_stock_threshold || 5;
  itemForm.regular_stock_threshold.value = item.regular_stock_threshold || 2;
  itemForm.low_stock_threshold.value     = item.low_stock_threshold || 1;
  openModal(itemModal);
}

// Save item (create or update)
itemForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(itemForm));
  // convert numeric fields
  for (let key of ['high_stock_threshold','regular_stock_threshold','low_stock_threshold']) {
    data[key] = +data[key];
  }
  if (currentItemId) {
    await api(`/items/${currentItemId}`, {
      method: 'PATCH', body: JSON.stringify(data)
    });
  } else {
    await api('/items', { method: 'POST', body: JSON.stringify(data) });
  }
  closeModal(itemModal);
  loadInventory();
});

// Add packaging version
packagingForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(packagingForm));
  data.items_per_case = +data.items_per_case;
  data.cases_per_box  = +data.cases_per_box;
  await api(`/items/${currentItemId}/packaging`, {
    method: 'POST', body: JSON.stringify(data)
  });
  closeModal(packagingModal);
});

// Add a case
caseForm.addEventListener('submit', async e => {
  e.preventDefault();
  const { purchase_date } = Object.fromEntries(new FormData(caseForm));
  await api('/cases', {
    method: 'POST',
    body: JSON.stringify({ item_id: currentItemId, purchase_date })
  });
  closeModal(caseModal);
  loadInventory();
});

// Show case history & allow deletion
async function showCasesList(itemId) {
  casesList.innerHTML = '';
  const list = await api(`/cases?item_id=${itemId}`);
  list.forEach(c => {
    const li = document.createElement('li');
    li.textContent = c.purchase_date;
    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.addEventListener('click', async () => {
      await api(`/cases/${c.id}`, { method: 'DELETE' });
      showCasesList(itemId);
      loadInventory();
    });
    li.appendChild(btn);
    casesList.appendChild(li);
  });
  openModal(casesListModal);
}

// —————————— Barcode Scanning ——————————

async function scanBarcode() {
  // Use native BarcodeDetector if available
  if ('BarcodeDetector' in window) {
    const detector = new BarcodeDetector({ formats: ['ean_13','upc_e'] });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.setAttribute('playsinline', true);
      await video.play();

      const scanLoop = async () => {
        const barcodes = await detector.detect(video);
        if (barcodes.length) {
          const code = barcodes[0].rawValue;
          stream.getTracks().forEach(t => t.stop());
          video.remove();
          filterType.value = '';
          await apiFetchAndFillUpc(code);
          return;
        }
        requestAnimationFrame(scanLoop);
      };
      scanLoop();
    } catch {
      alert('Cannot access camera');
    }
  } else {
    // Fallback to QuaggaJS if you load it
    Quagga.init({
      inputStream: { type: 'LiveStream', constraints: { facingMode: 'environment' }},
      decoder: { readers: ['ean_reader','upc_reader'] }
    }, err => {
      if (err) return alert('Quagga init failed');
      Quagga.start();
      Quagga.onDetected(d => {
        const code = d.codeResult.code;
        Quagga.stop();
        filterType.value = '';
        apiFetchAndFillUpc(code);
      });
    });
  }
}

// After scanning, prefill the Add Item modal’s UPC field
async function apiFetchAndFillUpc(code) {
  showItemModal({ upc: code }, false);
}

scanBarcodeBtn.addEventListener('click', scanBarcode);

// Filter & initial load
filterType.addEventListener('change', loadInventory);
addItemBtn.addEventListener('click', () => showItemModal());
loadInventory();
