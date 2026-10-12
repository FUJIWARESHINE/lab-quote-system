/* 实验室报价系统 · 报价单编辑器 */
'use strict';

const editor = {
  quote: null,
  customers: [],
  allItems: [],
  sections: [],
  currentSection: '',
  collapsed: {},     // 已收起的模块名 → true
  pickSearch: '',
  pickCat: 0,
  pickStar: false,
  batch: false,      // 批量操作开关：开启后每行可勾选，支持批量复制 / 批量删除
  batchSel: {},      // 已勾选的行下标 → true
};

const UNIT_OPTIONS = ['样', '项', '对', '次', '管', '只', '支'];

function round2(v) { return Math.round((Number(v || 0) + Number.EPSILON) * 100) / 100; }

function calcTotals(items, discountRate, taxRate) {
  let subtotal = 0;
  items.forEach(it => {
    it.amount = round2(Number(it.price || 0) * Number(it.quantity || 0) * (1 - Number(it.discount_rate || 0) / 100));
    subtotal += it.amount;
  });
  subtotal = round2(subtotal);
  const discountAmount = round2(subtotal * Number(discountRate || 0) / 100);
  const base = round2(subtotal - discountAmount);
  const taxAmount = round2(base * Number(taxRate || 0) / 100);
  return { subtotal, discountAmount, taxAmount, total: round2(base + taxAmount) };
}

async function openQuoteEditor(id) {
  setTitle(id ? '编辑报价单' : '新建报价单');
  $('#view').innerHTML = '<div class="loading">加载中…</div>';
  const [customers, allItems] = await Promise.all([
    GET('/api/customers'),
    GET('/api/items/all'),
  ]);
  editor.customers = customers;
  editor.allItems = allItems;
  if (id) {
    editor.quote = await GET(`/api/quotes/${id}`);
    // 补全常规价/趋势价，便于在明细中切换价格
    (editor.quote.items || []).forEach(it => {
      const src = editor.allItems.find(x => x.id === it.item_id);
      it.price_normal = src ? src.price : it.price;
      it.price2 = src ? (src.price2 || 0) : (it.price2 || 0);
      it.price2_text = src ? (src.price2_text || '') : (it.price2_text || '');
      it.price_type = it.price_type || 'normal';
      it.group_count = Number(it.group_count || 1);
      it.samples = Number(it.samples || 0);
      it.indicators = Number(it.indicators || 0);
      it.repeats = Number(it.repeats || 0);
      if (it.group_count || it.samples || it.indicators || it.repeats) it.quantity = calcQty(it);
    });
  } else {
    const s = state.settings || {};
    editor.quote = {
      id: null,
      quote_no: '',
      title: '',
      customer_id: 0,
      customer_name: '',
      contact: '',
      phone: '',
      address: '',
      quote_date: today(),
      expire_date: addDays(today(), Number(s.valid_days || 30)),
      status: 'draft',
      discount_rate: Number(s.default_discount_rate || 0),
      tax_rate: Number(s.default_tax_rate || 0),
      remark: '',
      terms: '',
      items: [],
    };
  }
  // 分组（部分）列表：按已有明细顺序推导
  editor.collapsed = {};
  editor.batch = false;
  editor.batchSel = {};
  editor.sections = [];
  (editor.quote.items || []).forEach(it => {
    const name = it.section || '检测实验';
    if (editor.sections.indexOf(name) === -1) editor.sections.push(name);
  });
  if (!editor.sections.length) editor.sections = ['检测实验'];
  editor.currentSection = editor.sections[0];
  renderEditor();
}

function renderEditor() {
  const q = editor.quote;
  const s = state.settings || {};
  const customerOptions = [{ value: 0, text: '— 手动填写 —' }]
    .concat(editor.customers.map(c => ({ value: c.id, text: c.name })));
  const catOptions = [{ value: 0, text: '全部分类' }].concat(
    Array.from(new Set(editor.allItems.map(i => i.category_name)))
      .filter(Boolean).map(n => ({ value: n, text: n })));

  $('#view').innerHTML = `
    <div class="editor">
      <div class="picker">
        <div class="picker-head">
          <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px">${ICON.items}检测项目库</div>
          <div class="search-box"><span>${ICON.search}</span>
            <input class="input" id="pickSearch" placeholder="搜索项目名称 / 编号" value="${esc(editor.pickSearch)}">
          </div>
          <select class="select" id="pickCat">${catOptions.map(o =>
            `<option value="${esc(o.value)}" ${String(o.value) === String(editor.pickCat) ? 'selected' : ''}>${esc(o.text)}</option>`).join('')}</select>
          <button class="btn ${editor.pickStar ? 'btn-accent' : 'btn-ghost'} btn-sm" id="pickStarFilter" style="width:100%">
            ${ICON.starOn}${editor.pickStar ? '已开启：只看收藏' : '只看收藏项目'}</button>
          <button class="btn btn-green btn-sm" id="btnCustomItem" style="width:100%">${ICON.plus}添加临时项目</button>
          <div style="font-size:11px;color:var(--text3)">点击项目即可加入报价明细，★ 可收藏常用项目</div>
        </div>
        <div class="picker-list" id="pickList"></div>
      </div>
      <div>
        <div class="card">
          <div class="card-head detail-head">
            <div class="card-head-title">
              <h3>报价明细</h3>
              <label class="switch" id="batchSwitchWrap" title="开启后可勾选多行，批量复制 / 批量删除">
                <input type="checkbox" id="ckBatch" ${editor.batch ? 'checked' : ''}>
                <span class="switch-track"></span>
                <span class="switch-text">批量操作</span>
              </label>
            </div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <span class="hint">当前部分</span>
              <select class="select" id="curSection" style="width:180px;height:32px"></select>
              <button class="btn btn-ghost btn-sm" id="btnAddSection">${ICON.plus}新增模块/部分</button>
            </div>
          </div>
          <div class="hint" style="padding:0 16px;margin-top:10px">合计数量 = 分组数 × 每组样本数 × 检测指标数 × 重复次数</div>
          <div class="batch-bar" id="batchBar" style="display:none"></div>
          <div class="qitem-list" id="detailBody"></div>
          <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap">
            <div style="font-size:13px;color:var(--text2)">共 <b id="itemCount">0</b> 项</div>
            <div class="summary" style="min-width:330px">
              <div class="sum-row"><span>小计</span><span id="sumSubtotal">0.00</span></div>
              <div class="sum-row"><span>整单折扣</span><span id="sumDiscount">-0.00</span></div>
              <div class="sum-row"><span>税额</span><span id="sumTax">0.00</span></div>
              <div class="sum-total"><span>应付总额</span><b id="sumTotal">¥ 0.00</b></div>
              <div class="sum-upper" id="sumUpper">零元整</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>备注与条款</h3></div>
          <div class="card-body">
            ${field('备注', textarea('remark', q.remark, 'style="min-height:64px"'))}
            <div style="height:14px"></div>
            ${field('报价条款（留空则使用系统默认条款）', textarea('terms', q.terms, `style="min-height:96px" placeholder="${esc((s.terms || '').slice(0, 60))}…"`))}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h3>基本信息</h3><span class="hint">单号由系统自动生成</span></div>
          <div class="card-body">
            <div class="grid2">
              ${field('客户单位', `<select class="select" id="selCustomer">${customerOptions.map(o =>
                `<option value="${esc(o.value)}" ${String(o.value) === String(q.customer_id || 0) ? 'selected' : ''}>${esc(o.text)}</option>`).join('')}</select>
                <input class="input" id="customer_name" name="customer_name" value="${esc(q.customer_name)}" placeholder="输入客户单位名称" style="margin-top:8px">`)}
              ${field('报价单标题', input('title', q.title, 'placeholder="如：水质检测委托报价"'))}
              ${field('联系人', input('contact', q.contact))}
              ${field('联系电话', input('phone', q.phone))}
              ${field('报价日期', `<input class="input" name="quote_date" type="date" value="${esc(q.quote_date)}">`)}
              ${field('有效期至', `<input class="input" name="expire_date" type="date" value="${esc(q.expire_date)}">`)}
            </div>
            <div style="height:14px"></div>
            ${field('项目地址 / 送检地址', input('address', q.address))}
            <div style="height:14px"></div>
            <div class="grid3">
              ${field('状态', select('status', [
                { value: 'draft', text: '草稿' }, { value: 'sent', text: '已发送' },
                { value: 'confirmed', text: '已确认' }, { value: 'rejected', text: '已拒绝' }], q.status))}
              ${field('整单折扣率（%）', `<input class="input money" id="discount_rate" name="discount_rate" type="number" step="0.1" min="0" max="100" value="${esc(q.discount_rate)}">`)}
              ${field('税率（%）', `<input class="input money" id="tax_rate" name="tax_rate" type="number" step="0.1" min="0" max="100" value="${esc(q.tax_rate)}">`)}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;padding-bottom:20px">
          <button class="btn btn-ghost" id="btnBack">${ICON.back}返回列表</button>
          <button class="btn btn-accent" id="btnSaveExport">${ICON.download}保存并导出 Excel</button>
          <button class="btn btn-primary" id="btnSave">${ICON.check}保存</button>
        </div>
      </div>
    </div>`;

  // 事件绑定
  $('#selCustomer').onchange = (e) => {
    const cid = Number(e.target.value);
    q.customer_id = cid;
    const c = editor.customers.find(x => x.id === cid);
    if (c) {
      q.customer_name = c.name;
      $('#customer_name').value = c.name;
      $('[name=contact]').value = c.contact || '';
      $('[name=phone]').value = c.phone || '';
      $('[name=address]').value = c.address || '';
    }
  };
  const pickSearch = $('#pickSearch');
  pickSearch.oninput = debounce(() => { editor.pickSearch = pickSearch.value.trim(); renderPickList(); }, 220);
  $('#pickCat').onchange = (e) => { editor.pickCat = e.target.value; renderPickList(); };
  const cbtn = $('#btnCustomItem');
  if (cbtn) cbtn.onclick = customItemDialog;
  const psf = $('#pickStarFilter');
  if (psf) psf.onclick = () => {
    editor.pickStar = !editor.pickStar;
    psf.className = 'btn btn-sm ' + (editor.pickStar ? 'btn-accent' : 'btn-ghost');
    psf.innerHTML = `${ICON.starOn}${editor.pickStar ? '已开启：只看收藏' : '只看收藏项目'}`;
    psf.style.width = '100%';
    renderPickList();
  };
  $('#discount_rate').oninput = updateSummary;
  $('#tax_rate').oninput = updateSummary;
  const curSel = $('#curSection');
  if (curSel) curSel.onchange = (e) => { editor.currentSection = e.target.value; };
  const addSecBtn = $('#btnAddSection');
  if (addSecBtn) addSecBtn.onclick = () => {
    const name = prompt('新增模块/部分名称（可自定义，如：分子平台实验、WB 实验）', '');
    if (!name || !name.trim()) return;
    const value = name.trim();
    if (editor.sections.indexOf(value) !== -1) return toast('该部分已存在', 'warn');
    editor.sections.push(value);
    editor.currentSection = value;
    renderDetail();
    toast(`已新增「${value}」，从左侧添加的项目将归入该部分`, 'success');
  };
  $('#btnBack').onclick = () => go('quotes');
  $('#btnSave').onclick = () => saveQuote(false);
  $('#btnSaveExport').onclick = () => saveQuote(true);
  const ckBatch = $('#ckBatch');
  if (ckBatch) ckBatch.onchange = () => {
    editor.batch = ckBatch.checked;
    editor.batchSel = {};
    renderDetail();
    if (editor.batch) toast('批量操作已开启：勾选明细行后可批量复制 / 删除', 'success');
  };
  renderPickList();
  renderDetail();
}

function renderPickList() {
  const kw = (editor.pickSearch || '').toLowerCase();
  const cat = editor.pickCat;
  const list = editor.allItems.filter(i => {
    if (editor.pickStar && !i.starred) return false;
    if (cat && i.category_name !== cat) return false;
    if (!kw) return true;
    return (i.name || '').toLowerCase().includes(kw) ||
      (i.code || '').toLowerCase().includes(kw) ||
      (i.spec || '').toLowerCase().includes(kw);
  });
  $('#pickList').innerHTML = list.length ? list.map(i => `
    <div class="pick-item" data-add="${i.id}">
      <button class="btn btn-icon" data-star-item="${i.id}" data-on="${i.starred ? 1 : 0}"
        title="${i.starred ? '取消收藏' : '收藏置顶'}"
        style="background:none;border:none;padding:0;width:22px;height:22px;color:${i.starred ? '#f59e0b' : '#cbd5e1'}">
        ${i.starred ? ICON.starOn : ICON.star}</button>
      <div class="pi-body">
        <div class="pi-name" title="${esc(i.name)}">${esc(i.name)}</div>
        <div class="pi-meta" title="${esc([i.code, i.spec || i.category_name].filter(Boolean).join(' · '))}">${esc(i.code || '')}${i.code ? ' · ' : ''}${esc(i.spec || i.category_name || '')}</div>
      </div>
      <div class="pi-price">${money(i.price)}${i.price2
        ? `<div class="pi-meta pi-trend" title="趋势价 ${money(i.price2)}">趋势 ${money(i.price2)}</div>`
        : (i.price2_text ? `<div class="pi-meta" title="${esc(i.price2_text)}">${esc(i.price2_text)}</div>` : '')}</div>
    </div>`).join('') : `<div class="empty" style="padding:26px 10px"><p>${editor.pickStar ? '还没有收藏的项目，点击 ☆ 收藏常用项目' : '没有匹配的项目'}</p></div>`;
  $$('[data-add]', $('#pickList')).forEach(el => el.onclick = () => addItem(Number(el.dataset.add)));
  $$('[data-star-item]', $('#pickList')).forEach(btn => btn.onclick = async (e) => {
    e.stopPropagation();
    const id = Number(btn.dataset.starItem);
    const next = btn.dataset.on === '1' ? 0 : 1;
    const target = editor.allItems.find(x => x.id === id);
    if (target) target.starred = next;
    editor.allItems.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
    renderPickList();
    await POST(`/api/items/${id}/star`, { starred: next });
  });
}

/* 单位选择：下拉可选常用单位，也可自定义添加 */
function unitField(name, value) {
  const v = value === undefined || value === null || value === '' ? '样' : String(value);
  const custom = UNIT_OPTIONS.indexOf(v) === -1;
  return `<select class="select" id="${name}Select">${
    UNIT_OPTIONS.map(u => `<option value="${u}" ${u === v ? 'selected' : ''}>${u}</option>`).join('')
  }<option value="__custom__" ${custom ? 'selected' : ''}>自定义…</option></select>
  <input class="input" id="${name}Custom" placeholder="自定义单位" value="${custom ? esc(v) : ''}" style="margin-top:8px;display:${custom ? '' : 'none'}">`;
}

function bindUnitField(name) {
  const sel = $(`#${name}Select`), inp = $(`#${name}Custom`);
  if (!sel || !inp) return;
  sel.onchange = () => {
    const custom = sel.value === '__custom__';
    inp.style.display = custom ? '' : 'none';
    if (custom) inp.focus();
  };
}

function readUnit(name) {
  const sel = $(`#${name}Select`), inp = $(`#${name}Custom`);
  if (!sel) return '样';
  if (sel.value === '__custom__') return (inp && inp.value.trim()) || '样';
  return sel.value;
}

function customItemDialog() {
  const section = editor.currentSection || editor.sections[0] || '检测实验';
  const body = `
    <div class="grid2">
      ${field('项目名称 *', input('name', '', 'placeholder="客户临时提出的检测项目"'))}
      ${field('单位', unitField('cuUnit', '样'))}
      ${field('单价（元）*', `<input class="input money" name="price" type="number" step="0.01" min="0" placeholder="0.00">`)}
      ${field('归属模块/部分', input('section', section, 'placeholder="默认加入当前模块"'))}
      ${field('分组数（乘数）', `<input class="input" name="group_count" type="number" step="1" min="1" value="1">`)}
      ${field('数量（每组样本数）', `<input class="input" name="samples" type="number" step="1" min="0" value="1">`)}
    </div>
    <div style="height:14px"></div>
    ${field('规格 / 说明', input('spec', '', 'placeholder="可留空"'))}
    <div style="height:14px"></div>
    ${field('备注', input('note', ''))}
    <div class="hint">「添加到报价单」只写入本报价单；「添加到项目库」会同时存入项目库并加入本报价单，可边报价边丰富项目库。</div>`;
  const mask = openModal({
    title: '添加临时项目',
    width: 'wide',
    body,
    okText: '添加到报价单',
    onOk: () => {
      const d = readCustomForm(mask);
      if (validateCustom(d)) return;
      addCustomItem(d);
      closeModal();
    },
  });
  bindUnitField('cuUnit');
  // 在「添加到报价单」左侧插入「添加到项目库」
  const foot = $('#modalRoot .modal-foot');
  const libBtn = document.createElement('button');
  libBtn.className = 'btn btn-green';
  libBtn.innerHTML = `${ICON.library}添加到项目库`;
  libBtn.onclick = async () => {
    const d = readCustomForm(mask);
    if (validateCustom(d)) return;
    libBtn.disabled = true;
    try {
      const r = await POST('/api/items', {
        code: '', name: d.name.trim(), category_id: Number(editor.pickCat) || 0,
        spec: d.spec || '', unit: d.unit, price: Number(d.price) || 0,
        price2: 0, price2_text: '', cost: 0, note: d.note || '',
        enabled: 1, starred: 0,
      });
      editor.allItems = await GET('/api/items/all');
      addLibraryItemToQuote(r.id, d);
      closeModal();
      toast(`「${d.name.trim()}」已存入项目库并加入报价单`, 'success');
    } catch (e) {
      libBtn.disabled = false;
    }
  };
  foot.insertBefore(libBtn, foot.querySelector('[data-ok]'));
}

function readCustomForm(mask) {
  const d = formData(mask);
  d.unit = readUnit('cuUnit');
  return d;
}

function validateCustom(d) {
  if (!d.name || !d.name.trim()) { toast('请填写项目名称', 'warn'); return true; }
  if (d.price === '' || Number(d.price) <= 0) { toast('请填写单价', 'warn'); return true; }
  return false;
}

function sectionFor(name) {
  const section = (name || '').trim() || editor.currentSection
    || editor.sections[0] || '检测实验';
  if (editor.sections.indexOf(section) === -1) editor.sections.push(section);
  editor.currentSection = section;
  return section;
}

function customQty(d) {
  return calcQty({
    group_count: Number(d.group_count) || 1,
    samples: Number(d.samples) || 1,
    indicators: 1, repeats: 1,
  });
}

function addCustomItem(d) {
  const section = sectionFor(d.section);
  const price = Number(d.price) || 0;
  editor.quote.items.push({
    item_id: 0, code: '', name: d.name.trim(), spec: (d.spec || '').trim(),
    unit: d.unit || '样', price: price,
    price_normal: price, price2: 0, price2_text: '',
    price_type: 'custom', section: section, group_name: '',
    group_count: Number(d.group_count) || 1,
    samples: Number(d.samples) || 1, indicators: 1, repeats: 1,
    quantity: customQty(d),
    discount_rate: 0, note: (d.note || '').trim(),
  });
  renderDetail();
  toast(`临时项目「${d.name.trim()}」已加入「${section}」`, 'success');
}

/* 存进项目库的同时，也加入到当前报价单 */
function addLibraryItemToQuote(itemId, d) {
  const section = sectionFor(d.section);
  const price = Number(d.price) || 0;
  editor.quote.items.push({
    item_id: itemId, code: '', name: d.name.trim(), spec: (d.spec || '').trim(),
    unit: d.unit || '样', price: price, price_normal: price, price2: 0, price2_text: '',
    price_type: 'normal', section: section, group_name: '',
    group_count: Number(d.group_count) || 1,
    samples: Number(d.samples) || 1, indicators: 1, repeats: 1,
    quantity: customQty(d), discount_rate: 0, note: (d.note || '').trim(),
  });
  renderDetail();
}

/* 编辑已经加到报价单里的明细行（改名 / 改价 / 换单位 / 换模块） */
function editItemDialog(idx) {
  const it = editor.quote.items[idx];
  if (!it) return;
  const body = `
    <div class="grid2">
      ${field('项目名称 *', input('name', it.name))}
      ${field('单位', unitField('editUnit', it.unit || '样'))}
      ${field('归属模块/部分', input('section', sectionOf(it), 'placeholder="可改到其它模块"'))}
      ${field('规格 / 说明', input('spec', it.spec || ''))}
      ${field('单价（元）', `<input class="input money" name="price" type="number" step="0.01" min="0" value="${esc(it.price)}">`)}
      ${field('明细备注', input('note', it.note || ''))}
    </div>
    <div class="hint">修改只影响本报价单，不会改动项目库里的原始项目。</div>`;
  openModal({
    title: '编辑明细项目',
    body,
    okText: '保存修改',
    onOk: (mask) => {
      const d = formData(mask);
      if (!d.name || !d.name.trim()) return toast('请填写项目名称', 'warn');
      const nextSection = (d.section || '').trim() || sectionOf(it);
      it.name = d.name.trim();
      it.spec = (d.spec || '').trim();
      it.unit = readUnit('editUnit');
      it.price = Number(d.price) || 0;
      it.note = (d.note || '').trim();
      if (editor.sections.indexOf(nextSection) === -1) editor.sections.push(nextSection);
      it.section = nextSection;
      editor.currentSection = nextSection;
      closeModal();
      renderDetail();
      toast('已保存修改', 'success');
    },
  });
  bindUnitField('editUnit');
}

function addItem(id) {
  const src = editor.allItems.find(x => x.id === id);
  if (!src) return;
  const list = editor.quote.items;
  const section = editor.currentSection || editor.sections[0] || '检测实验';
  const exist = list.find(x => x.item_id === id && sectionOf(x) === section);
  if (exist) {
    exist.samples = Number(exist.samples || 0) + 1;
    exist.quantity = calcQty(exist);
  } else {
    list.push({
      item_id: src.id, code: src.code || '', name: src.name, spec: src.spec || '',
      unit: src.unit || '项', price: src.price, price_normal: src.price,
      price2: src.price2 || 0, price2_text: src.price2_text || '',
      price_type: 'normal', section: section, group_name: '',
      group_count: 1, samples: 1, indicators: 1, repeats: 1, quantity: 1,
      discount_rate: 0, note: '',
    });
  }
  renderDetail();
  toast(`已添加「${src.name}」到「${section}」`, 'success');
}

function calcQty(it) {
  const groups = Number(it.group_count || 0);
  const samples = Number(it.samples || 0);
  const indicators = Number(it.indicators || 0);
  const repeats = Number(it.repeats || 0);
  if (groups || samples || indicators || repeats) {
    return round2((groups || 1) * (samples || 1) * (indicators || 1) * (repeats || 1));
  }
  return Number(it.quantity || 1);
}

function sectionOf(it) {
  return it.section || editor.sections[0] || '检测实验';
}

function renderSectionOptions() {
  const sel = $('#curSection');
  if (!sel) return;
  const cur = editor.currentSection || editor.sections[0] || '';
  sel.innerHTML = editor.sections
    .map(n => `<option value="${esc(n)}" ${n === cur ? 'selected' : ''}>${esc(n)}</option>`).join('');
}

/* 单行明细模板 */
function qitemHtml(it, idx) {
  const pt = it.price_type || 'normal';
  const qty = calcQty(it);
  const picked = !!editor.batchSel[idx];
  return `
      <div class="qitem${picked ? ' checked' : ''}" data-row="${idx}">
        <div class="qitem-main">
          <span class="ck-row-wrap"><input type="checkbox" class="ck-row" data-ck="${idx}" ${picked ? 'checked' : ''}></span>
          <span class="drag-handle" title="拖拽排序，可跨模块；按住 Ctrl 拖拽＝复制到目标位置">${ICON.grip}</span>
          <span class="qitem-idx">${idx + 1}</span>
          <div class="qitem-name">
            <b>${esc(it.name)}</b>${it.item_id ? '' : '<span class="badge draft" style="margin-left:6px">临时</span>'}
            <div class="qitem-meta">${esc([it.code, it.spec].filter(Boolean).join(' · '))}</div>
          </div>
          <div class="qf qf-amt"><span>金额(元)</span><b data-amt>${money(it.amount || 0)}</b></div>
          <div class="qitem-ops">
            <button class="btn btn-ghost btn-icon" data-edit-item="${idx}" title="编辑此项">${ICON.edit}</button>
            <button class="btn btn-ghost btn-icon" data-dup="${idx}" title="复制此项到任意部分 / 位置">${ICON.copy}</button>
            <button class="btn btn-ghost btn-icon" data-up="${idx}" title="上移">${ICON.up}</button>
            <button class="btn btn-ghost btn-icon" data-down="${idx}" title="下移">${ICON.down}</button>
            <button class="btn btn-danger btn-icon" data-rm="${idx}" title="删除">${ICON.trash}</button>
          </div>
        </div>
        <div class="qitem-fields">
          <label class="qf"><span>分组数</span><input class="input" type="number" step="1" min="0" data-f="group_count" value="${it.group_count || 1}" placeholder="1"></label>
          <span class="qmul">×</span>
          <label class="qf"><span>每组样本数</span><input class="input" type="number" step="1" min="0" data-f="samples" value="${it.samples || ''}" placeholder="1"></label>
          <span class="qmul">×</span>
          <label class="qf"><span>检测指标数</span><input class="input" type="number" step="1" min="0" data-f="indicators" value="${it.indicators || ''}" placeholder="1"></label>
          <span class="qmul">×</span>
          <label class="qf"><span>重复次数</span><input class="input" type="number" step="1" min="0" data-f="repeats" value="${it.repeats || ''}" placeholder="1"></label>
          <span class="qmul">=</span>
          <div class="qf qf-qty"><span>合计数量</span><b data-qty>${qty}</b></div>
          <label class="qf"><span>价格类型</span>
            <select class="select" data-f="price_type">
              <option value="normal" ${pt === 'normal' ? 'selected' : ''}>常规价</option>
              <option value="trend" ${pt === 'trend' ? 'selected' : ''} ${it.price2 ? '' : 'disabled'}>
                ${it.price2 ? '趋势价' : '趋势价（无）'}</option>
              <option value="custom" ${pt === 'custom' ? 'selected' : ''}>手填价格</option>
            </select>
          </label>
          ${it.price2_text ? `<div class="qf-price2" title="${esc(it.price2_text)}">${esc(it.price2_text)}</div>` : ''}
          <label class="qf"><span>单价(元)</span><input class="input money" type="number" step="0.01" min="0" data-f="price" value="${esc(it.price)}"></label>
          <label class="qf"><span>折扣%</span><input class="input" type="number" step="1" min="0" max="100" data-f="discount_rate" value="${esc(it.discount_rate || 0)}"></label>
          <label class="qf qf-note"><span>明细备注</span><input class="input" data-f="note" value="${esc(it.note || '')}" placeholder="备注" title="${esc(it.note || '')}"></label>
        </div>
      </div>`;
}

function renderDetail() {
  const items = editor.quote.items;
  const cntEl = $('#itemCount');
  if (cntEl) cntEl.textContent = items.length;
  // 先算一次金额，保证初次载入各行金额不是 0
  calcTotals(items,
    Number($('#discount_rate') ? $('#discount_rate').value : editor.quote.discount_rate) || 0,
    Number($('#tax_rate') ? $('#tax_rate').value : editor.quote.tax_rate) || 0);
  renderSectionOptions();
  pruneBatchSel();
  const bodyEl = $('#detailBody');
  if (bodyEl) bodyEl.classList.toggle('batch', !!editor.batch);
  if (!items.length) {
    $('#detailBody').innerHTML = `<div class="empty">${ICON.empty}<p>从左侧项目库点击添加检测项目</p></div>`;
    renderBatchBar();
    updateSummary();
    return;
  }
  const order = editor.sections.slice();
  items.forEach(it => {
    const name = sectionOf(it);
    if (order.indexOf(name) === -1) order.push(name);
  });

  let html = '';
  order.forEach((name, si) => {
    const idxs = items.map((it, i) => ({ it, i })).filter(x => sectionOf(x.it) === name).map(x => x.i);
    if (!idxs.length && si >= editor.sections.length) return;
    const collapsed = !!editor.collapsed[name];
    html += `
      <div class="sec ${collapsed ? 'collapsed' : ''}" data-sec="${esc(name)}">
        <div class="sec-band" data-sec-band="${esc(name)}" title="${collapsed ? '点此展开' : '点此收起'}">
          <div class="sec-band-main">
            <span class="sec-name">${esc(name)}<span class="sec-cnt">（${idxs.length} 项）</span></span>
          </div>
          <div class="sec-band-ops">
            <span class="sec-total">小计 ¥ <b data-sec-total="${esc(name)}">0.00</b></span>
            <button class="btn btn-ghost btn-sm" data-rename-sec="${esc(name)}">重命名</button>
            <button class="btn btn-danger btn-sm" data-del-sec="${esc(name)}">删除该部分</button>
            <button class="btn btn-icon sec-toggle" data-sec-toggle="${esc(name)}"
              title="${collapsed ? '展开该模块' : '收起该模块'}">${collapsed ? ICON.chevronDown : ICON.chevronUp}</button>
          </div>
        </div>
        <div class="sec-body"><div class="sec-body-inner">
          ${idxs.map(idx => qitemHtml(items[idx], idx)).join('')}
        </div></div>
      </div>`;
  });
  $('#detailBody').innerHTML = html;

  // 批量模式：勾选行
  $$('[data-ck]', $('#detailBody')).forEach(el => el.onchange = () => {
    const i = Number(el.dataset.ck);
    if (el.checked) editor.batchSel[i] = true; else delete editor.batchSel[i];
    const row = el.closest('.qitem');
    if (row) row.classList.toggle('checked', el.checked);
    updateBatchCount();
  });
  renderBatchBar();

  $$('#detailBody [data-f]').forEach(el => {
    const row = el.closest('[data-row]');
    const handler = () => {
      const idx = Number(row.dataset.row);
      const f = el.dataset.f;
      const it = editor.quote.items[idx];
      if (f === 'note') {
        it.note = el.value;
        return;
      }
      if (f === 'price_type') {
        it.price_type = el.value;
        if (el.value === 'normal' && it.price_normal) it.price = it.price_normal;
        if (el.value === 'trend' && it.price2) it.price = it.price2;
        const priceInput = $('[data-f="price"]', row);
        if (priceInput) priceInput.value = it.price;
      } else {
        it[f] = Number(el.value || 0);
        if (f === 'price') it.price_type = 'custom';
        if (f === 'samples' || f === 'indicators' || f === 'repeats' || f === 'group_count') {
          it.quantity = calcQty(it);
          const qtyEl = $('[data-qty]', row);
          if (qtyEl) qtyEl.textContent = it.quantity;
        }
      }
      calcTotals(editor.quote.items, $('#discount_rate').value, $('#tax_rate').value);
      const amtEl = $('[data-amt]', row);
      if (amtEl) amtEl.textContent = money(it.amount);
      // 手填单价后，价格类型下拉同步显示为「手填价格」
      const ptSel = $('[data-f="price_type"]', row);
      if (ptSel) ptSel.value = it.price_type || 'normal';
      updateSummary();
    };
    if (el.tagName === 'SELECT') el.onchange = handler;
    else el.oninput = handler;
  });
  bindDragSort();
  // 模块收放：点右上角按钮，或直接点模块条
  const toggleSection = (secEl, name) => {
    if (!secEl) return;
    const collapsed = secEl.classList.toggle('collapsed');
    editor.collapsed[name] = collapsed;
    const btn = $('[data-sec-toggle]', secEl);
    if (btn) {
      btn.innerHTML = collapsed ? ICON.chevronDown : ICON.chevronUp;
      btn.title = collapsed ? '展开该模块' : '收起该模块';
    }
    const band = $('[data-sec-band]', secEl);
    if (band) band.title = collapsed ? '点此展开' : '点此收起';
  };
  $$('[data-sec-toggle]', $('#detailBody')).forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    toggleSection(b.closest('.sec'), b.dataset.secToggle);
  });
  $$('[data-sec-band]', $('#detailBody')).forEach(band => band.onclick = (e) => {
    if (e.target.closest('button')) return; // 重命名 / 删除等按钮不触发收放
    toggleSection(band.closest('.sec'), band.dataset.secBand);
  });
  $$('[data-del-sec]', $('#detailBody')).forEach(b => b.onclick = () => {
    const name = b.dataset.delSec;
    const cnt = editor.quote.items.filter(it => sectionOf(it) === name).length;
    confirmBox(`删除「${esc(name)}」该部分${cnt ? `及其中 ${cnt} 个检测项目` : ''}？`, () => {
      editor.sections = editor.sections.filter(x => x !== name);
      editor.quote.items = editor.quote.items.filter(it => sectionOf(it) !== name);
      editor.batchSel = {};
      delete editor.collapsed[name];
      if (!editor.sections.length) editor.sections = ['检测实验'];
      editor.currentSection = editor.sections[0];
      renderDetail();
    }, true);
  });
  $$('[data-rename-sec]', $('#detailBody')).forEach(b => b.onclick = () => {
    const name = b.dataset.renameSec;
    const next = prompt('修改部分名称', name);
    if (!next || !next.trim() || next.trim() === name) return;
    const value = next.trim();
    editor.sections = editor.sections.map(x => (x === name ? value : x));
    editor.quote.items.forEach(it => { if (sectionOf(it) === name) it.section = value; });
    if (editor.currentSection === name) editor.currentSection = value;
    if (editor.collapsed[name]) { editor.collapsed[value] = true; delete editor.collapsed[name]; }
    renderDetail();
  });
  $$('[data-edit-item]', $('#detailBody')).forEach(b => b.onclick = () => editItemDialog(Number(b.dataset.editItem)));
  $$('[data-dup]', $('#detailBody')).forEach(b => b.onclick = () => duplicateItem(Number(b.dataset.dup)));
  $$('[data-rm]', $('#detailBody')).forEach(b => b.onclick = () => {
    const it = editor.quote.items[Number(b.dataset.rm)];
    if (!it) return;
    confirmBox(`确定从报价单中删除「${esc(it.name)}」吗？`, () => {
      editor.quote.items.splice(Number(b.dataset.rm), 1);
      editor.batchSel = {};
      renderDetail();
    }, true);
  });
  $$('[data-up]', $('#detailBody')).forEach(b => b.onclick = () => move(Number(b.dataset.up), -1));
  $$('[data-down]', $('#detailBody')).forEach(b => b.onclick = () => move(Number(b.dataset.down), 1));
  updateSummary();
}

/* 复制一行明细：弹出目标选择器，可复制到任意部分、任意位置 */
function duplicateItem(idx) {
  copyItemDialog(idx);
}

function clipText(s, n) {
  const t = String(s === undefined || s === null ? '' : s);
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function copySectionCount(name) {
  return editor.quote.items.filter(it => sectionOf(it) === name).length;
}

/* 目标部分胶囊：现有部分 + 临时新建的部分 */
function renderCopyChips(selected, newSec) {
  const wrap = $('#copySecChips');
  if (!wrap) return;
  const names = editor.sections.slice();
  if (newSec && names.indexOf(newSec) === -1) names.push(newSec);
  if (names.indexOf(selected) === -1) names.push(selected);
  wrap.innerHTML = names.map(n => `
      <button type="button" class="sec-chip ${n === selected ? 'active' : ''}" data-pick="${esc(n)}"
        >${esc(n)}<span class="sec-chip-n">${copySectionCount(n)}</span></button>`).join('')
    + `<button type="button" class="sec-chip add" data-pick-new>${ICON.plus}新建部分</button>`;
}

/* 插入位置：该部分最前 / 最后 / 某个具体项之后 */
function renderCopyPositions(targetSec, srcSec, srcIdx) {
  const sel = $('#copyPosSel');
  if (!sel) return;
  const opts = [
    { v: 'first', t: `放到「${targetSec}」最前面` },
    { v: 'last', t: `放到「${targetSec}」最后面` },
  ];
  editor.quote.items.forEach((it, i) => {
    if (sectionOf(it) !== targetSec) return;
    opts.push({ v: 'after:' + i, t: `在「${clipText(it.name, 16)}」之后${i === srcIdx ? '（原位置下方）' : ''}` });
  });
  sel.innerHTML = opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
  sel.value = targetSec === srcSec ? ('after:' + srcIdx) : 'last';
  if (!sel.value || sel.selectedIndex < 0) sel.value = 'last';
}

/* 把 idx 处的明细复制一份，落到 targetSec 部分的 pos 位置，返回新行下标 */
function insertCopiedItem(idx, targetSec, pos) {
  const list = editor.quote.items;
  const src = list[idx];
  if (!src) return -1;
  const clone = JSON.parse(JSON.stringify(src));
  clone.section = targetSec;
  let insertAt;
  if (pos === 'first') {
    const i = list.findIndex(it => sectionOf(it) === targetSec);
    insertAt = i === -1 ? list.length : i;
  } else if (pos === 'last') {
    let last = -1;
    list.forEach((it, k) => { if (sectionOf(it) === targetSec) last = k; });
    insertAt = last === -1 ? list.length : last + 1;
  } else {
    const ref = Number(String(pos).split(':')[1]);
    if (!(ref >= 0 && ref < list.length)) return -1;
    insertAt = ref + 1;
  }
  if (editor.sections.indexOf(targetSec) === -1) editor.sections.push(targetSec);
  list.splice(insertAt, 0, clone);
  return insertAt;
}

/* 复制完成后高亮新行，便于确认落点（不滚动视图，避免报价时被“跳走”） */
function flashRow(index) {
  const row = $(`#detailBody .qitem[data-row="${index}"]`);
  if (!row) return;
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 2100);
}

/* 目标部分胶囊交互（单个复制 / 批量复制共用）；onPick 在目标变化后回调 */
function bindCopyTargetChips(initialSec, onPick) {
  let targetSec = initialSec;
  let newSec = '';
  const wrap = $('#copySecChips');
  if (!wrap) return { target: () => targetSec };
  const paint = () => {
    renderCopyChips(targetSec, newSec);
    if (onPick) onPick(targetSec);
  };
  const askNewSec = () => {
    wrap.innerHTML = `<input class="input sec-chip-input" id="copyNewSec" maxlength="30"
      placeholder="输入新部分名称，回车确认" value="">`;
    const inp = $('#copyNewSec');
    if (!inp) return;
    inp.focus();
    // 只提交一次：回车与失焦都可能触发，重复改写 DOM 会让浏览器报错
    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const v = (inp.value || '').trim();
      if (!v) { paint(); return; }
      targetSec = v;
      newSec = editor.sections.indexOf(v) === -1 ? v : '';
      paint();
    };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; paint(); }
    };
    // 失焦延后一帧再提交，避免在 blur 派发过程中改写 DOM
    inp.onblur = () => setTimeout(commit, 0);
  };
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('[data-pick-new]')) { askNewSec(); return; }
    const btn = e.target.closest('[data-pick]');
    if (!btn) return;
    targetSec = btn.dataset.pick;
    newSec = '';
    paint();
  });
  paint();
  return { target: () => targetSec };
}

function copyItemDialog(idx) {
  const list = editor.quote.items;
  const src = list[idx];
  if (!src) return;
  const srcSec = sectionOf(src);
  const srcRank = list.filter(it => sectionOf(it) === srcSec).indexOf(src) + 1;

  const body = `
    <div class="copy-src">
      <span class="copy-src-tag">源项目</span>
      <b>${esc(src.name)}</b>
      <span class="copy-src-where">当前在「${esc(srcSec)}」第 ${srcRank} 项</span>
    </div>
    <div class="field">
      <label>复制到哪个部分</label>
      <div class="sec-chips" id="copySecChips"></div>
    </div>
    <div class="field" style="margin-top:14px">
      <label>插入到该部分的什么位置</label>
      <select class="select" id="copyPosSel" name="pos"></select>
    </div>
    <div class="hint">要放到两个部分之间？按住 <b>Ctrl</b> 拖拽任意一行左侧的手柄，即可直接复制到目标位置。</div>`;

  openModal({
    title: '复制明细项目',
    body,
    okText: '复制到此',
    onOk: () => {
      const target = chips.target();
      const sel = $('#copyPosSel');
      const at = insertCopiedItem(idx, target, sel ? sel.value : 'last');
      if (at < 0) { toast('插入位置已失效，请重新选择', 'warn'); return; }
      delete editor.collapsed[target];
      editor.batchSel = {};
      closeModal();
      renderDetail();
      toast(`已复制「${src.name}」到「${target}」`, 'success');
      flashRow(at);
    },
  });

  const chips = bindCopyTargetChips(srcSec, (target) => renderCopyPositions(target, srcSec, idx));
}

/* ==================================================== 批量操作（复制 / 删除） */
function batchIds() {
  const n = editor.quote.items.length;
  return Object.keys(editor.batchSel)
    .filter(k => editor.batchSel[k])
    .map(Number)
    .filter(i => i >= 0 && i < n)
    .sort((a, b) => a - b);
}

/* 明细结构变化后，清掉越界的勾选 */
function pruneBatchSel() {
  const n = editor.quote.items.length;
  Object.keys(editor.batchSel).forEach(k => {
    const i = Number(k);
    if (!editor.batchSel[k] || !(i >= 0 && i < n)) delete editor.batchSel[k];
  });
}

function renderBatchBar() {
  const bar = $('#batchBar');
  if (!bar) return;
  bar.style.display = editor.batch ? '' : 'none';
  if (!editor.batch) { bar.innerHTML = ''; return; }
  const total = editor.quote.items.length;
  const n = batchIds().length;
  bar.innerHTML = `
    <label class="ck-inline"><input type="checkbox" id="ckAllRows" ${total && n === total ? 'checked' : ''}>全选</label>
    <span class="batch-tip">勾选明细行后可整组复制到任意部分，或一次性删除</span>
    <div class="spacer"></div>
    <span class="batch-cnt">已选 <b>${n}</b> / ${total} 项</span>
    <button class="btn btn-ghost btn-sm" id="btnBatchCopy">${ICON.copy}复制所选</button>
    <button class="btn btn-danger btn-sm" id="btnBatchDel">${ICON.trash}删除所选</button>`;
  const all = $('#ckAllRows');
  if (all) all.onchange = () => {
    editor.batchSel = {};
    if (all.checked) editor.quote.items.forEach((_, i) => { editor.batchSel[i] = true; });
    $$('[data-ck]', $('#detailBody')).forEach(el => {
      const i = Number(el.dataset.ck);
      el.checked = !!editor.batchSel[i];
      const row = el.closest('.qitem');
      if (row) row.classList.toggle('checked', el.checked);
    });
    updateBatchCount();
  };
  const cp = $('#btnBatchCopy');
  if (cp) cp.onclick = batchCopyDialog;
  const dl = $('#btnBatchDel');
  if (dl) dl.onclick = batchDeleteDialog;
}

function updateBatchCount() {
  const n = batchIds().length;
  const cnt = $('#batchBar .batch-cnt');
  if (cnt) cnt.innerHTML = `已选 <b>${n}</b> / ${editor.quote.items.length} 项`;
  const all = $('#ckAllRows');
  if (all) all.checked = n > 0 && n === editor.quote.items.length;
}

function batchDeleteDialog() {
  const idxs = batchIds();
  if (!idxs.length) return toast('请先勾选要删除的项目', 'warn');
  const names = idxs.slice(0, 3).map(i => editor.quote.items[i].name).join('、');
  confirmBox(`确定从报价单中删除选中的 <b>${idxs.length}</b> 个项目吗？<br>`
    + `<span style="color:var(--text3);font-size:12px">${esc(names)}${idxs.length > 3 ? ' 等' : ''}</span>`, () => {
    const del = new Set(idxs);
    editor.quote.items = editor.quote.items.filter((_, i) => !del.has(i));
    editor.batchSel = {};
    renderDetail();
    toast(`已删除 ${idxs.length} 个项目`, 'success');
  }, true);
}

function batchCopyDialog() {
  const idxs = batchIds();
  if (!idxs.length) return toast('请先勾选要复制的项目', 'warn');
  const names = idxs.slice(0, 4).map(i => clipText(editor.quote.items[i].name, 12)).join('、');
  const start = editor.currentSection || editor.sections[0] || '检测实验';

  const body = `
    <div class="copy-src">
      <span class="copy-src-tag">已选</span>
      <b>${idxs.length} 个项目</b>
      <span class="copy-src-where">${esc(names)}${idxs.length > 4 ? ' 等' : ''}</span>
    </div>
    <div class="field">
      <label>复制到哪个部分</label>
      <div class="sec-chips" id="copySecChips"></div>
    </div>
    <div class="field" style="margin-top:14px">
      <label>插入位置</label>
      <select class="select" id="copyPosSel" name="pos">
        <option value="last">放到该部分最后面</option>
        <option value="first">放到该部分最前面</option>
      </select>
    </div>
    <div class="hint">按明细当前顺序整组复制；复制后停留在当前位置，不会跳转视图。</div>`;

  openModal({
    title: `批量复制 ${idxs.length} 个项目`,
    body,
    okText: '复制到此',
    onOk: () => {
      const target = chips.target();
      const sel = $('#copyPosSel');
      const at = insertCopiedItems(idxs, target, sel ? sel.value : 'last');
      if (at < 0) { toast('插入位置已失效，请重新选择', 'warn'); return; }
      delete editor.collapsed[target];
      editor.batchSel = {};
      closeModal();
      renderDetail();
      toast(`已复制 ${idxs.length} 个项目到「${target}」`, 'success');
      // 不滚动视图，改用高亮标记落点
      for (let k = 0; k < idxs.length; k++) flashRow(at + k);
    },
  });

  const chips = bindCopyTargetChips(start, null);
}

/* 选中的多行按原顺序整组复制到 targetSec 的 pos 位置，返回插入起始下标 */
function insertCopiedItems(idxs, targetSec, pos) {
  const list = editor.quote.items;
  const clones = idxs.filter(i => i >= 0 && i < list.length).map(i => {
    const clone = JSON.parse(JSON.stringify(list[i]));
    clone.section = targetSec;
    return clone;
  });
  if (!clones.length) return -1;
  let insertAt;
  if (pos === 'first') {
    const first = list.findIndex(it => sectionOf(it) === targetSec);
    insertAt = first === -1 ? list.length : first;
  } else {
    let last = -1;
    list.forEach((it, k) => { if (sectionOf(it) === targetSec) last = k; });
    insertAt = last === -1 ? list.length : last + 1;
  }
  if (editor.sections.indexOf(targetSec) === -1) editor.sections.push(targetSec);
  list.splice(insertAt, 0, ...clones);
  return insertAt;
}

/* 上移 / 下移：只在同一模块内换位 */
function move(idx, dir) {
  const list = editor.quote.items;
  if (idx < 0 || idx >= list.length) return;
  const name = sectionOf(list[idx]);
  let target = -1;
  if (dir < 0) {
    for (let i = idx - 1; i >= 0; i--) if (sectionOf(list[i]) === name) { target = i; break; }
  } else {
    for (let i = idx + 1; i < list.length; i++) if (sectionOf(list[i]) === name) { target = i; break; }
  }
  if (target < 0) return;
  const tmp = list[idx];
  list[idx] = list[target];
  list[target] = tmp;
  editor.batchSel = {};
  renderDetail();
}

/* 拖拽排序：把 from 行移到 to 行前/后，跨模块拖拽时自动归入目标模块
   copy=true（按住 Ctrl 拖动）时不搬走原行，而是复制一份落到目标位置 */
function reorderItem(from, to, after, copy) {
  const list = editor.quote.items;
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return;
  const targetSection = sectionOf(list[to]);
  if (copy) {
    const clone = JSON.parse(JSON.stringify(list[from]));
    clone.section = targetSection;
    const insertAt = after ? to + 1 : to;
    if (editor.sections.indexOf(targetSection) === -1) editor.sections.push(targetSection);
    list.splice(insertAt, 0, clone);
    editor.batchSel = {};
    delete editor.collapsed[targetSection];
    renderDetail();
    toast(`已复制「${clone.name}」到「${targetSection}」`, 'success');
    flashRow(insertAt);
    return;
  }
  if (from === to) return;
  const moved = list.splice(from, 1)[0];
  const insertAt = from < to ? (after ? to : to - 1) : (after ? to + 1 : to);
  moved.section = targetSection;
  list.splice(insertAt, 0, moved);
  editor.batchSel = {};
  renderDetail();
}

function bindDragSort() {
  const body = $('#detailBody');
  if (!body) return;
  let dragIdx = null;
  const clearMarks = () => $$('.qitem', body)
    .forEach(r => r.classList.remove('drop-before', 'drop-after', 'drop-copy'));
  // 按 Ctrl / Alt 拖动＝复制，否则＝移动
  const isCopyDrag = (e) => !!(e.ctrlKey || e.altKey || e.metaKey);
  // 全局兜底只需绑定一次，避免每次渲染叠加监听
  if (!bindDragSort._bound) {
    bindDragSort._bound = true;
    document.addEventListener('mouseup', () => {
      $$('.qitem[draggable="true"]').forEach(r => { r.draggable = false; });
    });
  }
  $$('.qitem', body).forEach(row => {
    const handle = $('.drag-handle', row);
    if (handle) {
      // 按住手柄才允许拖动，避免在输入框里选字时误触拖拽
      handle.onmousedown = () => { row.draggable = true; };
      handle.onmouseup = () => { row.draggable = false; };
    }
    row.ondragstart = (e) => {
      dragIdx = Number(row.dataset.row);
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (err) { /* 忽略 */ }
    };
    row.ondragend = () => {
      row.draggable = false;
      row.classList.remove('dragging');
      clearMarks();
      dragIdx = null;
    };
    row.ondragover = (e) => {
      if (dragIdx === null) return;
      e.preventDefault();
      const cp = isCopyDrag(e);
      e.dataTransfer.dropEffect = cp ? 'copy' : 'move';
      const rect = row.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      clearMarks();
      row.classList.add(after ? 'drop-after' : 'drop-before');
      if (cp) row.classList.add('drop-copy');
    };
    row.ondrop = (e) => {
      e.preventDefault();
      if (dragIdx === null) return;
      const cp = isCopyDrag(e);
      const to = Number(row.dataset.row);
      const rect = row.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      const from = dragIdx;
      dragIdx = null;
      clearMarks();
      reorderItem(from, to, after, cp);
    };
  });
}

function updateSummary() {
  const q = editor.quote;
  const dr = Number($('#discount_rate') ? $('#discount_rate').value : q.discount_rate) || 0;
  const tr = Number($('#tax_rate') ? $('#tax_rate').value : q.tax_rate) || 0;
  const t = calcTotals(q.items, dr, tr);
  q.discount_rate = dr;
  q.tax_rate = tr;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set('#sumSubtotal', money(t.subtotal));
  set('#sumDiscount', '-' + money(t.discountAmount));
  set('#sumTax', money(t.taxAmount));
  set('#sumTotal', '¥ ' + money(t.total));
  set('#sumUpper', rmbUpper(t.total));
  const cnt = $('#itemCount');
  if (cnt) cnt.textContent = q.items.length;
  // 各分组小计
  const bySection = {};
  q.items.forEach(it => {
    const name = it.section || editor.sections[0] || '检测实验';
    bySection[name] = round2((bySection[name] || 0) + Number(it.amount || 0));
  });
  $$('[data-sec-total]').forEach(el => {
    el.textContent = money(bySection[el.dataset.secTotal] || 0);
  });
}

function collectQuote() {
  const q = editor.quote;
  return {
    title: $('[name=title]').value.trim(),
    customer_id: Number($('#selCustomer').value) || 0,
    customer_name: $('#customer_name').value.trim(),
    contact: $('[name=contact]').value.trim(),
    phone: $('[name=phone]').value.trim(),
    address: $('[name=address]').value.trim(),
    quote_date: $('[name=quote_date]').value,
    expire_date: $('[name=expire_date]').value,
    status: $('[name=status]').value,
    discount_rate: Number($('#discount_rate').value) || 0,
    tax_rate: Number($('#tax_rate').value) || 0,
    remark: $('[name=remark]').value,
    terms: $('[name=terms]').value,
    items: q.items.map(it => ({
      item_id: it.item_id || 0, code: it.code, name: it.name, spec: it.spec,
      unit: it.unit, price: Number(it.price) || 0, price_type: it.price_type || 'normal',
      section: sectionOf(it), group_name: it.group_name || '', group_count: Number(it.group_count) || 0, quantity: calcQty(it),
      samples: Number(it.samples) || 0, indicators: Number(it.indicators) || 0,
      repeats: Number(it.repeats) || 0,
      discount_rate: Number(it.discount_rate) || 0, note: it.note || '',
    })),
  };
}

async function saveQuote(andExport) {
  const q = editor.quote;
  const payload = collectQuote();
  if (!payload.customer_name) return toast('请填写客户单位', 'warn');
  if (!payload.items.length) return toast('请至少添加一个检测项目', 'warn');
  try {
    if (q.id) {
      await PUT(`/api/quotes/${q.id}`, payload);
    } else {
      const r = await POST('/api/quotes', payload);
      q.id = r.id;
    }
    toast('报价单已保存', 'success');
    if (andExport) {
      chooseExportTarget(q.id, () => go('quotes'));
      return;
    }
    go('quotes');
  } catch (e) { /* 已提示 */ }
}
