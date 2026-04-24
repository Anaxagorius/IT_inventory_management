/**
 * Valley Credit Union – IT Inventory Manager
 * Frontend controller (Vanilla JS + Tauri IPC)
 */

// Tauri v2 injects window.__TAURI__ at startup; access it after DOMContentLoaded.
let invoke;

async function init() {
  // Prefer the bundled API if available (dev mode), otherwise use the injected global.
  if (window.__TAURI__?.core?.invoke) {
    invoke = window.__TAURI__.core.invoke;
  } else {
    try {
      const mod = await import('@tauri-apps/api/core');
      invoke = mod.invoke;
    } catch {
      // Fallback: wait for __TAURI__ to be ready (production build)
      invoke = (...args) => window.__TAURI__.core.invoke(...args);
    }
  }

  showView('dashboard');
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentAssetId = null; // ID of the asset being viewed/edited in the modal
let allDepartments  = [];  // for the department filter dropdown

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const navItems  = document.querySelectorAll('.nav-item');
const views     = document.querySelectorAll('.view');

function showView(name) {
  views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'assets')    loadAssets();
  if (name === 'add')       openAddForm();
}

navItems.forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

document.getElementById('btn-add-from-list').addEventListener('click', () => showView('add'));

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
let toastTimer = null;

function showToast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className   = `toast visible ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 3500);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
  try {
    const stats = await invoke('get_stats');

    document.getElementById('stat-total').textContent   = stats.total;
    document.getElementById('stat-active').textContent  = stats.active;
    document.getElementById('stat-storage').textContent = stats.in_storage;
    document.getElementById('stat-repair').textContent  = stats.in_repair;
    document.getElementById('stat-retired').textContent = stats.retired;
    document.getElementById('stat-warranty').textContent= stats.expiring_warranty_soon;

    const typeList = document.getElementById('by-type-list');
    typeList.innerHTML = stats.by_type.length
      ? stats.by_type.map(t =>
          `<li><span class="bl-name">${escHtml(t.asset_type)}</span>
               <span class="bl-count">${t.count}</span></li>`
        ).join('')
      : '<li class="loading-row">No assets yet</li>';

    const deptList = document.getElementById('by-dept-list');
    deptList.innerHTML = stats.by_department.length
      ? stats.by_department.map(d =>
          `<li><span class="bl-name">${escHtml(d.department)}</span>
               <span class="bl-count">${d.count}</span></li>`
        ).join('')
      : '<li class="loading-row">No assets yet</li>';

  } catch (err) {
    console.error('loadDashboard error', err);
    showToast('Failed to load dashboard: ' + err, 'error');
  }
}

// ---------------------------------------------------------------------------
// Asset list
// ---------------------------------------------------------------------------
async function loadAssets() {
  const tbody     = document.getElementById('asset-table-body');
  const countEl   = document.getElementById('result-count');
  tbody.innerHTML = '<tr><td colspan="10" class="loading-row">Loading…</td></tr>';

  const query  = document.getElementById('search-input').value.trim() || null;
  const atype  = document.getElementById('filter-type').value   || null;
  const status = document.getElementById('filter-status').value || null;
  const dept   = document.getElementById('filter-dept').value   || null;

  try {
    const assets = await invoke('search_assets', {
      query,
      assetType:  atype,
      status,
      department: dept,
    });

    // Collect departments for filter dropdown
    updateDeptFilter(assets);

    if (assets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="loading-row">No assets found.</td></tr>';
      countEl.textContent = '0 assets';
      return;
    }

    tbody.innerHTML = assets.map(a => `
      <tr data-id="${a.id}">
        <td><button class="btn-link" data-action="view" data-id="${a.id}">${escHtml(a.asset_tag)}</button></td>
        <td>${escHtml(a.asset_type)}</td>
        <td>${escHtml([a.make, a.model].filter(Boolean).join(' ') || '—')}</td>
        <td>${escHtml(a.serial_number || '—')}</td>
        <td>${escHtml(a.assigned_to || '—')}</td>
        <td>${escHtml(a.department  || '—')}</td>
        <td>${escHtml(a.location    || '—')}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${warrantyDisplay(a.warranty_expiry)}</td>
        <td class="col-actions">
          <button class="btn btn-icon" data-action="view"   data-id="${a.id}" title="View">👁</button>
          <button class="btn btn-icon" data-action="edit"   data-id="${a.id}" title="Edit">✏️</button>
          <button class="btn btn-icon danger" data-action="delete" data-id="${a.id}" title="Delete">🗑</button>
        </td>
      </tr>
    `).join('');

    countEl.textContent = `${assets.length} asset${assets.length !== 1 ? 's' : ''}`;
  } catch (err) {
    console.error('loadAssets error', err);
    tbody.innerHTML = `<tr><td colspan="10" class="loading-row">Error: ${escHtml(String(err))}</td></tr>`;
  }
}

function updateDeptFilter(assets) {
  const depts = [...new Set(assets.map(a => a.department).filter(Boolean))].sort();
  if (JSON.stringify(depts) === JSON.stringify(allDepartments)) return;
  allDepartments = depts;

  const sel = document.getElementById('filter-dept');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All Departments</option>' +
    depts.map(d => `<option ${d === cur ? 'selected' : ''}>${escHtml(d)}</option>`).join('');
}

// Delegated click handler for asset table
document.getElementById('asset-table-body').addEventListener('click', async e => {
  const btn    = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id     = parseInt(btn.dataset.id, 10);

  if (action === 'view')   openAssetModal(id);
  if (action === 'edit')   openEditForm(id);
  if (action === 'delete') confirmDelete(id);
});

// Debounced search
let searchTimer = null;
document.getElementById('search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadAssets, 300);
});

['filter-type', 'filter-status', 'filter-dept'].forEach(id => {
  document.getElementById(id).addEventListener('change', loadAssets);
});

document.getElementById('btn-clear-filters').addEventListener('click', () => {
  document.getElementById('search-input').value = '';
  document.getElementById('filter-type').value   = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-dept').value   = '';
  loadAssets();
});

// ---------------------------------------------------------------------------
// Asset detail modal
// ---------------------------------------------------------------------------
async function openAssetModal(id) {
  currentAssetId = id;
  const modal = document.getElementById('asset-modal');

  try {
    const a = await invoke('get_asset', { id });
    document.getElementById('modal-body').innerHTML = buildDetailTable(a);
    modal.showModal();
  } catch (err) {
    showToast('Failed to load asset: ' + err, 'error');
  }
}

function buildDetailTable(a) {
  const rows = [
    ['Asset Tag',        escHtml(a.asset_tag)],
    ['Type',             escHtml(a.asset_type)],
    ['Make',             escHtml(a.make  || '—')],
    ['Model',            escHtml(a.model || '—')],
    ['Serial Number',    escHtml(a.serial_number || '—')],
    ['Assigned To',      escHtml(a.assigned_to   || '—')],
    ['Department',       escHtml(a.department     || '—')],
    ['Location',         escHtml(a.location       || '—')],
    ['Status',           statusBadge(a.status)],
    ['Purchase Date',    escHtml(a.purchase_date  || '—')],
    ['Warranty Expiry',  warrantyDisplay(a.warranty_expiry)],
    ['Notes',            `<span style="white-space:pre-wrap">${escHtml(a.notes || '—')}</span>`],
    ['Created',          escHtml(a.created_at || '—')],
    ['Last Updated',     escHtml(a.updated_at || '—')],
  ];

  return `<table class="detail-table">
    ${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}
  </table>`;
}

document.getElementById('modal-close').addEventListener('click',  () => document.getElementById('asset-modal').close());
document.getElementById('modal-cancel').addEventListener('click', () => document.getElementById('asset-modal').close());

document.getElementById('modal-edit').addEventListener('click', () => {
  document.getElementById('asset-modal').close();
  openEditForm(currentAssetId);
});

document.getElementById('modal-delete').addEventListener('click', () => {
  document.getElementById('asset-modal').close();
  confirmDelete(currentAssetId);
});

// ---------------------------------------------------------------------------
// Confirm-delete dialog
// ---------------------------------------------------------------------------
function confirmDelete(id) {
  currentAssetId = id;
  document.getElementById('confirm-dialog').showModal();
}

document.getElementById('confirm-no').addEventListener('click', () => {
  document.getElementById('confirm-dialog').close();
});

document.getElementById('confirm-yes').addEventListener('click', async () => {
  document.getElementById('confirm-dialog').close();
  try {
    await invoke('delete_asset', { id: currentAssetId });
    showToast('Asset deleted.', 'success');
    showView('assets');
  } catch (err) {
    showToast('Delete failed: ' + err, 'error');
  }
});

// ---------------------------------------------------------------------------
// Add / Edit form
// ---------------------------------------------------------------------------
function openAddForm() {
  currentAssetId = null;
  document.getElementById('form-title').textContent = 'Add Asset';
  document.getElementById('btn-submit').textContent = 'Save Asset';
  clearForm();
}

async function openEditForm(id) {
  currentAssetId = id;
  document.getElementById('form-title').textContent = 'Edit Asset';
  document.getElementById('btn-submit').textContent = 'Update Asset';
  clearForm();

  try {
    const a = await invoke('get_asset', { id });
    document.getElementById('f-id').value       = a.id ?? '';
    document.getElementById('f-tag').value      = a.asset_tag;
    document.getElementById('f-type').value     = a.asset_type;
    document.getElementById('f-make').value     = a.make    ?? '';
    document.getElementById('f-model').value    = a.model   ?? '';
    document.getElementById('f-serial').value   = a.serial_number ?? '';
    document.getElementById('f-user').value     = a.assigned_to   ?? '';
    document.getElementById('f-dept').value     = a.department    ?? '';
    document.getElementById('f-loc').value      = a.location      ?? '';
    document.getElementById('f-status').value   = a.status;
    document.getElementById('f-purchase').value = a.purchase_date  ?? '';
    document.getElementById('f-warranty').value = a.warranty_expiry ?? '';
    document.getElementById('f-notes').value    = a.notes          ?? '';

    showView('add');
  } catch (err) {
    showToast('Failed to load asset: ' + err, 'error');
  }
}

function clearForm() {
  document.getElementById('asset-form').reset();
  document.getElementById('f-id').value = '';
  document.getElementById('form-error').textContent = '';
  document.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
}

document.getElementById('btn-cancel').addEventListener('click', () => {
  showView('assets');
});

document.getElementById('asset-form').addEventListener('submit', async e => {
  e.preventDefault();
  document.getElementById('form-error').textContent = '';

  // Client-side validation
  const tag    = document.getElementById('f-tag').value.trim();
  const type   = document.getElementById('f-type').value;
  const status = document.getElementById('f-status').value;

  let valid = true;
  [['f-tag', tag], ['f-type', type], ['f-status', status]].forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!val) { el.classList.add('invalid'); valid = false; }
    else        el.classList.remove('invalid');
  });

  if (!valid) {
    document.getElementById('form-error').textContent = 'Please fill in all required fields.';
    return;
  }

  const asset = {
    id:              document.getElementById('f-id').value ? parseInt(document.getElementById('f-id').value, 10) : null,
    asset_tag:       tag,
    asset_type:      type,
    make:            document.getElementById('f-make').value.trim()    || null,
    model:           document.getElementById('f-model').value.trim()   || null,
    serial_number:   document.getElementById('f-serial').value.trim()  || null,
    assigned_to:     document.getElementById('f-user').value.trim()    || null,
    department:      document.getElementById('f-dept').value.trim()    || null,
    location:        document.getElementById('f-loc').value.trim()     || null,
    status,
    purchase_date:   document.getElementById('f-purchase').value  || null,
    warranty_expiry: document.getElementById('f-warranty').value  || null,
    notes:           document.getElementById('f-notes').value.trim() || null,
    created_at:      null,
    updated_at:      null,
  };

  try {
    if (asset.id) {
      await invoke('update_asset', { asset });
      showToast(`Asset "${tag}" updated.`, 'success');
    } else {
      await invoke('create_asset', { asset });
      showToast(`Asset "${tag}" created.`, 'success');
    }
    showView('assets');
  } catch (err) {
    document.getElementById('form-error').textContent = String(err);
    showToast(String(err), 'error');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadge(status) {
  const map = {
    'Active':      'badge-active',
    'In Storage':  'badge-storage',
    'In Repair':   'badge-repair',
    'Retired':     'badge-retired',
    'Lost/Stolen': 'badge-lost',
  };
  const cls = map[status] ?? 'badge-storage';
  return `<span class="badge ${cls}">${escHtml(status)}</span>`;
}

function warrantyDisplay(dateStr) {
  if (!dateStr) return '<span class="text-muted">—</span>';
  const today   = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry  = new Date(dateStr);
  const diffMs  = expiry - today;
  const diffDays = Math.ceil(diffMs / 86400000);

  if (diffDays < 0)   return `<span class="warranty-expiring" title="Expired">⚠ ${dateStr}</span>`;
  if (diffDays <= 90) return `<span class="warranty-warning"  title="${diffDays} days remaining">⚠ ${dateStr}</span>`;
  return escHtml(dateStr);
}

// ---------------------------------------------------------------------------
// Keyboard: close modals on Escape (already handled by <dialog> natively)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => { init(); });
