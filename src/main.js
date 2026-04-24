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

function showView(name, skipFormInit = false) {
  views.forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  navItems.forEach(n => n.classList.toggle('active', n.dataset.view === name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'assets')    loadAssets();
  if (name === 'add' && !skipFormInit) openAddForm();
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
          <button class="btn btn-icon" data-action="loan"   data-id="${a.id}" title="Loan">📋</button>
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
  if (action === 'loan')   openLoanDialog(id);
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

    showView('add', true);
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
// Report export
// ---------------------------------------------------------------------------
document.getElementById('btn-export-report').addEventListener('click', () => {
  document.getElementById('report-error').textContent = '';
  document.getElementById('report-dialog').showModal();
});

document.getElementById('report-close').addEventListener('click',  () => document.getElementById('report-dialog').close());
document.getElementById('btn-report-cancel').addEventListener('click', () => document.getElementById('report-dialog').close());

document.getElementById('report-select-all').addEventListener('click', () => {
  document.querySelectorAll('input[name="report-col"]').forEach(cb => { cb.checked = true; });
});

document.getElementById('report-select-none').addEventListener('click', () => {
  document.querySelectorAll('input[name="report-col"]').forEach(cb => { cb.checked = false; });
});

document.getElementById('btn-generate-report').addEventListener('click', async () => {
  const errorEl = document.getElementById('report-error');
  errorEl.textContent = '';

  const columns = [...document.querySelectorAll('input[name="report-col"]:checked')]
    .map(cb => cb.value);

  if (columns.length === 0) {
    errorEl.textContent = 'Please select at least one column.';
    return;
  }

  const status     = document.getElementById('report-filter-status').value || null;
  const assetType  = document.getElementById('report-filter-type').value   || null;
  const department = document.getElementById('report-filter-dept').value.trim() || null;

  try {
    const csvData = await invoke('export_report', { columns, status, assetType, department });

    // Trigger CSV file download via a temporary anchor element.
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `inventory-report-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    document.getElementById('report-dialog').close();
    showToast('Report exported successfully.', 'success');
  } catch (err) {
    errorEl.textContent = String(err);
    showToast('Export failed: ' + err, 'error');
  }
});

// ---------------------------------------------------------------------------
// View Report (HTML preview + print)
// ---------------------------------------------------------------------------

/** Minimal CSV parser that handles RFC-4180 quoting. */
function parseCSV(text) {
  const lines = [];
  let cur = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cur.push(field); field = '';
      } else if (ch === '\n') {
        cur.push(field); field = '';
        if (cur.length > 1 || cur[0] !== '') lines.push(cur);
        cur = [];
      } else if (ch !== '\r') {
        field += ch;
      }
    }
  }
  if (field !== '' || cur.length > 0) {
    cur.push(field);
    if (cur.length > 1 || cur[0] !== '') lines.push(cur);
  }
  return lines;
}

function escAttr(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build a self-contained HTML report string from CSV data and filter context. */
function buildHtmlReport(csvText, { status, assetType, department }) {
  const rows = parseCSV(csvText);
  if (rows.length === 0) return '<p>No data.</p>';

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const total = dataRows.length;

  // Compute per-status counts if the "Status" column is present.
  const statusIdx = headers.indexOf('Status');
  const statusCounts = {};
  if (statusIdx !== -1) {
    for (const r of dataRows) {
      const s = r[statusIdx] || 'Unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
  }

  const date = new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  // Build filter description.
  const filterParts = [];
  if (status)     filterParts.push(`Status: <strong>${escAttr(status)}</strong>`);
  if (assetType)  filterParts.push(`Type: <strong>${escAttr(assetType)}</strong>`);
  if (department) filterParts.push(`Department: <strong>${escAttr(department)}</strong>`);
  const filterHtml = filterParts.length
    ? `<p class="filters">Filters applied: ${filterParts.join(' &nbsp;|&nbsp; ')}</p>`
    : '<p class="filters">Filters applied: <strong>None (all assets)</strong></p>';

  // Build summary stat cards.
  const statOrder = ['Active', 'In Storage', 'In Repair', 'Retired', 'Lost/Stolen'];
  const statIcons = { Active: '✅', 'In Storage': '📦', 'In Repair': '🔧', Retired: '🗄️', 'Lost/Stolen': '🚨' };
  let statsHtml = `<div class="stat-card"><span class="stat-num">${total}</span><span class="stat-lbl">🖥️ Total Assets</span></div>`;
  if (statusIdx !== -1) {
    for (const s of statOrder) {
      if (statusCounts[s] !== undefined) {
        statsHtml += `<div class="stat-card"><span class="stat-num">${statusCounts[s]}</span><span class="stat-lbl">${statIcons[s] ?? ''} ${escAttr(s)}</span></div>`;
      }
    }
  }

  // Build the data table.
  const theadCells = headers.map(h => `<th>${escAttr(h)}</th>`).join('');
  const tbodyRows = dataRows.map((r, i) => {
    const cells = headers.map((_, ci) => {
      const val = r[ci] ?? '';
      if (headers[ci] === 'Status') {
        const cls = { Active: 'badge-active', 'In Storage': 'badge-storage', 'In Repair': 'badge-repair', Retired: 'badge-retired', 'Lost/Stolen': 'badge-lost' }[val] ?? '';
        return `<td><span class="badge ${cls}">${escAttr(val)}</span></td>`;
      }
      return `<td>${escAttr(val) || '<span class="muted">—</span>'}</td>`;
    }).join('');
    return `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">${cells}</tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>IT Asset Report – Valley Credit Union</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1e2733;
      background: #f4f7fb;
      padding: 32px;
    }
    .report-header {
      background: #1a3a5c;
      color: #fff;
      border-radius: 8px;
      padding: 24px 28px 20px;
      margin-bottom: 22px;
    }
    .report-header h1 { font-size: 1.4rem; font-weight: 700; letter-spacing: .02em; }
    .report-header .subtitle { font-size: .85rem; color: rgba(255,255,255,.7); margin-top: 4px; }
    .report-header .generated { font-size: .8rem; color: #d4a017; margin-top: 8px; font-weight: 600; }
    .filters { font-size: .85rem; color: #5a6a7e; margin-bottom: 18px; }
    .stats-row { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
    .stat-card {
      background: #fff;
      border-radius: 8px;
      padding: 14px 18px;
      border-left: 4px solid #1a3a5c;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 110px;
      box-shadow: 0 1px 4px rgba(26,58,92,.1);
    }
    .stat-num { font-size: 1.6rem; font-weight: 700; color: #1a3a5c; line-height: 1; }
    .stat-lbl { font-size: .72rem; color: #5a6a7e; margin-top: 4px; text-align: center; }
    .table-wrap {
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(26,58,92,.1);
      overflow-x: auto;
      margin-bottom: 18px;
    }
    table { width: 100%; border-collapse: collapse; font-size: .82rem; }
    thead { background: #1a3a5c; color: #fff; }
    th {
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      font-size: .72rem;
      letter-spacing: .06em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    td { padding: 9px 12px; vertical-align: middle; border-bottom: 1px solid #d0dae8; }
    .row-even { background: #fff; }
    .row-odd  { background: #f4f7fb; }
    tr:last-child td { border-bottom: none; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 20px;
      font-size: .72rem;
      font-weight: 600;
      white-space: nowrap;
    }
    .badge-active   { background: #d4edda; color: #1e7e34; }
    .badge-storage  { background: #d1ecf1; color: #0c5460; }
    .badge-repair   { background: #fff3cd; color: #856404; }
    .badge-retired  { background: #e9ecef; color: #495057; }
    .badge-lost     { background: #f8d7da; color: #721c24; }
    .muted { color: #8a9ab0; }
    .report-footer {
      font-size: .78rem;
      color: #5a6a7e;
      text-align: center;
      padding-top: 8px;
      border-top: 1px solid #d0dae8;
    }
    .print-btn {
      display: inline-block;
      margin-bottom: 18px;
      padding: 9px 20px;
      background: #1a3a5c;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: .88rem;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { opacity: .88; }
    @media print {
      body { background: #fff; padding: 16px; }
      .print-btn { display: none; }
      .report-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>

  <div class="report-header">
    <h1>IT Asset Inventory Report</h1>
    <p class="subtitle">Valley Credit Union – Annapolis Valley, NS</p>
    <p class="generated">Generated: ${escAttr(date)}</p>
  </div>

  ${filterHtml}

  <div class="stats-row">${statsHtml}</div>

  <div class="table-wrap">
    <table>
      <thead><tr>${theadCells}</tr></thead>
      <tbody>${tbodyRows}</tbody>
    </table>
  </div>

  <p class="report-footer">${total} asset${total !== 1 ? 's' : ''} &nbsp;·&nbsp; Valley Credit Union IT Inventory Manager</p>
</body>
</html>`;
}

document.getElementById('btn-view-report').addEventListener('click', async () => {
  const errorEl = document.getElementById('report-error');
  errorEl.textContent = '';

  const columns = [...document.querySelectorAll('input[name="report-col"]:checked')]
    .map(cb => cb.value);

  if (columns.length === 0) {
    errorEl.textContent = 'Please select at least one column.';
    return;
  }

  const status     = document.getElementById('report-filter-status').value || null;
  const assetType  = document.getElementById('report-filter-type').value   || null;
  const department = document.getElementById('report-filter-dept').value.trim() || null;

  try {
    const csvData = await invoke('export_report', { columns, status, assetType, department });
    const html = buildHtmlReport(csvData, { status, assetType, department });

    const win = window.open('', '_blank');
    if (!win) {
      errorEl.textContent = 'Pop-up was blocked. Please allow pop-ups for this app and try again.';
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();

    document.getElementById('report-dialog').close();
    showToast('Report opened in new window.', 'success');
  } catch (err) {
    errorEl.textContent = String(err);
    showToast('Report failed: ' + err, 'error');
  }
});

// ---------------------------------------------------------------------------
// Single-asset Loan Card
// ---------------------------------------------------------------------------
let loanAsset = null; // asset being loaned

async function openLoanDialog(id) {
  try {
    loanAsset = await invoke('get_asset', { id });
  } catch (err) {
    showToast('Failed to load asset: ' + err, 'error');
    return;
  }

  // Pre-populate asset preview
  const preview = document.getElementById('loan-asset-preview');
  const name = [loanAsset.asset_type, loanAsset.make, loanAsset.model].filter(Boolean).join(' – ');
  preview.innerHTML = `
    <div class="loan-asset-info">
      <strong>${escHtml(loanAsset.asset_tag)}</strong>
      <span>${escHtml(name || '—')}</span>
      ${loanAsset.serial_number ? `<span>S/N: ${escHtml(loanAsset.serial_number)}</span>` : ''}
    </div>`;

  // Set today's date
  document.getElementById('loan-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('loan-name').value  = '';
  document.getElementById('loan-phone').value = '';
  document.getElementById('loan-email').value = '';
  document.getElementById('loan-bldg').value  = '';
  document.getElementById('loan-office').value = '';
  document.getElementById('loan-error').textContent = '';

  document.getElementById('loan-dialog').showModal();
}

document.getElementById('loan-close').addEventListener('click', () => document.getElementById('loan-dialog').close());
document.getElementById('btn-loan-cancel').addEventListener('click', () => document.getElementById('loan-dialog').close());

document.getElementById('btn-generate-loan').addEventListener('click', () => {
  const errorEl = document.getElementById('loan-error');
  const name    = document.getElementById('loan-name').value.trim();
  const date    = document.getElementById('loan-date').value;

  if (!name || !date) {
    errorEl.textContent = 'Borrower Name and Date are required.';
    return;
  }
  errorEl.textContent = '';

  const borrower = {
    name,
    date,
    phone:  document.getElementById('loan-phone').value.trim(),
    email:  document.getElementById('loan-email').value.trim(),
    bldg:   document.getElementById('loan-bldg').value.trim(),
    office: document.getElementById('loan-office').value.trim(),
  };

  const html = buildLoanCardHtml(borrower, [loanAsset]);
  const win = window.open('', '_blank');
  if (!win) {
    errorEl.textContent = 'Pop-up was blocked. Please allow pop-ups and try again.';
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  document.getElementById('loan-dialog').close();
  showToast('Loan card opened.', 'success');
});

// ---------------------------------------------------------------------------
// Multi-asset Loan Card (Dashboard)
// ---------------------------------------------------------------------------
document.getElementById('btn-loan-card').addEventListener('click', openMultiLoanDialog);

async function openMultiLoanDialog() {
  document.getElementById('ml-date').value   = new Date().toISOString().slice(0, 10);
  document.getElementById('ml-name').value   = '';
  document.getElementById('ml-phone').value  = '';
  document.getElementById('ml-email').value  = '';
  document.getElementById('ml-bldg').value   = '';
  document.getElementById('ml-office').value = '';
  document.getElementById('multi-loan-error').textContent = '';

  const listEl = document.getElementById('ml-asset-list');
  listEl.innerHTML = '<p class="loading-row">Loading assets…</p>';

  document.getElementById('multi-loan-dialog').showModal();

  try {
    const assets = await invoke('search_assets', { query: null, assetType: null, status: null, department: null });
    if (assets.length === 0) {
      listEl.innerHTML = '<p class="loading-row">No assets found.</p>';
      return;
    }
    listEl.innerHTML = assets.map(a => {
      const label = [a.asset_type, a.make, a.model].filter(Boolean).join(' ');
      return `
        <label class="ml-asset-row">
          <input type="checkbox" class="ml-asset-cb" value="${a.id}"
            data-tag="${escHtml(a.asset_tag)}"
            data-name="${escHtml(label || a.asset_type)}"
            data-serial="${escHtml(a.serial_number || '')}" />
          <span class="ml-tag">${escHtml(a.asset_tag)}</span>
          <span class="ml-name">${escHtml(label || '—')}</span>
          <span class="ml-serial">${escHtml(a.serial_number || '—')}</span>
        </label>`;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="loading-row">Error loading assets: ${escHtml(String(err))}</p>`;
  }
}

document.getElementById('multi-loan-close').addEventListener('click', () => document.getElementById('multi-loan-dialog').close());
document.getElementById('btn-multi-loan-cancel').addEventListener('click', () => document.getElementById('multi-loan-dialog').close());

document.getElementById('ml-select-all').addEventListener('click', () => {
  document.querySelectorAll('.ml-asset-cb').forEach(cb => { cb.checked = true; });
});

document.getElementById('ml-select-none').addEventListener('click', () => {
  document.querySelectorAll('.ml-asset-cb').forEach(cb => { cb.checked = false; });
});

document.getElementById('btn-generate-multi-loan').addEventListener('click', () => {
  const errorEl = document.getElementById('multi-loan-error');
  const name    = document.getElementById('ml-name').value.trim();
  const date    = document.getElementById('ml-date').value;

  if (!name || !date) {
    errorEl.textContent = 'Borrower Name and Date are required.';
    return;
  }

  const selected = [...document.querySelectorAll('.ml-asset-cb:checked')];
  if (selected.length === 0) {
    errorEl.textContent = 'Please select at least one asset.';
    return;
  }
  errorEl.textContent = '';

  const borrower = {
    name,
    date,
    phone:  document.getElementById('ml-phone').value.trim(),
    email:  document.getElementById('ml-email').value.trim(),
    bldg:   document.getElementById('ml-bldg').value.trim(),
    office: document.getElementById('ml-office').value.trim(),
  };

  const assets = selected.map(cb => ({
    asset_tag:     cb.dataset.tag,
    name:          cb.dataset.name,
    serial_number: cb.dataset.serial,
  }));

  const html = buildLoanCardHtml(borrower, assets);
  const win = window.open('', '_blank');
  if (!win) {
    errorEl.textContent = 'Pop-up was blocked. Please allow pop-ups and try again.';
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  document.getElementById('multi-loan-dialog').close();
  showToast('Loan card opened.', 'success');
});

// ---------------------------------------------------------------------------
// Loan Card HTML builder
// ---------------------------------------------------------------------------
function buildLoanCardHtml(borrower, assets) {
  const logoUrl = 'https://github.com/user-attachments/assets/96b6160c-1efe-4f14-9103-654aac54fb97';

  const equipmentRows = assets.map(a => {
    const equipName = escAttr(a.name || [a.asset_type, a.make, a.model].filter(Boolean).join(' ') || '—');
    return `<tr>
      <td>${equipName}</td>
      <td>${escAttr(a.serial_number || '—')}</td>
      <td>${escAttr(a.asset_tag || '—')}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>VCU IT Dept Loan Card</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #1e2733;
      background: #f4f7fb;
      padding: 32px;
    }
    .loan-card {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 4px 18px rgba(26,58,92,.14);
      max-width: 760px;
      margin: 0 auto;
      padding: 36px 40px 40px;
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 22px;
      border-bottom: 3px solid #1a3a5c;
      padding-bottom: 22px;
      margin-bottom: 26px;
    }
    .card-logo {
      width: 130px;
      flex-shrink: 0;
    }
    .card-logo img {
      width: 100%;
      height: auto;
      display: block;
    }
    .card-title-block { flex: 1; }
    .card-title {
      font-size: 1.35rem;
      font-weight: 700;
      color: #1a3a5c;
      letter-spacing: .02em;
      line-height: 1.25;
    }
    .card-subtitle {
      font-size: .82rem;
      color: #5a6a7e;
      margin-top: 4px;
    }
    .section-title {
      font-size: .78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .07em;
      color: #1a3a5c;
      background: #edf2f9;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 14px;
      border-left: 4px solid #d4a017;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px 28px;
      margin-bottom: 28px;
    }
    .info-field { display: flex; flex-direction: column; gap: 4px; }
    .info-field label {
      font-size: .72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #5a6a7e;
    }
    .info-field .field-line {
      border-bottom: 1.5px solid #1a3a5c;
      min-height: 26px;
      padding-bottom: 3px;
      font-size: .93rem;
      color: #1e2733;
    }
    .equip-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 28px;
      font-size: .88rem;
    }
    .equip-table thead {
      background: #1a3a5c;
      color: #fff;
    }
    .equip-table th {
      padding: 10px 12px;
      text-align: left;
      font-size: .72rem;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .equip-table td {
      padding: 9px 12px;
      border-bottom: 1px solid #d0dae8;
      vertical-align: middle;
    }
    .equip-table tbody tr:nth-child(odd)  { background: #f4f7fb; }
    .equip-table tbody tr:nth-child(even) { background: #fff; }
    .equip-table tbody tr:last-child td { border-bottom: 2px solid #1a3a5c; }
    .sig-section {
      margin-top: 4px;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-top: 14px;
    }
    .sig-box { display: flex; flex-direction: column; gap: 6px; }
    .sig-box label {
      font-size: .72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .05em;
      color: #5a6a7e;
    }
    .sig-line {
      border-bottom: 1.5px solid #1a3a5c;
      min-height: 50px;
    }
    .card-footer {
      margin-top: 28px;
      font-size: .73rem;
      color: #8a9ab0;
      text-align: center;
      border-top: 1px solid #d0dae8;
      padding-top: 12px;
    }
    .print-btn {
      display: inline-block;
      margin-bottom: 20px;
      padding: 9px 22px;
      background: #1a3a5c;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: .88rem;
      font-weight: 600;
      cursor: pointer;
    }
    .print-btn:hover { opacity: .88; }
    @media print {
      body { background: #fff; padding: 12px; }
      .loan-card { box-shadow: none; border-radius: 0; padding: 20px 24px; }
      .print-btn { display: none; }
      .card-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .equip-table thead { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .section-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div style="max-width:760px;margin:0 auto 16px;">
    <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>

  <div class="loan-card">

    <!-- Header -->
    <div class="card-header">
      <div class="card-logo">
        <img src="${logoUrl}" alt="Valley Credit Union logo" />
      </div>
      <div class="card-title-block">
        <div class="card-title">Valley Credit Union – IT Dept Loan Card</div>
        <div class="card-subtitle">Annapolis Valley, NS &nbsp;|&nbsp; IT Department Equipment Loan Agreement</div>
      </div>
    </div>

    <!-- Borrower info -->
    <div class="section-title">Borrower Information</div>
    <div class="info-grid">
      <div class="info-field">
        <label>Name</label>
        <div class="field-line">${escAttr(borrower.name)}</div>
      </div>
      <div class="info-field">
        <label>Date</label>
        <div class="field-line">${escAttr(borrower.date)}</div>
      </div>
      <div class="info-field">
        <label>Phone</label>
        <div class="field-line">${escAttr(borrower.phone)}</div>
      </div>
      <div class="info-field">
        <label>Email</label>
        <div class="field-line">${escAttr(borrower.email)}</div>
      </div>
      <div class="info-field">
        <label>Building</label>
        <div class="field-line">${escAttr(borrower.bldg)}</div>
      </div>
      <div class="info-field">
        <label>Office</label>
        <div class="field-line">${escAttr(borrower.office)}</div>
      </div>
    </div>

    <!-- Equipment -->
    <div class="section-title">Equipment on Loan</div>
    <table class="equip-table">
      <thead>
        <tr>
          <th>Equipment Name</th>
          <th>Serial Number</th>
          <th>Asset Tag</th>
        </tr>
      </thead>
      <tbody>
        ${equipmentRows}
      </tbody>
    </table>

    <!-- Signature -->
    <div class="sig-section">
      <div class="section-title">Acknowledgement &amp; Signature</div>
      <div class="sig-grid">
        <div class="sig-box">
          <label>Print Name</label>
          <div class="sig-line"></div>
        </div>
        <div class="sig-box">
          <label>Signature</label>
          <div class="sig-line"></div>
        </div>
      </div>
    </div>

    <div class="card-footer">
      Valley Credit Union &nbsp;·&nbsp; IT Department &nbsp;·&nbsp; Equipment Loan Record
    </div>

  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Keyboard: close modals on Escape (already handled by <dialog> natively)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => { init(); });
