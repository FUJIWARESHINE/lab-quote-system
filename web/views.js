/* 实验室报价系统 · 页面视图：仪表盘 / 项目库 / 客户 / 报价单 / 设置 */
'use strict';

/**
 * 触发浏览器下载（把 base64 内容存成本地文件）。
 */
function downloadBase64(name, b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || '报价单.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** 服务器模式导出完成后的提示弹窗（桌面版可打开文件夹）。 */
function exportDone(path, name) {
  const inDocker = state.systemInfo && state.systemInfo.mode === 'docker';
  openModal({
    title: '已保存到服务器',
    body: `
      <p style="font-size:14px;margin-bottom:6px">文件已生成在服务器：</p>
      <p style="font-size:13px;color:var(--text2);word-break:break-all;background:var(--gray-bg);padding:10px 12px;border-radius:10px">${esc(path)}</p>
      <p class="hint">${inDocker ? '该目录已挂载到宿主机，可直接从宿主机取用。' : '可直接把该文件通过邮件/微信发送给客户。'}</p>`,
    okText: inDocker ? '确定' : '打开文件夹',
    cancelText: '关闭',
    onOk: () => {
      closeModal();
      if (!inDocker) POST('/api/system/open', { path, select: true }).catch(() => {});
    },
  });
  if (inDocker) return;
  const foot = $('#modalRoot .modal-foot');
  if (foot) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-green';
    btn.textContent = '打开文件';
    btn.onclick = () => { closeModal(); POST('/api/system/open', { path }).catch(() => {}); };
    foot.insertBefore(btn, foot.firstChild);
  }
}

/**
 * 导出报价单：先让用户选择「下载到本机」还是「保存到服务器」。
 * @param {number} qid 报价单 ID
 * @param {Function} [afterLocal] 下载到本机后的回调（如刷新列表）
 */
function chooseExportTarget(qid, afterLocal) {
  openModal({
    title: '导出报价单',
    body: `
      <p style="font-size:14px;margin-bottom:12px">请选择 Excel 报价单的保存位置：</p>
      <div class="export-choice">
        <button class="export-opt" id="expLocal">
          <span class="export-opt-ico">${ICON.download}</span>
          <span class="export-opt-t">下载到本机</span>
          <span class="export-opt-d">保存到你当前电脑的下载文件夹</span>
        </button>
        <button class="export-opt" id="expServer">
          <span class="export-opt-ico">${ICON.folder}</span>
          <span class="export-opt-t">保存到服务器</span>
          <span class="export-opt-d">生成在服务器的数据目录，供统一取用</span>
        </button>
      </div>`,
    cancelText: '取消',
    hideOk: true,
  });

  $('#expLocal').onclick = async () => {
    closeModal();
    try {
      const r = await POST(`/api/quotes/${qid}/export`, { mode: 'local' });
      downloadBase64(r.name, r.content);
      toast('已下载到本机：' + r.name, 'success');
      if (afterLocal) afterLocal();
    } catch (e) { /* 已提示 */ }
  };
  $('#expServer').onclick = async () => {
    closeModal();
    try {
      const r = await POST(`/api/quotes/${qid}/export`, { mode: 'server' });
      exportDone(r.path, r.name);
      if (afterLocal) afterLocal();
    } catch (e) { /* 已提示 */ }
  };
}

/* ============================================================ 仪表盘 */
VIEWS.dashboard = async function () {
  setTitle('仪表盘');
  let d;
  try { d = await GET('/api/dashboard'); } catch (e) { return; }
  const s = d.status || {};
  const totalStatus = Object.values(s).reduce((a, b) => a + b, 0) || 1;
  const maxAmount = Math.max(1, ...(d.months || []).map(m => m.amount));
  const statusDef = [
    { key: 'draft', name: '草稿', color: '#94a3b8' },
    { key: 'sent', name: '已发送', color: '#2563eb' },
    { key: 'confirmed', name: '已确认', color: '#16a34a' },
    { key: 'rejected', name: '已拒绝', color: '#dc2626' },
  ];
  $('#view').innerHTML = `
    <div class="kpi-grid">
      <div class="kpi">
        <div class="k-label">${ICON.quotes}报价单总数</div>
        <div class="k-num">${d.total_quotes || 0}</div>
        <div class="k-sub">累计创建的报价单</div>
      </div>
      <div class="kpi purple">
        <div class="k-label">${ICON.money}本月报价金额</div>
        <div class="k-num">¥ ${money0(d.month_amount)}</div>
        <div class="k-sub">${today().slice(0, 7)} 起统计</div>
      </div>
      <div class="kpi green">
        <div class="k-label">${ICON.check}已确认金额</div>
        <div class="k-num">¥ ${money0(d.confirmed_amount)}</div>
        <div class="k-sub">客户已确认的报价</div>
      </div>
      <div class="kpi amber">
        <div class="k-label">${ICON.items}项目库 / 客户</div>
        <div class="k-num">${d.item_count || 0} <span style="font-size:15px;color:var(--text3)">/ ${d.customer_count || 0}</span></div>
        <div class="k-sub">检测项目条目 / 客户数量</div>
      </div>
    </div>
    <div class="dash-grid">
      <div class="card">
        <div class="card-head"><h3>近 6 个月报价金额</h3><span class="hint">单位：元</span></div>
        <div class="card-body">
          <div class="chart">
            ${(d.months || []).map(m => `
              <div class="chart-col">
                <div class="chart-bar" style="height:${Math.max(4, (m.amount / maxAmount) * 100)}%" data-tip="¥ ${money(m.amount)}"></div>
                <div class="chart-label">${esc(m.month)}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>报价单状态分布</h3></div>
        <div class="card-body tight" style="padding-top:14px">
          ${statusDef.map(x => `
            <div class="stat-row">
              <div class="s-name"><i style="width:8px;height:8px;border-radius:50%;background:${x.color};display:inline-block"></i>${x.name}</div>
              <div class="s-bar"><i style="width:${((s[x.key] || 0) / totalStatus) * 100}%;background:${x.color}"></i></div>
              <div class="s-val">${s[x.key] || 0}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-head">
        <h3>最近报价单</h3>
        <button class="btn btn-primary btn-sm" id="btnNewQuote">${ICON.plus}新建报价单</button>
      </div>
      <div class="table-wrap" style="max-height:none">
        ${(d.recent || []).length ? `
        <table class="tbl">
          <thead><tr><th>报价单号</th><th>客户单位</th><th>日期</th><th class="num">金额（元）</th><th>状态</th><th style="width:160px">操作</th></tr></thead>
          <tbody>
            ${d.recent.map(q => `
              <tr>
                <td style="font-weight:600">${esc(q.quote_no)}</td>
                <td>${esc(q.customer_name || '—')}</td>
                <td>${esc(q.quote_date || '')}</td>
                <td class="num">${money(q.total)}</td>
                <td><span class="badge ${(STATUS[q.status] || STATUS.draft).cls}">${(STATUS[q.status] || STATUS.draft).text}</span></td>
                <td>
                  <button class="btn btn-ghost btn-sm" data-edit="${q.id}">${ICON.edit}编辑</button>
                  <button class="btn btn-green btn-sm" data-export="${q.id}">${ICON.download}导出</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>` : `<div class="empty">${ICON.empty}<p>还没有报价单，点击右上角「新建报价单」开始</p></div>`}
      </div>
    </div>`;
  const newBtn = $('#btnNewQuote');
  if (newBtn) newBtn.onclick = () => openQuoteEditor(null);
  $$('[data-edit]').forEach(b => b.onclick = () => openQuoteEditor(Number(b.dataset.edit)));
  $$('[data-export]').forEach(b => b.onclick = () => {
    chooseExportTarget(Number(b.dataset.export), () => go('dashboard'));
  });
};

/* ============================================================ 项目库 */
async function loadCategories() {
  state.categories = await GET('/api/categories').catch(() => []);
  return state.categories;
}

async function renderItemsPage() {
  const st = state.itemsState;
  const res = await GET(`/api/items?search=${encodeURIComponent(st.search)}&category_id=${st.category_id}`
    + `&starred=${st.starred ? 1 : -1}&page=${st.page}&page_size=${st.page_size}`);
  st.rows = res.rows;
  st.total = res.total;
  const pages = Math.max(1, Math.ceil(st.total / st.page_size));
  $('#itemsBody').innerHTML = res.rows.length ? res.rows.map(r => `
    <tr>
      <td class="center" style="width:38px"><input type="checkbox" class="ck" value="${r.id}" style="width:15px;height:15px"></td>
      <td class="center" style="width:46px">
        <button class="btn btn-icon" data-star="${r.id}" data-on="${r.starred ? 1 : 0}" title="${r.starred ? '取消收藏' : '收藏置顶'}"
          style="background:none;border:none;color:${r.starred ? '#f59e0b' : 'var(--text3)'}">${r.starred ? ICON.starOn : ICON.star}</button>
      </td>
      <td style="font-variant-numeric:tabular-nums;color:var(--text2)">${esc(r.code || '—')}</td>
      <td style="font-weight:600">${esc(r.name)}</td>
      <td>${esc(r.category_name)}</td>
      <td style="color:var(--text2);max-width:220px" title="${esc(r.spec || '')}">${esc(r.spec || '—')}</td>
      <td class="center">${esc(r.unit || '项')}</td>
      <td class="num" style="font-weight:600">${money(r.price)}</td>
      <td class="num">${r.price2 ? `<span style="color:var(--accent);font-weight:600">${money(r.price2)}</span>`
        : `<span style="color:var(--text3);font-size:12px">${esc(r.price2_text || '—')}</span>`}</td>
      <td class="num" style="color:var(--text2)">${r.cost ? money(r.cost) : '—'}</td>
      <td class="center"><span class="badge ${r.enabled ? 'on' : 'off'}">${r.enabled ? '启用' : '停用'}</span></td>
      <td class="ops-cell">
        <button class="btn btn-ghost btn-icon" data-edit="${r.id}" title="编辑">${ICON.edit}</button>
        <button class="btn btn-danger btn-icon" data-del="${r.id}" title="删除">${ICON.trash}</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="12"><div class="empty">${ICON.empty}<p>${state.itemsState.starred ? '还没有收藏的项目，点击项目前的 ☆ 即可收藏' : '暂无检测项目，点击「新增项目」或使用 Excel 批量导入'}</p></div></td></tr>`;
  $('#itemsPager').innerHTML = `
    <span>共 ${st.total} 条 · 第 ${st.page}/${pages} 页</span>
    <button class="btn btn-ghost btn-sm" id="pgPrev" ${st.page <= 1 ? 'disabled' : ''}>上一页</button>
    <button class="btn btn-ghost btn-sm" id="pgNext" ${st.page >= pages ? 'disabled' : ''}>下一页</button>`;
  const prev = $('#pgPrev'), next = $('#pgNext');
  if (prev) prev.onclick = () => { st.page--; renderItemsPage(); };
  if (next) next.onclick = () => { st.page++; renderItemsPage(); };
  $$('[data-star]', $('#itemsBody')).forEach(b => b.onclick = async () => {
    const next = b.dataset.on === '1' ? 0 : 1;
    await POST(`/api/items/${b.dataset.star}/star`, { starred: next });
    toast(next ? '已收藏并置顶' : '已取消收藏', 'success');
    renderItemsPage();
  });
  $$('[data-edit]', $('#itemsBody')).forEach(b => b.onclick = () => itemDialog(Number(b.dataset.edit)));
  $$('[data-del]', $('#itemsBody')).forEach(b => b.onclick = () => {
    const id = Number(b.dataset.del);
    const row = st.rows.find(x => x.id === id);
    confirmBox(`确定删除项目「${esc(row ? row.name : '')}」吗？`, async () => {
      await DEL(`/api/items/${id}`);
      toast('已删除', 'success');
      renderItemsPage();
      loadCategories();
    }, true);
  });
}

VIEWS.items = async function () {
  setTitle('项目库');
  await loadCategories();
  const cats = state.categories;
  $('#view').innerHTML = `
    <div class="items-layout">
      <div class="card" style="margin-bottom:0">
        <div class="card-head"><h3>分类</h3><button class="btn btn-ghost btn-sm" id="btnCat">管理</button></div>
        <div class="card-body tight" style="padding-top:10px">
          <div class="cat-list">
            <div class="cat-item ${state.itemsState.category_id === 0 ? 'active' : ''}" data-cat="0"><span>全部项目</span><span class="cnt">${cats.reduce((a, c) => a + (c.item_count || 0), 0)}</span></div>
            ${cats.map(c => `<div class="cat-item ${state.itemsState.category_id === c.id ? 'active' : ''}" data-cat="${c.id}"><span>${esc(c.name)}</span><span class="cnt">${c.item_count || 0}</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="toolbar">
            <div class="search-box"><span>${ICON.search}</span>
              <input class="input" id="itemSearch" placeholder="搜索项目名称 / 编号 / 规格" style="width:250px" value="${esc(state.itemsState.search)}">
            </div>
            <div class="spacer"></div>
            <button class="btn btn-ghost btn-sm" id="btnTpl">${ICON.download}导入模板</button>
            <button class="btn btn-ghost btn-sm" id="btnImport">${ICON.upload}Excel 导入</button>
            <button class="btn btn-ghost btn-sm" id="btnExportItems">${ICON.download}导出</button>
            <button class="btn ${state.itemsState.starred ? 'btn-accent' : 'btn-ghost'} btn-sm" id="btnStarFilter"
              title="只显示已收藏的项目">${ICON.starOn}只看收藏</button>
            <button class="btn btn-danger btn-sm" id="btnDelSel">${ICON.trash}删除所选</button>
            <button class="btn btn-primary" id="btnAddItem">${ICON.plus}新增项目</button>
          </div>
          <div class="table-wrap">
            <table class="tbl fixed">
              <thead><tr>
                <th style="width:3.2%" class="center"><input type="checkbox" id="ckAll" style="width:15px;height:15px"></th>
                <th style="width:4.2%" class="center">★</th>
                <th style="width:9.5%">项目编号</th><th style="width:17%">项目名称</th><th style="width:8%">分类</th>
                <th style="width:15%">规格 / 检测依据</th><th style="width:4.6%" class="center">单位</th>
                <th style="width:8.4%" class="num">常规价(元)</th><th style="width:8.4%" class="num">趋势价(元)</th><th style="width:7.4%" class="num">成本价</th>
                <th style="width:5.5%" class="center">状态</th><th style="width:8.8%" class="center">操作</th>
              </tr></thead>
              <tbody id="itemsBody"></tbody>
            </table>
          </div>
          <div class="pager" id="itemsPager"></div>
        </div>
      </div>
    </div>
    <input type="file" id="fileImport" accept=".xlsx,.xls" style="display:none">`;

  $('#btnAddItem').onclick = () => itemDialog(null);
  $('#btnCat').onclick = categoryDialog;
  $('#btnStarFilter').onclick = () => {
    state.itemsState.starred = state.itemsState.starred ? 0 : 1;
    state.itemsState.page = 1;
    VIEWS.items();
  };
  $('#btnTpl').onclick = async () => {
    const r = await GET('/api/items/template');
    exportDone(r.path, '项目库导入模板.xlsx');
  };
  $('#btnExportItems').onclick = async () => {
    const r = await GET(`/api/items/export?search=${encodeURIComponent(state.itemsState.search)}&category_id=${state.itemsState.category_id}`);
    exportDone(r.path, '项目库.xlsx');
  };
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const r = await POST('/api/items/import', { filename: file.name, content: reader.result });
        toast(`导入完成：新增 ${r.created} 条，更新 ${r.updated} 条`, 'success');
        await loadCategories();
        VIEWS.items();
      } catch (err) { /* 已提示 */ }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
  $('#btnDelSel').onclick = () => {
    const ids = $$('.ck:checked', $('#itemsBody')).map(x => Number(x.value));
    if (!ids.length) return toast('请先勾选要删除的项目', 'warn');
    confirmBox(`确定删除选中的 ${ids.length} 个项目吗？`, async () => {
      await POST('/api/items/delete', { ids });
      toast('已删除', 'success');
      await loadCategories();
      renderItemsPage();
    }, true);
  };
  const searchEl = $('#itemSearch');
  searchEl.oninput = debounce(() => {
    state.itemsState.search = searchEl.value.trim();
    state.itemsState.page = 1;
    renderItemsPage();
  }, 280);
  $$('.cat-item').forEach(el => el.onclick = () => {
    state.itemsState.category_id = Number(el.dataset.cat);
    state.itemsState.page = 1;
    $$('.cat-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    renderItemsPage();
  });
  const ckAll = $('#ckAll');
  ckAll.onchange = () => $$('.ck', $('#itemsBody')).forEach(x => x.checked = ckAll.checked);
  await renderItemsPage();
};

function debounce(fn, ms) {
  let t;
  return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
}

function itemDialog(id) {
  const item = id ? state.itemsState.rows.find(x => x.id === id) : null;
  const cats = [{ value: 0, text: '未分类' }].concat(state.categories.map(c => ({ value: c.id, text: c.name })));
  const body = `
    <div class="grid2">
      ${field('项目编号', input('code', item ? item.code : ''))}
      ${field('项目名称 *', input('name', item ? item.name : ''))}
      ${field('所属分类', select('category_id', cats, item ? item.category_id : (state.itemsState.category_id || 0)))}
      ${field('单位', input('unit', item ? item.unit : '项'))}
      ${field('常规价（元）*', `<input class="input money" name="price" type="number" step="0.01" value="${item ? item.price : ''}">`)}
      ${field('趋势价（元）', `<input class="input money" name="price2" type="number" step="0.01" value="${item && item.price2 ? item.price2 : ''}">`)}
    </div>
    <div style="height:14px"></div>
    ${field('趋势价说明（区间/条件价填这里，留空表示无趋势价）',
      input('price2_text', item ? item.price2_text : '', 'placeholder="如：100-200元/样，需按实际手填"'))}
    <div style="height:14px"></div>
    <div class="grid2">
      ${field('成本价（元）', `<input class="input money" name="cost" type="number" step="0.01" value="${item ? item.cost : ''}">`)}
      <div></div>
    </div>
    <div style="height:14px"></div>
    ${field('规格 / 检测依据', input('spec', item ? item.spec : ''))}
    <div style="height:14px"></div>
    ${field('备注', textarea('note', item ? item.note : ''))}
    <div style="height:14px"></div>
    <div class="grid2">
      ${field('状态', select('enabled', [{ value: 1, text: '启用' }, { value: 0, text: '停用' }], item ? item.enabled : 1))}
      ${field('收藏置顶', select('starred', [{ value: 1, text: '★ 收藏（常用项目置顶显示）' }, { value: 0, text: '不收藏' }], item ? (item.starred || 0) : 0))}
    </div>
    <div class="hint">收藏的项目在项目库与报价面板中都会排在最前面。</div>`;
  openModal({
    title: item ? '编辑项目' : '新增项目',
    body,
    onOk: async (mask) => {
      const d = formData(mask);
      if (!d.name.trim()) return toast('请填写项目名称', 'warn');
      d.price = Number(d.price || 0);
      d.price2 = Number(d.price2 || 0);
      d.cost = Number(d.cost || 0);
      d.category_id = Number(d.category_id || 0);
      d.enabled = Number(d.enabled);
      d.starred = Number(d.starred || 0);
      if (item) await PUT(`/api/items/${item.id}`, d);
      else await POST('/api/items', d);
      closeModal();
      toast(item ? '已保存修改' : '项目已添加', 'success');
      await loadCategories();
      if (state.view === 'items') await renderItemsPage();
    },
  });
}

function categoryDialog() {
  const render = () => {
    const body = `
      <div class="cat-list" style="max-height:280px">
        ${state.categories.map(c => `
          <div class="cat-item" style="border:1px solid var(--border)">
            <span>${esc(c.name)}</span>
            <span>
              <button class="btn btn-ghost btn-sm" data-edit="${c.id}">${ICON.edit}</button>
              <button class="btn btn-danger btn-sm" data-del="${c.id}">${ICON.trash}</button>
            </span>
          </div>`).join('') || '<div class="empty"><p>暂无分类</p></div>'}
      </div>
      <div class="divider"></div>
      <div style="display:flex;gap:10px">
        <input class="input" id="newCat" placeholder="输入新分类名称，如：微生物检测">
        <button class="btn btn-primary" id="btnAddCat">${ICON.plus}添加</button>
      </div>`;
    const mask = openModal({ title: '分类管理', body, hideOk: true });
    mask.querySelector('[data-close]');
    const closeBtn = mask.querySelector('.modal-foot [data-close]');
    if (closeBtn) closeBtn.textContent = '关闭';
    $('#newCat').onkeydown = (e) => { if (e.key === 'Enter') $('#btnAddCat').click(); };
    $('#btnAddCat').onclick = async () => {
      const name = $('#newCat').value.trim();
      if (!name) return toast('请输入分类名称', 'warn');
      await POST('/api/categories', { name });
      await loadCategories();
      closeModal();
      categoryDialog();
      toast('分类已添加', 'success');
    };
    $$('[data-edit]', mask).forEach(b => b.onclick = async () => {
      const c = state.categories.find(x => x.id === Number(b.dataset.edit));
      const name = prompt('重命名分类', c.name);
      if (name && name.trim()) {
        await PUT(`/api/categories/${c.id}`, { name: name.trim() });
        await loadCategories();
        closeModal();
        categoryDialog();
        if (state.view === 'items') VIEWS.items();
      }
    });
    $$('[data-del]', mask).forEach(b => b.onclick = async () => {
      confirmBox('删除分类后，原分类下的项目将变为「未分类」，确定删除吗？', async () => {
        await DEL(`/api/categories/${b.dataset.del}`);
        await loadCategories();
        closeModal();
        categoryDialog();
        if (state.view === 'items') VIEWS.items();
      }, true);
    });
  };
  render();
}

/* ============================================================ 客户 */
async function renderCustomers() {
  const rows = await GET(`/api/customers?search=${encodeURIComponent(state.customersState.search)}`);
  state.customersState.rows = rows;
  $('#customerBody').innerHTML = rows.length ? rows.map(c => `
    <tr>
      <td style="font-weight:600">${esc(c.name)}</td>
      <td>${esc(c.contact || '—')}</td>
      <td>${esc(c.phone || '—')}</td>
      <td style="color:var(--text2);max-width:260px">${esc(c.address || '—')}</td>
      <td style="color:var(--text2)">${esc(c.note || '—')}</td>
      <td style="width:120px">
        <button class="btn btn-ghost btn-sm" data-edit="${c.id}">${ICON.edit}</button>
        <button class="btn btn-danger btn-sm" data-del="${c.id}">${ICON.trash}</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="6"><div class="empty">${ICON.empty}<p>暂无客户，点击「新增客户」添加</p></div></td></tr>`;
  $$('[data-edit]', $('#customerBody')).forEach(b => b.onclick = () => customerDialog(Number(b.dataset.edit)));
  $$('[data-del]', $('#customerBody')).forEach(b => b.onclick = () => {
    confirmBox('确定删除该客户吗？', async () => {
      await DEL(`/api/customers/${b.dataset.del}`);
      toast('已删除', 'success');
      renderCustomers();
    }, true);
  });
}

VIEWS.customers = async function () {
  setTitle('客户管理');
  $('#view').innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="search-box"><span>${ICON.search}</span>
          <input class="input" id="cusSearch" placeholder="搜索客户 / 联系人 / 电话" style="width:250px" value="${esc(state.customersState.search)}">
        </div>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="btnAddCus">${ICON.plus}新增客户</button>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>客户单位</th><th style="width:110px">联系人</th><th style="width:130px">联系电话</th><th>地址</th><th style="width:160px">备注</th><th style="width:120px">操作</th></tr></thead>
          <tbody id="customerBody"></tbody>
        </table>
      </div>
    </div>`;
  $('#btnAddCus').onclick = () => customerDialog(null);
  const el = $('#cusSearch');
  el.oninput = debounce(() => { state.customersState.search = el.value.trim(); renderCustomers(); }, 280);
  await renderCustomers();
};

function customerDialog(id) {
  const c = id ? state.customersState.rows.find(x => x.id === id) : null;
  const body = `
    <div class="grid2">
      ${field('客户单位 *', input('name', c ? c.name : ''))}
      ${field('联系人', input('contact', c ? c.contact : ''))}
      ${field('联系电话', input('phone', c ? c.phone : ''))}
      ${field('税号', input('tax_no', c ? c.tax_no : ''))}
    </div>
    <div style="height:14px"></div>
    ${field('地址', input('address', c ? c.address : ''))}
    <div style="height:14px"></div>
    ${field('开户行 / 账号', input('bank', c ? c.bank : ''))}
    <div style="height:14px"></div>
    ${field('备注', textarea('note', c ? c.note : ''))}`;
  openModal({
    title: c ? '编辑客户' : '新增客户',
    body,
    onOk: async (mask) => {
      const d = formData(mask);
      if (!d.name.trim()) return toast('请填写客户单位', 'warn');
      if (c) await PUT(`/api/customers/${c.id}`, d);
      else await POST('/api/customers', d);
      closeModal();
      toast(c ? '已保存修改' : '客户已添加', 'success');
      renderCustomers();
    },
  });
}

/* ============================================================ 报价单列表 */
async function renderQuotes() {
  const st = state.quotesState;
  const rows = await GET(`/api/quotes?search=${encodeURIComponent(st.search)}&status=${st.status}`);
  st.rows = rows;
  $('#quoteBody').innerHTML = rows.length ? rows.map(q => `
    <tr>
      <td class="ck-col center"><input type="checkbox" class="ck-q" value="${q.id}" style="width:15px;height:15px"></td>
      <td style="font-weight:600;color:var(--primary-dark)">${esc(q.quote_no)}</td>
      <td>${esc(q.customer_name || '—')}<div style="font-size:11px;color:var(--text3)">${esc(q.title || '')}</div></td>
      <td>${esc(q.quote_date || '')}</td>
      <td style="color:var(--text2)">${esc(q.expire_date || '')}</td>
      <td class="center">${q.item_count || 0}</td>
      <td class="num" style="font-weight:600">${money(q.total)}</td>
      <td><span class="badge ${(STATUS[q.status] || STATUS.draft).cls}">${(STATUS[q.status] || STATUS.draft).text}</span></td>
      <td class="ops-cell">
        <button class="btn btn-ghost btn-icon" data-edit="${q.id}" title="编辑">${ICON.edit}</button>
        <button class="btn btn-ghost btn-icon" data-copy="${q.id}" title="复制为新报价单">${ICON.copy}</button>
        <button class="btn btn-green btn-icon" data-export="${q.id}" title="导出 Excel">${ICON.download}</button>
        <button class="btn btn-danger btn-icon" data-del="${q.id}" title="删除">${ICON.trash}</button>
      </td>
    </tr>`).join('') : `<tr><td colspan="9"><div class="empty">${ICON.empty}<p>还没有报价单，点击「新建报价单」创建第一份</p></div></td></tr>`;
  $$('.ck-q', $('#quoteBody')).forEach(el => el.onchange = updateQuoteSel);

  $$('[data-edit]', $('#quoteBody')).forEach(b => b.onclick = () => openQuoteEditor(Number(b.dataset.edit)));
  $$('[data-copy]', $('#quoteBody')).forEach(b => b.onclick = async () => {
    await POST(`/api/quotes/${b.dataset.copy}/duplicate`, {});
    toast('已复制为新报价单', 'success');
    renderQuotes();
  });
  $$('[data-export]', $('#quoteBody')).forEach(b => b.onclick = () => {
    chooseExportTarget(Number(b.dataset.export), () => renderQuotes());
  });
  $$('[data-del]', $('#quoteBody')).forEach(b => b.onclick = () => {
    confirmBox('确定删除该报价单吗？删除后不可恢复。', async () => {
      await DEL(`/api/quotes/${b.dataset.del}`);
      toast('已删除', 'success');
      renderQuotes();
    }, true);
  });
}

VIEWS.quotes = async function () {
  setTitle('报价单');
  $('#view').innerHTML = `
    <div class="card">
      <div class="toolbar">
        <div class="search-box"><span>${ICON.search}</span>
          <input class="input" id="qSearch" placeholder="搜索单号 / 客户 / 项目" style="width:230px" value="${esc(state.quotesState.search)}">
        </div>
        <select class="select" id="qStatus" style="width:130px">
          <option value="">全部状态</option>
          <option value="draft" ${state.quotesState.status === 'draft' ? 'selected' : ''}>草稿</option>
          <option value="sent" ${state.quotesState.status === 'sent' ? 'selected' : ''}>已发送</option>
          <option value="confirmed" ${state.quotesState.status === 'confirmed' ? 'selected' : ''}>已确认</option>
          <option value="rejected" ${state.quotesState.status === 'rejected' ? 'selected' : ''}>已拒绝</option>
        </select>
        <label class="switch" title="开启后可勾选多行，批量删除报价单">
          <input type="checkbox" id="ckQuoteBatch" ${state.quotesState.batch ? 'checked' : ''}>
          <span class="switch-track"></span>
          <span class="switch-text">批量操作</span>
        </label>
        <span class="batch-cnt" id="quoteSelCnt" style="display:${state.quotesState.batch ? '' : 'none'}">已选 <b>0</b> / 0 项</span>
        <div class="spacer"></div>
        <button class="btn btn-danger btn-sm" id="btnDelSelQuotes" style="display:${state.quotesState.batch ? '' : 'none'}">${ICON.trash}删除所选</button>
        <button class="btn btn-primary" id="btnNewQuote2">${ICON.plus}新建报价单</button>
      </div>
      <div class="table-wrap">
        <table class="tbl fixed ${state.quotesState.batch ? 'batch' : ''}" id="quoteTbl">
          <thead><tr><th class="ck-col center" style="width:3.4%"><input type="checkbox" id="ckAllQ" style="width:15px;height:15px"></th>
          <th style="width:13%">报价单号</th><th style="width:24%">客户单位</th><th style="width:10%">报价日期</th>
          <th style="width:10%">有效期至</th><th style="width:6%" class="center">条目</th>
          <th style="width:11%" class="num">金额（元）</th><th style="width:8%">状态</th><th style="width:18%" class="center">操作</th></tr></thead>
          <tbody id="quoteBody"></tbody>
        </table>
      </div>
    </div>`;
  $('#btnNewQuote2').onclick = () => openQuoteEditor(null);
  const s = $('#qSearch');
  s.oninput = debounce(() => { state.quotesState.search = s.value.trim(); renderQuotes(); }, 280);
  $('#qStatus').onchange = (e) => { state.quotesState.status = e.target.value; renderQuotes(); };
  const ckBatch = $('#ckQuoteBatch');
  ckBatch.onchange = () => {
    const on = ckBatch.checked;
    state.quotesState.batch = on;
    $('#quoteTbl').classList.toggle('batch', on);
    $('#btnDelSelQuotes').style.display = on ? '' : 'none';
    $('#quoteSelCnt').style.display = on ? '' : 'none';
    $$('.ck-q', $('#quoteBody')).forEach(x => { x.checked = false; });
    const ckAll = $('#ckAllQ');
    if (ckAll) ckAll.checked = false;
    updateQuoteSel();
    if (on) toast('批量操作已开启：勾选报价单后可批量删除', 'success');
  };
  const ckAll = $('#ckAllQ');
  if (ckAll) ckAll.onchange = () => {
    $$('.ck-q', $('#quoteBody')).forEach(x => { x.checked = ckAll.checked; });
    updateQuoteSel();
  };
  $('#btnDelSelQuotes').onclick = () => {
    const ids = quoteSelIds();
    if (!ids.length) return toast('请先勾选要删除的报价单', 'warn');
    confirmBox(`确定删除选中的 <b>${ids.length}</b> 份报价单吗？<br>`
      + '<span style="color:var(--text3);font-size:12px">删除后不可恢复</span>', async () => {
      await POST('/api/quotes/delete', { ids });
      toast(`已删除 ${ids.length} 份报价单`, 'success');
      renderQuotes();
    }, true);
  };
  await renderQuotes();
  updateQuoteSel();
};

/* 报价单列表：勾选状态统计 */
function quoteSelIds() {
  return $$('.ck-q:checked', $('#quoteBody')).map(x => Number(x.value));
}

function updateQuoteSel() {
  const n = quoteSelIds().length;
  const total = state.quotesState.rows.length;
  const cnt = $('#quoteSelCnt');
  if (cnt) cnt.innerHTML = `已选 <b>${n}</b> / ${total} 项`;
  const all = $('#ckAllQ');
  if (all) all.checked = n > 0 && n === total;
}

/* ============================================================ 设置 */
VIEWS.settings = async function () {
  setTitle('系统设置');
  let s, info;
  try {
    s = await GET('/api/settings');
    info = await GET('/api/system/info');
  } catch (e) { return; }
  state.settings = s;
  const portable = info.mode === 'portable';
  const modeLabel = { docker: '容器模式', portable: '随身模式', local: '本机模式', custom: '共享目录' }[info.mode] || '本机模式';
  $('#view').innerHTML = `
    <div class="settings-grid">
      <div>
        <div class="card">
          <div class="card-head"><h3>公司 / 实验室信息</h3><span class="hint">用于报价单抬头</span></div>
          <div class="card-body">
            <div class="grid2">
              ${field('公司名称', input('company_name', s.company_name))}
              ${field('联系人', input('company_contact', s.company_contact))}
              ${field('联系电话', input('company_phone', s.company_phone))}
              ${field('传真 / 邮箱', input('company_fax', s.company_fax))}
            </div>
            <div style="height:14px"></div>
            ${field('地址', input('company_addr', s.company_addr))}
            <div style="height:14px"></div>
            <div class="grid2">
              ${field('开户行 / 账号', input('company_bank', s.company_bank))}
              ${field('税号', input('company_tax_no', s.company_tax_no))}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>默认报价条款</h3></div>
          <div class="card-body">
            ${textarea('terms', s.terms, 'style="min-height:130px"')}
            <div class="hint">{days} 会在导出时替换为默认有效期天数</div>
          </div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-head"><h3>报价单默认值</h3></div>
          <div class="card-body">
            <div class="grid2">
              ${field('单号前缀', input('quote_prefix', s.quote_prefix))}
              ${field('默认有效期（天）', `<input class="input" name="valid_days" type="number" value="${esc(s.valid_days)}">`)}
              ${field('默认折扣率（%）', `<input class="input" name="default_discount_rate" type="number" step="0.1" value="${esc(s.default_discount_rate)}">`)}
              ${field('默认税率（%）', `<input class="input" name="default_tax_rate" type="number" step="0.1" value="${esc(s.default_tax_rate)}">`)}
            </div>
            <div style="height:14px"></div>
            ${field('导出目录', input('export_dir', s.export_dir))}
            <div class="hint">导出的 Excel 报价单默认保存到该目录</div>
          </div>
        </div>
        <div class="card">
          <div class="card-head">
            <h3>数据位置与共享</h3>
            <span class="badge ${portable || info.mode === 'docker' ? 'on' : 'off'}">${modeLabel}</span>
          </div>
          <div class="card-body">
            <div style="font-size:12px;color:var(--text2);word-break:break-all;background:var(--gray-bg);padding:10px 12px;border-radius:10px">${esc(info.db_path)}</div>
            <div class="hint" style="margin-top:10px;line-height:1.9">
              ${info.mode === 'docker' ? `
              <b>容器模式</b>：数据保存在容器挂载的目录（LABQUOTE_DATA_DIR，通常映射到宿主机卷）。所有数据与导出的 Excel 都持久化在宿主机上，重建容器不会丢失。数据目录由部署配置固定，如需修改请编辑 docker-compose.yml 的挂载路径。<br>
              ` : `
              <b>本机模式</b>：数据只存于这台电脑，把程序发给同事需先「立即备份」，让他用「恢复数据库」导入。<br>
              <b>随身模式</b>：数据保存在程序目录的 data 文件夹，把<b>整个程序文件夹</b>压缩发给同事，他双击即可用你设置好的项目与单价报价。<br>
              <b>共享目录</b>：把数据指到公司共享盘或网盘同步文件夹，多人共用同一份数据，改动互相可见。<br>
              `}
            </div>
            ${info.mode === 'docker' ? '' : `
            <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
              ${info.mode === 'local' ? `<button class="btn btn-accent btn-sm" id="btnPortable">${ICON.folder}把数据存到程序目录（随身）</button>` : ''}
              ${info.mode !== 'local' ? `<button class="btn btn-ghost btn-sm" id="btnLocal">切换回本机模式</button>` : ''}
              <button class="btn btn-green btn-sm" id="btnPackage">${ICON.download}生成可分发程序包(zip)</button>
            </div>
            <div class="hint" style="margin-top:8px">分发包内含程序与当前全部数据，同事解压后双击 exe 即可，数据自动识别。</div>
            <div class="divider"></div>
            <div class="section-title">共享 / 自定义数据目录</div>
            <div style="display:flex;gap:10px;margin-top:10px">
              <input class="input" id="customDir" placeholder="例如：\\\\server\\share\\labquote 或 D:\\网盘\\报价数据" value="${info.mode === 'custom' ? esc(info.data_dir) : ''}">
              <button class="btn btn-primary" id="btnCustom">应用</button>
            </div>
            <div class="hint">切换会把当前数据复制到新目录。共享盘请避免多人同时编辑同一份报价单。</div>
            `}
          </div>
        </div>
        <div class="card">
          <div class="card-head"><h3>数据管理</h3></div>
          <div class="card-body">
            <div class="kv"><span class="k">备份数据库</span><button class="btn btn-ghost btn-sm" id="btnBackup">${ICON.download}立即备份</button></div>
            <div class="kv"><span class="k">恢复数据库</span><button class="btn btn-ghost btn-sm" id="btnRestore">${ICON.upload}选择备份文件</button></div>
            <div class="kv"><span class="k">打开数据目录</span><button class="btn btn-ghost btn-sm" id="btnDataDir">${ICON.folder}打开</button></div>
            ${info.has_seed ? `<div class="kv"><span class="k">程序内置初始数据</span><button class="btn btn-ghost btn-sm" id="btnResetSeed">${ICON.copy}重置为内置数据</button></div>` : ''}
            <input type="file" id="restoreFile" accept=".db" style="display:none">
            <div class="hint" style="margin-top:10px">备份文件（.db）包含项目库、客户与全部报价单，可直接发给同事用「恢复数据库」导入。恢复会覆盖当前数据（恢复前会自动备份）。${info.has_seed ? '本程序已内置初始数据，任何人首次运行即自动带入该套项目库。' : ''}</div>
          </div>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button class="btn btn-ghost" id="btnReload">放弃修改</button>
          <button class="btn btn-primary" id="btnSaveSettings">${ICON.check}保存设置</button>
        </div>
      </div>
    </div>`;
  $('#btnSaveSettings').onclick = async () => {
    const d = formData($('#view'));
    await PUT('/api/settings', d);
    state.settings = await GET('/api/settings');
    toast('设置已保存', 'success');
  };
  $('#btnReload').onclick = () => VIEWS.settings();
  $('#btnBackup').onclick = async () => {
    const r = await POST('/api/system/backup', {});
    toast('备份成功', 'success');
    POST('/api/system/open', { path: r.path, select: true }).catch(() => {});
  };
  $('#btnDataDir').onclick = () => GET('/api/system/data-dir');
  const bp = $('#btnPortable');
  if (bp) bp.onclick = async () => {
    const r = await POST('/api/system/mode', { mode: 'portable' });
    confirmBox(`已切换为随身模式，数据存于：<br><b>${esc(r.data_dir)}</b><br><br>把整个程序文件夹压缩发给同事即可。建议现在重启程序。`, () => VIEWS.settings());
  };
  const pkgBtn = $('#btnPackage');
  if (pkgBtn) pkgBtn.onclick = async () => {
    toast('正在打包，请稍候…');
    try {
      const r = await POST('/api/system/package', {});
      exportDone(r.path, r.name);
    } catch (e) { /* 已提示 */ }
  };
  const cu = $('#btnCustom');
  if (cu) cu.onclick = async () => {
    const p = $('#customDir').value.trim();
    if (!p) return toast('请填写数据目录路径', 'warn');
    const r = await POST('/api/system/mode', { mode: 'custom', path: p });
    confirmBox(`数据目录已切换到：<br><b>${esc(r.data_dir)}</b><br><br>建议现在重启程序。`, () => VIEWS.settings());
  };
  const rs = $('#btnResetSeed');
  if (rs) rs.onclick = () => confirmBox('将用程序内置的初始数据覆盖当前数据库（当前数据会自动备份），确定继续吗？', async () => {
    const r = await POST('/api/system/reset-seed', {});
    toast('已重置为内置初始数据，建议重启程序', 'success');
    VIEWS.settings();
  }, true);
  const bl = $('#btnLocal');
  if (bl) bl.onclick = async () => {
    const r = await POST('/api/system/mode', { mode: 'local' });
    confirmBox(`已切换回本机模式，数据存于：<br><b>${esc(r.data_dir)}</b><br><br>建议现在重启程序。`, () => VIEWS.settings());
  };
  $('#btnRestore').onclick = () => $('#restoreFile').click();
  $('#restoreFile').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await POST('/api/system/restore', { content: reader.result });
        toast('数据已恢复，请重启程序', 'success');
      } catch (err) { /* 已提示 */ }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
};
