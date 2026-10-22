/* 实验室报价系统 · 基础层：请求、工具、弹窗、路由 */
'use strict';

const ICON = {
  dashboard: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  items: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>',
  customers: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  quotes: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/><path d="M12 11v6"/><path d="M9.5 12.5h5"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.14.35.4.64.73.83.3.17.64.26 1 .26H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  close: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  download: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  upload: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  doc: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  money: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 9h8M8 13h8M12 9v7M9.5 6.5l2.5 2.5L14.5 6.5"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  empty: '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/></svg>',
  folder: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z"/></svg>',
  starOn: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.7l6.1-.9z"/></svg>',
  grip: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>',
  chevronUp: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>',
  chevronDown: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
  library: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M12 7v6M9 10h6"/></svg>',
};

const NAV = [
  { id: 'dashboard', name: '仪表盘', icon: ICON.dashboard },
  { id: 'items', name: '项目库', icon: ICON.items },
  { id: 'customers', name: '客户管理', icon: ICON.customers },
  { id: 'quotes', name: '报价单', icon: ICON.quotes },
  { id: 'settings', name: '系统设置', icon: ICON.settings },
];

const STATUS = {
  draft: { text: '草稿', cls: 'draft' },
  sent: { text: '已发送', cls: 'sent' },
  confirmed: { text: '已确认', cls: 'confirmed' },
  rejected: { text: '已拒绝', cls: 'rejected' },
};

const state = {
  view: 'dashboard',
  settings: {},
  systemInfo: {},
  categories: [],
  itemsState: { search: '', category_id: 0, starred: 0, page: 1, page_size: 50, total: 0, rows: [] },
  quotesState: { search: '', status: '', batch: false, rows: [] },
  customersState: { search: '', rows: [] },
};

/* ------------------------------------------------------------ 工具 */
function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n) {
  const v = Number(n || 0);
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function money0(n) {
  return Number(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setDate(d.getDate() + Number(days || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function uid() { return Math.random().toString(36).slice(2, 10); }

const UPPER_DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
function rmbUpper(amount) {
  const num = Math.round(Math.abs(Number(amount || 0)) * 100) / 100;
  const neg = Number(amount) < 0;
  if (num === 0) return '零元整';
  const integer = Math.floor(num);
  const cents = Math.round((num - integer) * 100);
  const units = ['', '拾', '佰', '仟'];
  const sections = ['', '万', '亿', '万亿'];
  const groups = [];
  let m = integer;
  while (m > 0) {
    groups.push(m % 10000);
    m = Math.floor(m / 10000);
  }
  let out = '', prevLen = 4;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g === 0) {
      if (out && !out.startsWith('零')) out = '零' + out;
      prevLen = 0;
      continue;
    }
    let part = '', zero = false;
    for (let j = 0; j < 4; j++) {
      const d = Math.floor(g / Math.pow(10, j)) % 10;
      if (d === 0) {
        zero = true;
      } else {
        if (zero && part) part = '零' + part;
        part = UPPER_DIGITS[d] + units[j] + part;
        zero = false;
      }
    }
    if (out && prevLen < 4 && !out.startsWith('零')) out = '零' + out;
    out = part + sections[i] + out;
    prevLen = String(g).length;
  }
  out += '元';
  if (cents === 0) {
    out += '整';
  } else {
    const jiao = Math.floor(cents / 10), fen = cents % 10;
    out += (jiao === 0 && fen) ? '零' : '';
    out += jiao ? UPPER_DIGITS[jiao] + '角' : '';
    out += fen ? UPPER_DIGITS[fen] + '分' : '';
  }
  return (neg ? '负' : '') + out;
}

/* ------------------------------------------------------------ 请求 */
async function api(method, path, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opt);
  } catch (e) {
    toast('无法连接本地服务，请重启程序', 'error');
    throw e;
  }
  const data = await res.json().catch(() => ({ ok: false, error: '响应解析失败' }));
  if (!data.ok) {
    toast(data.error || '操作失败', 'error');
    throw new Error(data.error || '操作失败');
  }
  return data.data;
}
const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PUT = (p, b) => api('PUT', p, b);
const DEL = (p) => api('DELETE', p);

/* ------------------------------------------------------------ 提示 */
function toast(msg, type) {
  const wrap = $('#toastWrap');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s, transform .25s';
    el.style.opacity = '0';
    el.style.transform = 'translateY(-10px)';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

/* ------------------------------------------------------------ 弹窗 */
function closeModal() {
  const root = $('#modalRoot');
  root.innerHTML = '';
}
function openModal(opt) {
  const root = $('#modalRoot');
  const mask = document.createElement('div');
  mask.className = 'mask';
  mask.innerHTML = `
    <div class="modal ${opt.width === 'wide' ? 'wide' : ''}">
      <div class="modal-head">
        <h3>${esc(opt.title || '')}</h3>
        <button class="modal-close" data-close>${ICON.close}</button>
      </div>
      <div class="modal-body">${opt.body || ''}</div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-close>${esc(opt.cancelText || '取消')}</button>
        ${opt.hideOk ? '' : `<button class="btn btn-primary" data-ok>${esc(opt.okText || '保存')}</button>`}
      </div>
    </div>`;
  root.appendChild(mask);
  mask.addEventListener('click', (e) => {
    if (e.target === mask) { closeModal(); return; }
    if (e.target.closest('[data-close]')) { closeModal(); return; }
    if (e.target.closest('[data-ok]')) { if (opt.onOk) opt.onOk(mask); }
  });
  const first = mask.querySelector('input,select,textarea');
  if (first) setTimeout(() => first.focus(), 60);
  return mask;
}
function confirmBox(msg, onOk, danger) {
  openModal({
    title: danger ? '危险操作确认' : '操作确认',
    body: `<p style="font-size:14px;line-height:1.8">${msg}</p>`,
    okText: danger ? '确认删除' : '确定',
    onOk: (mask) => { closeModal(); onOk(); },
  });
  if (danger) {
    const okBtn = $('#modalRoot [data-ok]');
    if (okBtn) okBtn.className = 'btn btn-danger-solid';
  }
}
function field(label, inner, hint) {
  return `<div class="field"><label>${esc(label)}</label>${inner}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`;
}
function input(name, value, attrs) {
  return `<input class="input" name="${name}" value="${esc(value === undefined || value === null ? '' : value)}" ${attrs || ''}>`;
}
function textarea(name, value, attrs) {
  return `<textarea class="textarea" name="${name}" ${attrs || ''}>${esc(value === undefined || value === null ? '' : value)}</textarea>`;
}
function select(name, options, value, attrs) {
  const opts = options.map(o => {
    const val = typeof o === 'object' ? o.value : o;
    const txt = typeof o === 'object' ? o.text : o;
    return `<option value="${esc(val)}" ${String(val) === String(value) ? 'selected' : ''}>${esc(txt)}</option>`;
  }).join('');
  return `<select class="select" name="${name}" ${attrs || ''}>${opts}</select>`;
}
function formData(mask) {
  const obj = {};
  $$('[name]', mask).forEach(el => {
    if (el.type === 'checkbox') obj[el.name] = el.checked ? 1 : 0;
    else obj[el.name] = el.value;
  });
  return obj;
}

/* ------------------------------------------------------------ 主题（明亮 / 深色） */
const THEME_KEY = 'lq-theme';

function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function setTheme(t, persist) {
  document.documentElement.dataset.theme = t;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#070b16' : '#e9eef7');
  if (persist !== false) {
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* 隐私模式下忽略 */ }
  }
}

function bindThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  setTheme(getTheme(), false);
  btn.addEventListener('click', () => {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });
}

/* ------------------------------------------------------------ 路由 */
function renderNav() {
  $('#nav').innerHTML = NAV.map(n =>
    `<div class="nav-item ${state.view === n.id ? 'active' : ''}" data-view="${n.id}">${n.icon}<span>${n.name}</span></div>`
  ).join('');
  $$('#nav .nav-item').forEach(el => el.addEventListener('click', () => go(el.dataset.view)));
}
function setTitle(title) { $('#pageTitle').textContent = title; }
function setActions(html) { $('#topActions').innerHTML = html; }

const VIEWS = {};
function go(view) {
  state.view = view;
  renderNav();
  const viewEl = $('#view');
  // iOS 风格推入动画：先重置再触发，保证连续切换也重播
  viewEl.classList.remove('view-anim');
  void viewEl.offsetWidth;
  viewEl.classList.add('view-anim');
  viewEl.innerHTML = '<div class="loading">加载中…</div>';
  setActions('');
  (VIEWS[view] || VIEWS.dashboard)();
}

async function bootstrap() {
  try {
    state.settings = await GET('/api/settings');
  } catch (e) {
    state.settings = {};
  }
  try {
    state.systemInfo = await GET('/api/system/info');
  } catch (e) {
    state.systemInfo = {};
  }
  bindThemeToggle();
  renderSidebarFoot();
  renderNav();
  go('dashboard');
}

/** 侧栏底部提示：按当前数据存放模式显示准确文案。 */
function renderSidebarFoot() {
  const el = document.getElementById('sidebarFoot');
  if (!el) return;
  const mode = (state.systemInfo && state.systemInfo.mode) || '';
  const map = {
    docker: '数据保存在服务器 · 挂载卷持久化',
    custom: '数据保存在自定义目录',
    portable: '数据随程序存放 · 便携模式',
    local: '数据保存在本机 · 支持离线使用',
  };
  el.textContent = map[mode] || '数据保存在本机 · 支持离线使用';
}
