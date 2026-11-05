import { state, persist, getText, setText, onFlush, TEXT_COLORS } from './store.js';
import { h, esc, $, wordCount, fmtNum, debounce } from './util.js';
import { icons } from './icons.js';
import { anim, EASE, pushBack, openSheet, actionSheet, segmented, toggle, swatches } from './ui.js';
import { textColor } from './theme.js';
import { editInfo, removeChapter } from './views/novel.js';
import { editorHooks as noteHooks } from './views/notes.js';
import { createRich } from './rich.js';

const INDENT = '　　';
let opening = false;

// 纯文本输入框（小说章节用）。和富文本编辑区（rich.js，随记用）对外接口一样
const OPS = ['insertFromPaste', 'insertFromDrop', 'deleteByCut'];

function createPlain({ text, placeholder, prefs, onChange, beforeOp = () => {} }) {
  const el = h('<textarea class="ed-text" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>');
  el.placeholder = placeholder;
  el.value = text;

  // 换行自动缩进：不依赖按键事件（安卓输入法的回车经常拿不到 keyCode），而是看“这次输入是否刚好多了一个换行”
  let prevLen = el.value.length, composing = false;
  el.addEventListener('compositionstart', () => { composing = true; });
  el.addEventListener('compositionend', () => { composing = false; prevLen = el.value.length; });
  // 粘贴、剪切这类整段操作，撤回时单独算一步
  el.addEventListener('beforeinput', e => { if (OPS.includes(e.inputType)) beforeOp(); });
  el.addEventListener('input', e => {
    const v = el.value, pos = el.selectionStart;
    if (prefs.autoIndent && !composing && pos === el.selectionEnd && v.length === prevLen + 1 && v[pos - 1] === '\n') {
      el.setRangeText(INDENT, pos, pos, 'end');
    }
    prevLen = el.value.length;
    onChange(OPS.includes(e.inputType));
  });

  return {
    el,
    scroller: el,
    getValue: () => el.value,
    getState: () => ({ value: el.value, sel: [el.selectionStart, el.selectionEnd] }),
    setState(st) {
      el.value = st.value;
      prevLen = el.value.length;
      if (st.sel) el.setSelectionRange(...st.sel);
    },
    editText(fix) {
      const v = el.value, nv = fix(v);
      if (nv === v) return;
      const delta = nv.length - v.length, s = el.selectionStart, e = el.selectionEnd;
      el.value = nv;
      el.setSelectionRange(Math.max(0, s + delta), Math.max(0, e + delta));
      prevLen = el.value.length;
      onChange();
    },
    focusEnd() { el.focus(); el.setSelectionRange(el.value.length, el.value.length); },
    blur() { el.blur(); },
    dispose() {},
  };
}

// 撤回 / 重做：最多 20 步。连续打字停顿一下算一步；粘贴、插图这类整段操作单独算一步
function createHistory({ get, set, onState, max = 20 }) {
  let stack = [get()], i = 0, pending = false, timer = null;
  function commit() {
    clearTimeout(timer); timer = null;
    if (!pending) return;
    pending = false;
    const st = get();
    if (st.value === stack[i].value) { stack[i] = st; onState(); return; }
    stack = stack.slice(0, i + 1);
    stack.push(st);
    if (stack.length > max + 1) stack.shift();
    i = stack.length - 1;
    onState();
  }
  return {
    touch() { pending = true; clearTimeout(timer); timer = setTimeout(commit, 800); onState(); },
    commit,
    undo() { commit(); if (i === 0) return; i--; set(stack[i]); onState(); },
    redo() { commit(); if (i >= stack.length - 1) return; i++; set(stack[i]); onState(); },
    // 改编号/标签会改第一行：把每一步记录里的第一行一起改掉，撤回时就不会把标签改回去
    rewrite(fix) { stack = stack.map(st => ({ ...st, value: fix(st.value) })); pending = false; clearTimeout(timer); onState(); },
    canUndo: () => pending || i > 0,
    canRedo: () => !pending && i < stack.length - 1,
  };
}

export async function openEditor({ kind, id, onClose }) {
  if (opening) return;
  const isNote = kind === 'note';
  const item = (isNote ? state.notes : state.chapters).find(x => x.id === id);
  if (!item) return;
  opening = true;

  const prefs = state.settings.editor;
  const rich = isNote && !!noteHooks.rich;
  let text = await getText(id);
  if (!text && !isNote && prefs.autoIndent) text = INDENT;

  const scr = h(`
    <section class="screen editor">
      <header class="ed-head">
      <div class="ed-bar">
        <button class="icon-btn" data-act="back" aria-label="返回">${icons.back}</button>
        <div class="ed-titles">
          <div class="ed-title${isNote && noteHooks.titleClass ? ' ' + noteHooks.titleClass : ''}"></div>
          <div class="ed-sub"><span><span class="num ed-count">0</span> 字</span><span class="ed-status">已保存</span></div>
        </div>
        ${isNote && noteHooks.badge ? '<button class="tag-btn" data-act="badge"></button>' : ''}
        <button class="icon-btn" data-act="type" aria-label="文字设置">${icons.type}</button>
        <button class="icon-btn" data-act="more" aria-label="更多">${icons.more}</button>
      </div>
      <div class="ed-tools">
        <button class="tool-btn" data-act="undo" aria-label="撤回" disabled>${icons.undo}</button>
        <button class="tool-btn" data-act="redo" aria-label="重做" disabled>${icons.redo}</button>
        <span class="grow"></span>
        ${rich ? `<button class="tool-btn" data-act="image" aria-label="插入图片">${icons.image}<span>插图</span></button>` : ''}
      </div>
      </header>
    </section>`);
  const titleEl = $('.ed-title', scr), countEl = $('.ed-count', scr), statusEl = $('.ed-status', scr);

  const surf = (rich ? createRich : createPlain)({
    text, prefs, indent: INDENT,
    placeholder: isNote ? noteHooks.placeholder : '开始写作…',
    onChange: op => { markDirty(); hist.touch(); if (op) hist.commit(); },
    beforeOp: () => hist.commit(),
  });
  scr.appendChild(surf.el);

  const undoBtn = $('[data-act=undo]', scr), redoBtn = $('[data-act=redo]', scr);
  const hist = createHistory({
    get: () => surf.getState(),
    set: st => { surf.setState(st); markDirty(); },
    onState: () => { undoBtn.disabled = !hist.canUndo(); redoBtn.disabled = !hist.canRedo(); },
  });
  // 电脑上的 Ctrl+Z 之类也走自己的撤回记录
  surf.el.addEventListener('beforeinput', e => {
    if (e.inputType === 'historyUndo') { e.preventDefault(); hist.undo(); }
    if (e.inputType === 'historyRedo') { e.preventDefault(); hist.redo(); }
  });
  // 点工具栏不让编辑区失去焦点，键盘不会收起
  $('.ed-tools', scr).addEventListener('mousedown', e => e.preventDefault());

  const refreshTitle = () => {
    titleEl.textContent = isNote ? noteHooks.title(item) : (item.title || '未命名章节');
    const tb = $('[data-act=badge]', scr);
    if (tb) tb.textContent = noteHooks.badge(item);
  };
  refreshTitle();

  // ---------- 外观 ----------
  const applyPrefs = () => {
    const el = surf.el;
    el.style.fontSize = prefs.fontSize + 'px';
    el.style.lineHeight = prefs.lineHeight;
    el.classList.toggle('serif', !!prefs.serif);
    const c = textColor(prefs.color);
    if (c) el.style.setProperty('--ed-color', c); else el.style.removeProperty('--ed-color');
  };
  applyPrefs();
  window.addEventListener('themechange', applyPrefs);

  // ---------- 字数与保存 ----------
  const countOf = v => wordCount(isNote ? noteHooks.countText(v) : v);
  const showCount = () => { countEl.textContent = fmtNum(countOf(surf.getValue())); };
  const showCountSoon = debounce(showCount, 120);
  showCount();

  let dirty = false;
  const save = async () => {
    if (!dirty) return;
    dirty = false;
    const v = surf.getValue();
    item.words = countOf(v);
    item.updatedAt = Date.now();
    if (isNote) { noteHooks.onSave(item, v); refreshTitle(); }
    persist(isNote ? 'notes' : 'chapters');
    await setText(id, v);
    if (!dirty) { statusEl.textContent = '已保存'; statusEl.classList.remove('dirty'); }
  };
  const saveSoon = debounce(save, 700);
  const offFlush = onFlush(() => { saveSoon.flush(); });
  function markDirty() {
    dirty = true;
    statusEl.textContent = '编辑中';
    statusEl.classList.add('dirty');
    showCountSoon();
    saveSoon();
  }

  surf.scroller.addEventListener('scroll', () => scr.classList.toggle('scrolled', surf.scroller.scrollTop > 4), { passive: true });

  // 编辑页开着时，随记模块可以通过它直接改编辑区里的内容（比如改编号/标签后的第一行）
  const editText = fix => { hist.commit(); surf.editText(fix); hist.rewrite(fix); };

  // ---------- 进出场动画 ----------
  // 列表退到左边 24%：终点直接写在 style 上，动画只负责过渡（以前靠 fill: forwards，
  // 关闭时一旦没取消掉，整页就一直偏着）
  const root = document.getElementById('root');
  const dim = h('<div class="dim"></div>');
  document.getElementById('app').append(dim, scr);
  root.style.transform = 'translateX(-24%)';
  await Promise.all([
    anim(scr, [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], { duration: 420, easing: EASE }),
    anim(root, [{ transform: 'translateX(0)' }, { transform: 'translateX(-24%)' }], { duration: 420, easing: EASE }),
    anim(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: EASE, fill: 'forwards' }),
  ]);
  opening = false;
  if (isNote ? noteHooks.autoFocus(item) : item.words === 0) surf.focusEnd();

  let closed = false;
  const unBack = pushBack(() => close());
  async function close({ removed = false } = {}) {
    if (closed) return;
    closed = true;
    unBack();
    surf.blur();
    if (!removed) saveSoon.flush();
    offFlush();
    surf.dispose({ removed });
    window.removeEventListener('themechange', applyPrefs);
    root.style.transform = '';
    onClose && onClose();
    await Promise.all([
      anim(scr, [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], { duration: 320, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }),
      anim(root, [{ transform: 'translateX(-24%)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'cubic-bezier(.4, 0, .2, 1)' }),
      anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, fill: 'forwards' }),
    ]);
    scr.remove(); dim.remove();
    settleRoot();
  }

  // ---------- 按钮 ----------
  scr.querySelector('.ed-head').addEventListener('click', async e => {
    const act = e.target.closest('[data-act]');
    if (!act) {
      if (e.target === titleEl) {
        if (!isNote) editInfo(id, refreshTitle);
        else if (noteHooks.onTitle) noteHooks.onTitle(id, { editText, after: refreshTitle });
      }
      return;
    }
    const a = act.dataset.act;
    if (a === 'back') close();
    if (a === 'type') typographySheet(prefs, applyPrefs);
    if (a === 'image') surf.insertImage();
    if (a === 'undo') hist.undo();
    if (a === 'redo') hist.redo();
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

// 没有编辑页开着时，把主界面摆回原位：清掉残留的位移、动画和滚动。
// 关编辑页、切换标签页、从后台回来时都会调一次，万一哪里出了岔子也能自己恢复
export function settleRoot() {
  if (document.querySelector('.screen.editor')) return;
  const root = document.getElementById('root');
  root.getAnimations().forEach(a => a.cancel());
  root.style.transform = '';
  for (const el of [document.getElementById('app'), root]) { el.scrollLeft = 0; el.scrollTop = 0; }
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
