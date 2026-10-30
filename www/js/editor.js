import { state, persist, getText, setText, onFlush, TEXT_COLORS } from './store.js';
import { h, esc, $, wordCount, fmtNum, debounce } from './util.js';
import { icons } from './icons.js';
import { anim, EASE, pushBack, openSheet, actionSheet, segmented, toggle, swatches } from './ui.js';
import { textColor } from './theme.js';
import { editInfo, removeChapter } from './views/novel.js';
import { editorHooks as noteHooks } from './views/notes.js';

const INDENT = '　　';
let opening = false;

export async function openEditor({ kind, id, onClose }) {
  if (opening) return;
  const isNote = kind === 'note';
  const item = (isNote ? state.notes : state.chapters).find(x => x.id === id);
  if (!item) return;
  opening = true;

  const prefs = state.settings.editor;
  let text = await getText(id);
  if (!text && !isNote && prefs.autoIndent) text = INDENT;

  const scr = h(`
    <section class="screen editor">
      <header class="ed-bar">
        <button class="icon-btn" data-act="back" aria-label="返回">${icons.back}</button>
        <div class="ed-titles">
          <div class="ed-title${isNote && noteHooks.titleClass ? ' ' + noteHooks.titleClass : ''}"></div>
          <div class="ed-sub"><span><span class="num ed-count">0</span> 字</span><span class="ed-status">已保存</span></div>
        </div>
        ${isNote && noteHooks.badge ? '<button class="tag-btn" data-act="badge"></button>' : ''}
        <button class="icon-btn" data-act="type" aria-label="文字设置">${icons.type}</button>
        <button class="icon-btn" data-act="more" aria-label="更多">${icons.more}</button>
      </header>
      <textarea class="ed-text" spellcheck="false" autocapitalize="off" autocomplete="off" placeholder="${isNote ? noteHooks.placeholder : '开始写作…'}"></textarea>
    </section>`);
  const ta = $('.ed-text', scr), titleEl = $('.ed-title', scr), countEl = $('.ed-count', scr), statusEl = $('.ed-status', scr);
  ta.value = text;

  const refreshTitle = () => {
    titleEl.textContent = isNote ? noteHooks.title(item) : (item.title || '未命名章节');
    const tb = $('[data-act=badge]', scr);
    if (tb) tb.textContent = noteHooks.badge(item);
  };
  refreshTitle();

  // ---------- 外观 ----------
  const applyPrefs = () => {
    ta.style.fontSize = prefs.fontSize + 'px';
    ta.style.lineHeight = prefs.lineHeight;
    ta.classList.toggle('serif', !!prefs.serif);
    const c = textColor(prefs.color);
    if (c) ta.style.setProperty('--ed-color', c); else ta.style.removeProperty('--ed-color');
  };
  applyPrefs();
  window.addEventListener('themechange', applyPrefs);

  // ---------- 字数与保存 ----------
  const countOf = v => wordCount(isNote ? noteHooks.countText(v) : v);
  const showCount = () => { countEl.textContent = fmtNum(countOf(ta.value)); };
  const showCountSoon = debounce(showCount, 120);
  showCount();

  let dirty = false;
  const save = async () => {
    if (!dirty) return;
    dirty = false;
    const v = ta.value;
    item.words = countOf(v);
    item.updatedAt = Date.now();
    if (isNote) { noteHooks.onSave(item, v); refreshTitle(); }
    persist(isNote ? 'notes' : 'chapters');
    await setText(id, v);
    if (!dirty) { statusEl.textContent = '已保存'; statusEl.classList.remove('dirty'); }
  };
  const saveSoon = debounce(save, 700);
  const offFlush = onFlush(() => { saveSoon.flush(); });
  const markDirty = () => {
    dirty = true;
    statusEl.textContent = '编辑中';
    statusEl.classList.add('dirty');
    showCountSoon();
    saveSoon();
  };

  // ---------- 换行自动缩进 ----------
  // 不依赖按键事件（安卓输入法的回车经常拿不到 keyCode），而是看“这次输入是否刚好多了一个换行”
  let prevLen = ta.value.length, composing = false;
  ta.addEventListener('compositionstart', () => { composing = true; });
  ta.addEventListener('compositionend', () => { composing = false; prevLen = ta.value.length; });
  ta.addEventListener('input', () => {
    const v = ta.value, pos = ta.selectionStart;
    if (prefs.autoIndent && !composing && pos === ta.selectionEnd && v.length === prevLen + 1 && v[pos - 1] === '\n') {
      ta.setRangeText(INDENT, pos, pos, 'end');
    }
    prevLen = ta.value.length;
    markDirty();
  });

  ta.addEventListener('scroll', () => scr.classList.toggle('scrolled', ta.scrollTop > 4), { passive: true });

  // 编辑页开着时，随记模块可以通过它直接改输入框里的内容（比如改编号/标签后的第一行）
  const editText = fix => {
    const v = ta.value, nv = fix(v);
    if (nv === v) return;
    const delta = nv.length - v.length, s = ta.selectionStart, e = ta.selectionEnd;
    ta.value = nv;
    ta.setSelectionRange(Math.max(0, s + delta), Math.max(0, e + delta));
    prevLen = ta.value.length;
    markDirty();
  };

  // ---------- 进出场动画 ----------
  const root = document.getElementById('root');
  const dim = h('<div class="dim"></div>');
  document.getElementById('app').append(dim, scr);
  await Promise.all([
    anim(scr, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: 420, easing: EASE }),
    anim(root, [{ transform: 'translateX(0)' }, { transform: 'translateX(-24%)' }], { duration: 420, easing: EASE, fill: 'forwards' }),
    anim(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: EASE, fill: 'forwards' }),
  ]);
  opening = false;
  if (isNote ? noteHooks.autoFocus(item) : item.words === 0) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  let closed = false;
  const unBack = pushBack(() => close());
  async function close({ removed = false } = {}) {
    if (closed) return;
    closed = true;
    unBack();
    ta.blur();
    if (!removed) saveSoon.flush();
    offFlush();
    window.removeEventListener('themechange', applyPrefs);
    onClose && onClose();
    await Promise.all([
      anim(scr, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 320, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }),
      anim(root, [{ transform: 'translateX(-24%)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'cubic-bezier(.4, 0, .2, 1)' }),
      anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' }),
    ]);
    root.getAnimations().forEach(a => a.cancel());
    scr.remove(); dim.remove();
  }

  // ---------- 按钮 ----------
  scr.addEventListener('click', async e => {
    const act = e.target.closest('[data-act]');
    if (!act) {
      if (!isNote && e.target === titleEl) editInfo(id, refreshTitle);
      return;
    }
    const a = act.dataset.act;
    if (a === 'back') close();
    if (a === 'type') typographySheet(prefs, applyPrefs);
    if (a === 'badge') noteHooks.onBadge(id, { editText, after: refreshTitle });
    if (a === 'more') {
      if (isNote) {
        if (await noteHooks.menu(item, { editText, after: refreshTitle })) close({ removed: true });
      } else {
        const v = await actionSheet(item.title || '未命名章节', [
          { label: '编辑章节名和备注', icon: 'edit', value: 'edit' },
          { label: '删除章节', icon: 'trash', value: 'del', danger: true },
        ]);
        if (v === 'edit') editInfo(id, refreshTitle);
        if (v === 'del' && await removeChapter(id, { skipAnim: true })) close({ removed: true });
      }
    }
  });
}

// ---------- 文字设置面板 ----------
function typographySheet(prefs, apply) {
  const change = () => { persist('settings'); apply(); };
  const body = h(`
    <div>
      <div class="section-label">字号</div>
      <div class="slider-row"><span class="mini">A</span><input type="range" min="14" max="28" step="1"><span class="big">A</span><span class="num"></span></div>
      <div class="section-label">行距</div><div class="lh"></div>
      <div class="section-label">字体</div><div class="ff"></div>
      <div class="section-label">文字颜色</div><div class="tc"></div>
      <div class="row" style="margin-top:12px">
        <div class="row-label">换行自动缩进<small>回车后自动在行首加两个全角空格</small></div>
        <span class="ai"></span>
      </div>
    </div>`);
  const range = $('input[type=range]', body), num = $('.slider-row .num', body);
  const syncRange = () => {
    range.value = prefs.fontSize;
    num.textContent = prefs.fontSize;
    range.style.setProperty('--p', ((prefs.fontSize - 14) / 14 * 100) + '%');
  };
  syncRange();
  range.addEventListener('input', () => { prefs.fontSize = +range.value; syncRange(); change(); });

  $('.lh', body).appendChild(segmented(
    [{ label: '紧凑', value: 1.6 }, { label: '适中', value: 1.9 }, { label: '宽松', value: 2.2 }],
    prefs.lineHeight, v => { prefs.lineHeight = v; change(); }));
  $('.ff', body).appendChild(segmented(
    [{ label: '黑体', value: false }, { label: '宋体', value: true }],
    !!prefs.serif, v => { prefs.serif = v; change(); }));

  const colors = TEXT_COLORS.map(c => ({ name: c.name, hex: c.light ? textColorHex(c) : null, id: c.id }));
  const cur = colors.find(c => c.id === prefs.color) || colors[0];
  // allowNone 的第一格（“无色”）在这里表示默认颜色
  const sw = swatches(colors.filter(c => c.hex), cur.hex, (hex, c) => { prefs.color = c.id || 'default'; change(); }, { allowNone: true, noneLabel: 'A' });
  sw.firstElementChild.title = '默认';
  $('.tc', body).appendChild(sw);
  $('.tc', body).appendChild(h('<div class="swatch-label">第一格是默认颜色；各颜色在深色模式下会自动调亮</div>'));

  $('.ai', body).appendChild(toggle(!!prefs.autoIndent, v => { prefs.autoIndent = v; change(); }));
  openSheet({ title: '文字设置', body });
}

function textColorHex(c) {
  return document.documentElement.dataset.theme === 'dark' ? c.dark : c.light;
}
