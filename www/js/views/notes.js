import { state, persist, getText, delText } from '../store.js';
import { h, esc, $, uid, fmtNum, fmtDate } from '../util.js';
import { actionSheet, confirmDialog, toast, flip, stagger, collapse, onLongPress, consumeLongPress } from '../ui.js';
import { pageHeader, bindScroll, emptyState } from './common.js';
import { openEditor } from '../editor.js';
import { openSettings } from './settings.js';
import { imageIds, stripImages, imagesAsMarks, deleteImages } from '../rich.js';

// 随记：第一行文字就是标题，其余是正文；不分类、不编号；可以插图
export const TAB = { label: '随记', icon: 'note' };

let page, list;

// 标题取第一行有字的内容（图片那一行跳过）；预览里图片显示成［图片］
function split(text) {
  const lines = text.split('\n');
  const i = lines.findIndex(l => stripImages(l).replace(/[\s　]/g, ''));
  const title = i < 0 ? '' : lines[i].trim().slice(0, 60);
  // 只有图片没有字时，标题已经显示［图片］，预览就不再重复
  const body = i < 0 ? '' : imagesAsMarks(lines.filter((_, j) => j !== i).join('\n'));
  return {
    title,
    images: imageIds(text).length,
    preview: body.replace(/^[\s　]+/, '').replace(/\n[\s　]+/g, '\n').replace(/\s+$/, '').slice(0, 140),
  };
}
const titleOf = x => x.title || (x.images ? '［图片］' : '无标题');
const isEmpty = x => !x.title && !x.words && !x.images;

export function mount(el) {
  // 上次没写字就退出的空随记，打开时顺手清掉
  if (state.notes.some(isEmpty)) {
    state.notes = state.notes.filter(x => !isEmpty(x));
    persist('notes');
  }
  page = el;
  page.innerHTML = pageHeader({
    eyebrow: 'NOTES', title: '随记',
    actions: [{ act: 'settings', icon: 'settings', label: '设置' }],
  }) + '<div class="list"></div>';
  list = $('.list', page);
  bindScroll(page);
  $('[data-act=settings]', page).addEventListener('click', openSettings);

  list.addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (!card || consumeLongPress(card)) return;
    open(card.dataset.id);
  });
  render();
}

// 最近改过的排在最前面
const sorted = () => state.notes.slice().sort((a, b) => b.updatedAt - a.updatedAt);

export function render({ animate = false } = {}) {
  const total = state.notes.reduce((s, x) => s + (x.words || 0), 0);
  $('.hero-sub', page).innerHTML = `<span>共 <span class="num">${state.notes.length}</span> 篇</span><span class="dot-sep"></span><span><span class="num">${fmtNum(total)}</span> 字</span>`;
  const shown = sorted();
  list.innerHTML = shown.length ? '' : emptyState('还没有随记', '点右下角的 + 随手记下点什么');
  for (const x of shown) {
    const card = h(`
      <div class="card ncard" data-id="${x.id}">
        <div class="ncard-head"><span class="ncard-title">${esc(titleOf(x))}</span></div>
        <div class="ncard-preview">${esc(x.preview || '')}</div>
        <div class="ncard-meta"><span>${fmtDate(x.updatedAt)}</span><span class="dot-sep"></span><span><span class="num">${fmtNum(x.words)}</span> 字</span></div>
      </div>`);
    onLongPress(card, () => noteMenu(x.id));
    list.appendChild(card);
  }
  if (animate) stagger(list);
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

// ---------- 新建：直接进编辑页 ----------
export function fab() {
  const now = Date.now();
  const x = { id: uid(), title: '', preview: '', words: 0, createdAt: now, updatedAt: now };
  state.notes.push(x);
  persist('notes');
  open(x.id);
}

// ---------- 菜单 / 删除 ----------
async function noteMenu(id) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return;
  const act = await actionSheet(titleOf(x), [{ label: '删除随记', icon: 'trash', value: 'del', danger: true }]);
  if (act === 'del') removeNote(id);
}

async function removeNote(id, { skipAnim = false } = {}) {
  const x = state.notes.find(n => n.id === id);
  if (!x) return false;
  const ok = await confirmDialog({ title: `删除「${titleOf(x)}」？`, message: '删除后无法恢复。', ok: '删除', danger: true });
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
  title: x => x.title || (x.images ? '［图片］' : '新随记'),
  titleClass: '',
  badge: null,
  countText: stripImages,           // 字数不算图片
  onSave: (x, text) => { Object.assign(x, split(text)); },
  placeholder: '第一行是标题',
  autoFocus: x => !x.words,
  async menu(x) {
    const v = await actionSheet(titleOf(x), [{ label: '删除随记', icon: 'trash', value: 'del', danger: true }]);
    return v === 'del' && await removeNote(x.id, { skipAnim: true });
  },
};
