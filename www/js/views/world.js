import { state, persist, PALETTE } from '../store.js';
import { h, esc, $, $$, uid, rgb } from '../util.js';
import { icons } from '../icons.js';
import { openSheet, actionSheet, confirmDialog, toast, swatches, flip, stagger, collapse, onLongPress, consumeLongPress } from '../ui.js';
import { pageHeader, bindScroll, emptyState, formSheet } from './common.js';

let page, chipsEl, grid;
let filter = null; // null = 全部

const typeOf = name => state.settings.worldTypes.find(t => t.name === name);
const colorOf = card => card.color || (typeOf(card.type) || {}).color || '#22B07A';

export function mount(el) {
  page = el;
  page.innerHTML = pageHeader({
    eyebrow: 'WORLD', title: '世界',
  }) + '<div class="chips"></div><div class="grid"></div>';
  chipsEl = $('.chips', page);
  grid = $('.grid', page);
  bindScroll(page);

  grid.addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (card && !consumeLongPress(card)) editCard(card.dataset.id);
  });
  render();
}

export function render({ animate = false } = {}) {
  const cards = state.world;
  $('.hero-sub', page).innerHTML = `<span><span class="num">${cards.length}</span> 张设定卡</span>`;
  renderChips();
  renderGrid({ animate });
}

function renderGrid({ animate = false } = {}) {
  const cards = state.world;
  const shown = filter ? cards.filter(c => c.type === filter) : cards;
  grid.innerHTML = '';
  grid.style.display = shown.length ? '' : 'block';
  if (!shown.length) {
    grid.innerHTML = filter
      ? emptyState(`还没有「${filter}」卡片`, '点右下角的 + 添加')
      : emptyState('世界从这里开始', '添加人设、世界设定、剧情大纲、势力等卡片');
  }
  for (const c of shown) {
    const card = h(`
      <div class="card wcard" data-id="${c.id}" style="--c:${rgb(colorOf(c))}">
        <span class="wcard-type">${esc(c.type)}</span>
        <div class="wcard-title">${esc(c.title || '未命名')}</div>
        ${c.desc ? `<div class="wcard-desc">${esc(c.desc)}</div>` : ''}
      </div>`);
    onLongPress(card, () => cardMenu(c.id));
    grid.appendChild(card);
  }
  if (animate) stagger(grid);
}

function renderChips() {
  const count = name => state.world.filter(c => c.type === name).length;
  const scrollLeft = chipsEl.scrollLeft;
  chipsEl.innerHTML = '';
  const mk = (label, value, n) => {
    const b = h(`<button class="chip${filter === value ? ' on' : ''}">${esc(label)}${n != null ? ` <span class="cnt">${n}</span>` : ''}</button>`);
    b.addEventListener('click', () => {
      if (filter === value) return;
      filter = value;
      $$('.chip', chipsEl).forEach(x => x.classList.toggle('on', x === b));
      flip(grid, () => renderGrid());
    });
    return b;
  };
  chipsEl.appendChild(mk('全部', null));
  for (const t of state.settings.worldTypes) {
    const b = mk(t.name, t.name, count(t.name));
    onLongPress(b, () => typeMenu(t.name));
    chipsEl.appendChild(b);
  }
  const add = h(`<button class="chip add">${icons.plus}类型</button>`);
  add.addEventListener('click', addType);
  chipsEl.appendChild(add);
  chipsEl.scrollLeft = scrollLeft;
}

export function fab() {
  editCard(null);
}

// 新建 / 编辑卡片（卡片的详细页面以后再做，现在点开就是这个编辑面板）
function editCard(id) {
  const existing = id && state.world.find(c => c.id === id);
  const types = state.settings.worldTypes;
  let type = existing ? existing.type : (filter || (types[0] && types[0].name) || '设定');
  let color = existing ? existing.color : null; // null = 跟随类型颜色

  const extra = h(`
    <div>
      <div class="field"><label>颜色</label><div class="sw"></div></div>
      ${existing ? `<button type="button" class="btn danger block" data-del style="margin-bottom:10px">${icons.trash}删除这张卡片</button>` : ''}
    </div>`);
  const typeField = h('<div class="field"><label>类型</label><div class="tag-grid"></div></div>');
  const typeGrid = $('.tag-grid', typeField);
  const swWrap = $('.sw', extra);

  const drawSwatches = () => {
    swWrap.innerHTML = '';
    swWrap.appendChild(swatches(PALETTE, color || (typeOf(type) || {}).color, hex => { color = hex; }));
  };
  for (const t of types) {
    const b = h(`<button type="button" class="tag-opt${t.name === type ? ' on' : ''}" style="font-size:15px">${esc(t.name)}</button>`);
    b.addEventListener('click', () => {
      type = t.name;
      $$('.tag-opt', typeGrid).forEach(x => x.classList.toggle('on', x === b));
      if (!existing || !existing.color) { color = null; drawSwatches(); }
    });
    typeGrid.appendChild(b);
  }
  drawSwatches();

  const s = formSheet({
    title: existing ? '编辑卡片' : '新建卡片',
    submit: existing ? '保存' : '添加',
    fields: [
      { key: 'title', label: '名称', value: existing ? existing.title : '', placeholder: '人物名 / 地名 / 设定名…' },
      { key: 'desc', label: '简介', type: 'textarea', value: existing ? existing.desc : '', placeholder: '简单写几句，详细页面后续加入' },
    ],
    extra,
    onSubmit: v => {
      if (!v.title) { toast('先给卡片起个名字'); return false; }
      const now = Date.now();
      // 颜色与类型默认色相同则不单独保存，之后改类型颜色时会一起变
      const own = color && color !== (typeOf(type) || {}).color ? color : null;
      if (existing) {
        Object.assign(existing, { type, title: v.title, desc: v.desc, color: own, updatedAt: now });
        persist('world');
        render();
      } else {
        const card = { id: uid(), type, title: v.title, desc: v.desc, color: own, createdAt: now, updatedAt: now };
        flip(grid, () => { state.world.unshift(card); render(); });
        persist('world');
        page.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
  });
  const form = $('.form', s.body);
  form.insertBefore(typeField, form.firstChild);
  if (existing) $('[data-del]', extra).addEventListener('click', async () => { s.close(); removeCard(id); });
}

async function cardMenu(id) {
  const c = state.world.find(x => x.id === id);
  if (!c) return;
  const act = await actionSheet(c.title || '未命名', [
    { label: '编辑', icon: 'edit', value: 'edit' },
    { label: '删除', icon: 'trash', value: 'del', danger: true },
  ]);
  if (act === 'edit') editCard(id);
  if (act === 'del') removeCard(id);
}

async function removeCard(id) {
  const c = state.world.find(x => x.id === id);
  if (!c) return;
  const ok = await confirmDialog({ title: `删除「${c.title || '未命名'}」？`, message: '删除后无法恢复。', ok: '删除', danger: true });
  if (!ok) return;
  const el = grid.querySelector(`[data-id="${id}"]`);
  if (el) await collapse(el);
  flip(grid, () => { state.world = state.world.filter(x => x.id !== id); render(); });
  persist('world');
  toast('已删除');
}

function addType() {
  let color = PALETTE[(state.settings.worldTypes.length + 4) % PALETTE.length].hex;
  const extra = h('<div class="field"><label>类型颜色</label></div>');
  extra.appendChild(swatches(PALETTE, color, hex => { color = hex; }));
  formSheet({
    title: '新增卡片类型', submit: '添加',
    fields: [{ key: 'name', label: '类型名称', placeholder: '例如：地理、物品、历史', maxlength: 8 }],
    extra,
    onSubmit: v => {
      if (!v.name) { toast('请输入类型名称'); return false; }
      if (typeOf(v.name)) { toast('已经有这个类型了'); return false; }
      state.settings.worldTypes.push({ name: v.name, color });
      persist('settings');
      render();
    },
  });
}

async function typeMenu(name) {
  const t = typeOf(name);
  if (!t) return;
  const used = state.world.filter(c => c.type === name).length;
  const act = await actionSheet(`类型「${name}」`, [
    { label: '修改类型颜色', icon: 'drop', value: 'color' },
    { label: '删除这个类型', icon: 'trash', value: 'del', danger: true, hint: used ? `还有 ${used} 张卡片` : '' },
  ]);
  if (act === 'color') {
    const body = h('<div></div>');
    body.appendChild(swatches(PALETTE, t.color, hex => { t.color = hex; persist('settings'); render(); }));
    body.appendChild(h('<div class="swatch-label">没有单独设置颜色的卡片会跟着变</div>'));
    openSheet({ title: `「${name}」的颜色`, body });
  }
  if (act === 'del') {
    if (used) { toast('请先删除或改掉这个类型下的卡片'); return; }
    state.settings.worldTypes = state.settings.worldTypes.filter(x => x.name !== name);
    if (filter === name) filter = null;
    persist('settings');
    render();
  }
}
