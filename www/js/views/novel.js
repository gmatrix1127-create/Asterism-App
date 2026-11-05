import { state, persist, delText, PALETTE } from '../store.js';
import { h, esc, $, uid, rgb, fmtNum, fmtDate } from '../util.js';
import { icons } from '../icons.js';
import { openSheet, actionSheet, confirmDialog, toast, swatches, flip, stagger, collapse, onLongPress, consumeLongPress } from '../ui.js';
import { pageHeader, pageActions, bindScroll, emptyState, formSheet } from './common.js';
import { openEditor } from '../editor.js';

let page, list;

export function mount(el) {
  page = el;
  page.innerHTML = pageHeader({
    eyebrow: 'NOVEL', title: '小说',
  }) + '<div class="list"></div>';
  list = $('.list', page);
  bindScroll(page);
  const acts = pageActions(page, [{ act: 'color', icon: 'drop', label: '章节卡片颜色' }]);
  $('[data-act=color]', acts).addEventListener('click', pickColor);

  list.addEventListener('click', e => {
    const card = e.target.closest('[data-id]');
    if (!card || consumeLongPress(card)) return;
    if (e.target.closest('.card-more')) chapterMenu(card.dataset.id);
    else open(card.dataset.id);
  });
  render();
}

export function render({ animate = false } = {}) {
  const chs = state.chapters;
  const total = chs.reduce((s, c) => s + (c.words || 0), 0);
  $('.hero-sub', page).innerHTML = `
    <button class="book-name">${icons.pen}<span>${esc(state.settings.bookTitle)}</span></button>
    <span><span class="num">${chs.length}</span> 章</span><span class="dot-sep"></span>
    <span><span class="num">${fmtNum(total)}</span> 字</span>`;
  $('.book-name', page).addEventListener('click', renameBook);

  const color = state.settings.chapterColor;
  list.innerHTML = chs.length ? '' : emptyState('还没有章节', '点右下角的 + 新建第一章');
  chs.forEach((c, i) => {
    const card = h(`
      <div class="card${color ? '' : ' plain'}" data-id="${c.id}" style="--c:${rgb(color || '#64748B')}">
        <div class="card-idx">${String(i + 1).padStart(2, '0')}</div>
        <div class="card-body">
          <div class="card-title">${esc(c.title || '未命名章节')}</div>
          ${c.note ? `<div class="card-note">${esc(c.note)}</div>` : ''}
          <div class="card-meta"><span><span class="num">${fmtNum(c.words)}</span> 字</span><span>${fmtDate(c.updatedAt)}</span></div>
        </div>
        <button class="icon-btn card-more" aria-label="更多">${icons.more}</button>
      </div>`);
    onLongPress(card, () => chapterMenu(c.id));
    list.appendChild(card);
  });
  if (animate) stagger(list);
}

export function fab() {
  const n = state.chapters.length + 1;
  formSheet({
    title: '新建章节', submit: '创建',
    fields: [
      { key: 'title', label: '章节名', value: `第${n}章 `, placeholder: '例如：第一章 星火' },
      { key: 'note', label: '章节备注（显示在章节名下方，可不填）', type: 'textarea', placeholder: '这一章写什么、伏笔、待办…' },
    ],
    onSubmit: v => {
      const now = Date.now();
      const ch = { id: uid(), title: v.title || `第${n}章`, note: v.note, words: 0, createdAt: now, updatedAt: now };
      flip(list, () => { state.chapters.push(ch); render(); });
      persist('chapters');
      requestAnimationFrame(() => {
        const el = list.querySelector(`[data-id="${ch.id}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
  });
}

function open(id) {
  openEditor({ kind: 'chapter', id, onClose: () => render() });
}

async function chapterMenu(id) {
  const i = state.chapters.findIndex(c => c.id === id);
  if (i < 0) return;
  const c = state.chapters[i];
  const act = await actionSheet(c.title || '未命名章节', [
    { label: '编辑章节名和备注', icon: 'edit', value: 'edit' },
    { label: '上移', icon: 'up', value: 'up', disabled: i === 0 },
    { label: '下移', icon: 'down', value: 'down', disabled: i === state.chapters.length - 1 },
    { label: '删除章节', icon: 'trash', value: 'del', danger: true },
  ]);
  if (act === 'edit') editInfo(id, () => render());
  if (act === 'up' || act === 'down') {
    const j = act === 'up' ? i - 1 : i + 1;
    flip(list, () => {
      const arr = state.chapters;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      render();
    });
    persist('chapters');
  }
  if (act === 'del') removeChapter(id);
}

export function editInfo(id, after) {
  const c = state.chapters.find(x => x.id === id);
  if (!c) return;
  formSheet({
    title: '编辑章节',
    fields: [
      { key: 'title', label: '章节名', value: c.title },
      { key: 'note', label: '章节备注', type: 'textarea', value: c.note, placeholder: '显示在章节名下方' },
    ],
    onSubmit: v => {
      c.title = v.title || c.title;
      c.note = v.note;
      persist('chapters');
      after && after(c);
    },
  });
}

export async function removeChapter(id, { skipAnim = false } = {}) {
  const c = state.chapters.find(x => x.id === id);
  if (!c) return false;
  const ok = await confirmDialog({
    title: `删除「${c.title || '未命名章节'}」？`,
    message: c.words ? `这一章的 ${fmtNum(c.words)} 字正文会一起删除，无法恢复。` : '删除后无法恢复。',
    ok: '删除', danger: true,
  });
  if (!ok) return false;
  const el = !skipAnim && list.querySelector(`[data-id="${id}"]`);
  if (el) await collapse(el);
  state.chapters = state.chapters.filter(x => x.id !== id);
  persist('chapters');
  delText(id);
  flip(list, () => render());
  toast('已删除');
  return true;
}

function renameBook() {
  formSheet({
    title: '作品名',
    fields: [{ key: 'name', label: '小说名称', value: state.settings.bookTitle }],
    onSubmit: v => {
      state.settings.bookTitle = v.name || '未命名作品';
      persist('settings');
      render();
    },
  });
}

function pickColor() {
  const body = h('<div></div>');
  body.appendChild(swatches(PALETTE, state.settings.chapterColor, hex => {
    state.settings.chapterColor = hex;
    persist('settings');
    render();
  }, { allowNone: true }));
  body.appendChild(h('<div class="swatch-label">所有章节卡片统一使用这个颜色</div>'));
  openSheet({ title: '章节卡片颜色', body });
}
