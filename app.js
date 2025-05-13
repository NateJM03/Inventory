const API = 'https://inventory-database.accounts-millernj.workers.dev';

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

let currentItemId = null;

function open(modal) { modal.classList.remove('hidden'); }
function close(modal){ modal.classList.add('hidden'); }
document.querySelectorAll('.modal-close').forEach(btn=>
  btn.addEventListener('click', ()=>close(btn.closest('.modal')))
);

async function api(path, opts={}) {
  const res = await fetch(API+path, opts);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function loadInventory() {
  const items = await api('/items');
  tableBody.innerHTML = '';
  filterType.innerHTML = '<option value="">All</option>';
  items.forEach(it => {
    // populate filter
    if (![...filterType.options].some(o=>o.value===it.type)) {
      const o = document.createElement('option');
      o.value = it.type; o.textContent = it.type;
      filterType.appendChild(o);
    }
  });

  const f = filterType.value;
  for (const it of items) {
    if (f && it.type!==f) continue;

    // summary
    const sum = await api(`/items/${it.id}/summary`);
    const totalCases = sum.reduce((s,v)=>s+v.total_cases,0);

    let cls='stock-regular';
    if (it.threshold_enabled) {
      if (totalCases >= it.high_stock_threshold) cls='stock-high';
      else if (totalCases <= it.low_stock_threshold) cls='stock-low';
    }

    const tr = document.createElement('tr');
    tr.classList.add(cls);
    tr.innerHTML = `
      <td>${it.inventory_code}</td>
      <td>${it.upc}</td>
      <td>${it.name}</td>
      <td>${it.brand}</td>
      <td>${it.capacity || ''}</td>
      <td>${it.type}</td>
      <td>${totalCases}</td>
      <td><button class="view-cases">📋</button></td>
      <td>
        <button class="edit-item">✏️</button>
        <button class="add-case">➕ Case</button>
        <button class="delete-item">🗑️</button>
      </td>
    `;
    tableBody.appendChild(tr);

    tr.querySelector('.edit-item')
      .addEventListener('click',()=>showItemModal(it,true));
    tr.querySelector('.delete-item')
      .addEventListener('click',async()=>{
        if(confirm('Delete item?')) {
          await fetch(API+`/items/${it.id}`,{method:'DELETE'});
          loadInventory();
        }
      });
tr.querySelector('.add-case')
  .addEventListener('click', async () => {
    currentItemId = it.id;
    caseForm.reset();
    await populateCaseFormDropdown(it.id);
    open(caseModal);
  });
    tr.querySelector('.view-cases')
      .addEventListener('click',()=>showCases(it.id));
  }
}

function showItemModal(item = {}, isEdit = false) {
  currentItemId = isEdit ? item.id : null;
  itemTitle.textContent = isEdit ? 'Edit Item' : 'Add Item';

  itemForm.reset();

  if (isEdit) {
    itemForm.upc.value = item.upc;
    itemForm.name.value = item.name;
    itemForm.brand.value = item.brand;
    itemForm.type.value = item.type;
    itemForm.capacity.value = item.capacity || '';
    itemForm.items_per_case.value = item.items_per_case || 1;
    itemForm.cases_per_box.value = item.cases_per_box || 1;
    itemForm.high_stock_threshold.value = item.high_stock_threshold ?? '';
    itemForm.regular_stock_threshold.value = item.regular_stock_threshold ?? '';
    itemForm.low_stock_threshold.value = item.low_stock_threshold ?? '';
    itemForm.threshold_enabled.checked = !!item.threshold_enabled;
  }

  open(itemModal);
}


async function populateCaseFormDropdown(selectedId = null) {
  const items = await api('/items');
  const select = caseForm.querySelector('select[name="item_id"]');
  select.innerHTML = '<option value="" disabled selected>Select Item</option>';
  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = `${item.inventory_code} - ${item.name}`;
    if (selectedId && item.id === selectedId) option.selected = true;
    select.appendChild(option);
  });
}


itemForm.addEventListener('submit', async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(itemForm));
  data.threshold_enabled = itemForm.threshold_enabled.checked;
  data.capacity = data.capacity?.trim() || ''; // add this line

  const method = currentItemId ? 'PATCH' : 'POST';
  const url = currentItemId ? `/items/${currentItemId}` : '/items';

  await fetch(API + url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  close(itemModal);
  loadInventory();
});


caseForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const q = Number(caseForm.quantity.value);
  await fetch(API+'/cases',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ item_id: currentItemId, quantity: q })
  });
  close(caseModal);
  loadInventory();
});

async function showCases(itemId) {
  casesList.innerHTML = '';
  const list = await api(`/cases?item_id=${itemId}`);
  list.forEach(c=>{
    const li = document.createElement('li');
    li.textContent = `${c.purchase_date} ×${c.quantity}`;
    const btn = document.createElement('button');
    btn.textContent = '🗑️';
    btn.addEventListener('click',async()=>{
      await fetch(API+`/cases/${c.id}`,{method:'DELETE'});
      showCases(itemId); loadInventory();
    });
    li.appendChild(btn);
    casesList.appendChild(li);
  });
  open(casesListModal);
}

// Barcode scanning
async function scanBarcode() {
  if ('BarcodeDetector' in window) {
    const det = new BarcodeDetector({formats:['ean_13','upc_e','code_128']});
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    const video  = Object.assign(document.createElement('video'),{srcObject:stream,playsinline:true});
    await video.play();
    (async function loop(){
      const codes = await det.detect(video);
      if (codes.length) {
        stream.getTracks().forEach(t=>t.stop());
        scanBtn.disabled=true;
        showItemModal({ upc: codes[0].rawValue },false);
      } else requestAnimationFrame(loop);
    })();
  } else {
    alert('BarcodeDetector not supported');
  }
}

scanBtn.addEventListener('click', scanBarcode);
filterType.addEventListener('change', loadInventory);
addItemBtn.addEventListener('click', ()=>showItemModal());
loadInventory();
