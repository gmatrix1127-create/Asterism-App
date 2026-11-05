import { state, persist, getText, delText, PALETTE } from '../store.js';
import { h, esc, $, $$, uid, rgb, fmtNum } from '../util.js';
import { icons } from '../icons.js';
import { openSheet, actionSheet, confirmDialog, toast, flip, stagger, collapse, onLongPress, consumeLongPress, swatches, datePicker } from '../ui.js';
import { pageHeader, pageActions, bindScroll, emptyState, formSheet } from './common.js';
import { openEditor } from '../editor.js';
import { imageIds, stripImages, imagesAsMarks, deleteImages } from '../rich.js';

// 随记：可以写标题（不写就用正文第一行）；每篇可以选一个分类，卡片颜色跟着分类走；可以插图
export const TAB = { label: '随记', icon: 'note' };

const DEFAULT_CATS = ['生活', '工作', '个人', '密码'];
let page, chipsEl, list, acts;
let filter = null;

function ensureSettings() {
  const s = state.settings;
  if (!Array.isArray(s.memoCats)) s.memoCats = DEFAULT_CATS.slice();
  if (!s.memoCatColors || typeof s.memoCatColors !== 'object') s.memoCatColors = {};
  if (s.lastMemoCat === undefined) s.lastMemoCat = s.memoCats[0] || '';
  if (s.noteView !== 'simple') s.noteView = 'detail';
}

// x.name：自己写的标题；x.title：正文第一行有字的内容（图片那一行跳过），没写标题时拿来当标题。
// 写了标题，预览从正文开头算；没写，第一行已经当了标题，预览从第二行算。预览里图片显示成［图片］
function split(text, named) {
  const lines = text.split('\n');
  const i = lines.findIndex(l => stripImages(l).replace(/[\s　]/g, ''));
  const title = i < 0 ? '' : lines[i].trim().slice(0, 60);
  // 只有图片没有字、又没写标题时，标题已经显示［图片］，预览就不再重复
  const body = named ? imagesAsMarks(text) : i < 0 ? '' : imagesAsMarks(lines.filter((_, j) => j !== i).join('\n'));
  return {
    title,
    images: imageIds(text).length,
    preview: body.replace(/^[\s　]+/, '').replace(/\n[\s　]+/g, '\n').replace(/\s+$/, '').slice(0, 140),
  };
}
const titleOf = x => x.name || x.title || (x.images ? '［图片］' : '无标题');
const isEmpty = x => !x.name && !x.title && !x.words && !x.images;

// 创建日期，精确到日
function fmtDay(ts) {
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

// ---------- 分类颜色：自己设过的用设定的，没设过的按分类在列表里的位置自动分配 ----------
function catColor(cat) {
  const custom = cat && state.settings.memoCatColors[cat];
  if (custom) return custom;
  const i = state.settings.memoCats.indexOf(cat);
  const order = [0, 2, 5, 7, 4, 1, 3, 6, 8, 9, 10];
  return PALETTE[order[(i < 0 ? 0 : i) % order.length]].hex;
}

export function mount(el) {
  ensureSettings();
  // 上次没写字就退出的空随记，打开时顺手清掉
  if (state.notes.some(isEmpty)) {
    state.notes = state.notes.filter(x => !isEmpty(x));
    persist('notes');
  }
  page = el;
  page.innerHTML = pageHeader({ eyebrow: 'NOTES', title: '随记' }) + '<div class="chips"></div><div class="list"></div>';
  chipsEl = $('.chips', page);
  list = $('.list', page);
  bindScroll(page);
  acts = pageActions(page, [
    { act: 'view', icon: viewIcon(), label: '切换卡片样式' },
    { act: 'cats', icon: 'tag', label: '管理分类' },
  ]);
  $('[data-act=cats]', acts).addEventListener('click', manageCats);
  $('[data-act=view]', acts).addEventListener('click', toggleView);

  list.addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (!card || consumeLongPress(card)) return;
    open(card.dataset.id);
  });
  render();
}

const viewIcon = () => state.settings.noteView === 'simple' ? 'rows' : 'cards';

// 详细 / 简约（折叠）两种卡片
function toggleView() {
  const s = state.settings;
  s.noteView = s.noteView === 'simple' ? 'detail' : 'simple';
  persist('settings');
  $('[data-act=view]', acts).innerHTML = icons[viewIcon()];
  flip(list, () => renderList());
}

// 新建的排在最前面
const sorted = () => state.notes.slice().sort((a, b) => b.createdAt - a.createdAt);

export function render({ animate = false } = {}) {
  ensureSettings(); // 从备份恢复后设置会被整体替换
  const total = state.notes.reduce((s, x) => s + (x.words || 0), 0);
  $('.hero-sub', page).innerHTML = `<span>共 <span class="num">${state.notes.length}</span> 篇</span><span class="dot-sep"></span><span><span class="num">${fmtNum(total)}</span> 字</span>`;
  const vb = $('[data-act=view]', acts);
  if (vb) vb.innerHTML = icons[viewIcon()];
  renderChips();
  renderList({ animate });
}

function renderList({ animate = false } = {}) {
  const simple = state.settings.noteView === 'simple';
  list.classList.toggle('simple', simple);
  const shown = sorted().filter(x => !filter || x.cat === filter);
  list.innerHTML = shown.length ? '' : (filter
    ? emptyState(`还没有「${filter}」类随记`, '换个分类看看，或者新写一篇')
    : emptyState('还没有随记', '点右下角的 + 随手记下点什么'));
  for (const x of shown) {
    const c = rgb(catColor(x.cat));
    const card = h(`
      <div class="card ncard${simple ? ' simple' : ''}" data-id="${x.id}" style="--c:${c}">
        <div class="ncard-head">
          <span class="ncard-title">${esc(titleOf(x))}</span>
          ${x.cat ? `<span class="tags"><span class="tag">${esc(x.cat)}</span></span>` : ''}
        </div>
        ${simple ? '' : `
        <div class="ncard-preview">${esc(x.preview || '')}</div>
        <div class="ncard-meta"><span>创建于 ${fmtDay(x.createdAt)}</span><span class="dot-sep"></span><span><span class="num">${fmtNum(x.words)}</span> 字</span></div>`}
      </div>`);
    onLongPress(card, () => noteMenu(x.id));
    list.appendChild(card);
  }
  if (animate) stagger(list);
}

function renderChips() {
  const scrollLeft = chipsEl.scrollLeft;
  chipsEl.innerHTML = '';
  const cats = state.settings.memoCats.slice();
  // 已经删掉但还有随记在用的分类也显示出来
  for (const x of state.notes) if (x.cat && !cats.includes(x.cat)) cats.push(x.cat);
  const mk = (label, value) => {
    const n = value == null ? null : state.notes.filter(x => x.cat === value).length;
    const b = h(`<button class="chip${filter === value ? ' on' : ''}">${esc(label)}${n != null ? ` <span class="cnt">${n}</span>` : ''}</button>`);
    b.addEventListener('click', () => {
      if (filter === value) return;
      filter = value;
      $$('.chip', chipsEl).forEach(c => c.classList.toggle('on', c === b));
      flip(list, () => renderList());
    });
    return b;
  };
  chipsEl.appendChild(mk('全部', null));
  for (const t of cats) chipsEl.appendChild(mk(t, t));
  chipsEl.scrollLeft = scrollLeft;
}

function open(id) {
  openEditor({
    kind: 'note', id,
    onClose: () => {
      // 一个字都没写就退出：不留空随记
      const x = state.notes.find(n => n.id === id);
      if (x && isEmpty(x)) {
        state.notes = state.notes.filter(n => n !== x);
        persist('notes');
        delText(id);
      }
      flip(list, () => render());
    },
  });
}

// ---------- 分类选择组件 ----------
// mode: 'pick' 单选（再点一次取消）；'manage' 管理（点分类改颜色，“管理”状态下可删除）
function catGrid(selected, onChange, { mode = 'pick' } = {}) {
  const wrap = h('<div class="tag-grid"></div>');
  let editing = false;
  const draw = () => {
    wrap.innerHTML = '';
    wrap.classList.toggle('editing', editing);
    for (const t of state.settings.memoCats) {
      const b = h(`<button type="button" class="tag-opt${mode === 'pick' && t === selected ? ' on' : ''}" style="--c:${rgb(catColor(t))}">
        ${mode === 'manage' ? '<i class="tag-dot"></i>' : ''}${esc(t)}<span class="del">${icons.x}</span></button>`);
      b.addEventListener('click', e => {
        if (editing) {
          if (e.target.closest('.del')) {
            state.settings.memoCats = state.settings.memoCats.filter(x => x !== t);
            persist('settings');
            draw();
          }
          return;
        }
        if (mode === 'manage') { pickCatColor(t, draw); return; }
        selected = selected === t ? '' : t;
        draw();
        onChange(selected);
      });
      wrap.appendChild(b);
    }
    if (!editing) {
      const add = h(`<button type="button" class="tag-opt new">+ 自定义</button>`);
      add.addEventListener('click', () => addCat(t => {
        if (mode === 'pick') { selected = t; onChange(t); }
        draw();
      }));
      wrap.appendChild(add);
    }
  };
  draw();
  wrap.setEditing = v => { editing = v; draw(); };
  return wrap;
}

function addCat(done) {
  formSheet({
    title: '自定义分类', submit: '添加',
    fields: [{ key: 'name', label: '分类名称（如“学习”“灵感”）', maxlength: 6, placeholder: '学习' }],
    onSubmit: v => {
      const t = v.name.replace(/\s/g, '');
      if (!t) { toast('请输入分类名称'); return false; }
      if (!state.settings.memoCats.includes(t)) state.settings.memoCats.push(t);
      persist('settings');
      renderChips();
      done && done(t);
    },
  });
}

// 某个分类对应的卡片颜色；第一格“自”表示按位置自动配色
function pickCatColor(t, after) {
  const body = h(`<div><div class="sw"></div><div class="hint" style="margin-top:12px">第一格是自动配色。</div></div>`);
  $('.sw', body).appendChild(swatches(PALETTE, state.settings.memoCatColors[t] || null, hex => {
    if (hex) state.settings.memoCatColors[t] = hex;
    else delete state.settings.memoCatColors[t];
    persist('settings');
    render();
    after && after();
    setTimeout(() => s.close(), 160);
  }, { allowNone: true, noneLabel: '自' }));
  const s = openSheet({ title: `「${t}」的卡片颜色`, body });
}

function manageCats() {
  const body = h(`<div><div class="tg"></div><div class="hint" style="margin-top:14px">点分类可以设置它的卡片颜色。删除分类不会影响已经写好的随记。</div></div>`);
  const grid = catGrid(null, () => {}, { mode: 'manage' });
  $('.tg', body).appendChild(grid);
  const btn = h('<button class="chip">管理</button>');
  let editing = false;
  btn.addEventListener('click', () => {
    editing = !editing;
    btn.textContent = editing ? '完成' : '管理';
    btn.classList.toggle('on', editing);
    grid.setEditing(editing);
  });
  const s = openSheet({ title: '随记分类', body, onClose: () => render() });
  $('.sheet-title', s.layer).appendChild(btn);
}

// ---------- 新建：先选分类，再进编辑页 ----------
export function fab() {
  let cat = state.settings.memoCats.includes(state.settings.lastMemoCat) ? state.settings.lastMemoCat : '';
  const body = h(`
    <div>
      <div class="field"><label>标题（可不填，不填就用正文第一行）</label>
        <input class="input" name="name" maxlength="60" placeholder="无标题" enterkeyhint="done"></div>
      <div class="field"><label>分类（可不选）</label><div class="tg"></div></div>
      <button class="btn primary block" data-ok>${icons.pen}开始写</button>
    </div>`);
  $('.tg', body).appendChild(catGrid(cat, v => { cat = v; }));
  const s = openSheet({ title: '新随记', body });
  $('[data-ok]', body).addEventListener('click', () => {
    const now = Date.now();
    const name = $('[name=name]', body).value.trim();
    const x = { id: uid(), name, title: '', preview: '', words: 0, images: 0, cat, createdAt: now, updatedAt: now };
    state.notes.push(x);
    state.settings.lastMemoCat = cat;
    persist('notes'); persist('settings');
    s.close();
    if (filter && filter !== cat) filter = null;
    setTimeout(() => open(x.id), 180);
  });
}

// ---------- 菜单 / 修改 ----------
const menuItems = x => [
  { label: '修改标题', icon: 'edit', value: 'name' },
  { label: '更换分类', icon: 'tag', value: 'cat', hint: x.cat || '' },
  { label: '修改创建日期', icon: 'calendar', value: 'date', hint: fmtDay(x.createdAt) },
  { label: '删除随记', icon: 'trash', value: 'del', danger: true },
];

async function noteMenu(id) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return;
  const act = await actionSheet('', menuItems(x));
  if (act === 'name') changeName(id);
  if (act === 'cat') changeCat(id);
  if (act === 'date') changeDate(id);
  if (act === 'del') removeNote(id);
}

// 改标题：写了标题，卡片预览改从正文开头算；清空则回到用正文第一行当标题
function changeName(id, { after } = {}) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return;
  formSheet({
    title: '修改标题',
    fields: [{ key: 'name', label: '标题（清空就用正文第一行）', value: x.name || '', placeholder: x.title || '无标题', maxlength: 60 }],
    onSubmit: v => {
      x.name = v.name;
      getText(x.id).then(t => {
        Object.assign(x, split(t, !!x.name));
        persist('notes');
        render();
        after && after(x);
      });
    },
  });
}

function changeCat(id, { after } = {}) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return;
  const grid = catGrid(x.cat || '', v => {
    x.cat = v;
    if (v) state.settings.lastMemoCat = v;
    persist('notes'); persist('settings');
    render();
    after && after(x);
    setTimeout(() => s.close(), 160);
  });
  const s = openSheet({ title: '更换分类', body: grid });
}

async function changeDate(id, { after } = {}) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return;
  const ts = await datePicker({ title: '修改创建日期', value: x.createdAt });
  if (ts == null) return;
  x.createdAt = ts;
  persist('notes');
  render();
  after && after(x);
  toast('创建日期已修改');
}

async function removeNote(id, { skipAnim = false } = {}) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return false;
  const ok = await confirmDialog({ title: '删除这篇随记？', message: '删除后无法恢复。', ok: '删除', danger: true });
  if (!ok) return false;
  const el = !skipAnim && list.querySelector(`[data-id="${id}"]`);
  if (el) await collapse(el);
  state.notes = state.notes.filter(n => n.id !== id);
  persist('notes');
  deleteImages(imageIds(await getText(id)));
  delText(id);
  flip(list, () => render());
  toast('已删除');
  return true;
}

// ---------- 编辑页钩子（编辑页是小说和随记共用的） ----------
export const editorHooks = {
  rich: true,                       // 用可插图的编辑区
  title: x => x.name || x.title || (x.images ? '［图片］' : '新随记'),
  onTitle: (id, ctx) => changeName(id, ctx),   // 点编辑页顶部的标题
  titleClass: '',
  badge: x => x.cat || '分类',       // 标题右边：点了改分类
  onBadge: (id, ctx) => changeCat(id, ctx),
  countText: stripImages,           // 字数不算图片
  onSave: (x, text) => { Object.assign(x, split(text, !!x.name)); },
  placeholder: '第一行是标题',
  autoFocus: x => !x.words,
  async menu(x, ctx) {
    const v = await actionSheet('', menuItems(x));
    if (v === 'name') changeName(x.id, ctx);
    if (v === 'cat') changeCat(x.id, ctx);
    if (v === 'date') changeDate(x.id, ctx);
    return v === 'del' && await removeNote(x.id, { skipAnim: true });
  },
};
