// 可以插图的编辑区（技术验证：先用在随记上，以后推广到小说、世界）
// 正文仍然按纯文本保存：一段一行；图片单独占一行，写成 [[img:编号|宽度百分比|高宽比]]，
// 图片本身（压缩后的 dataURL）存在数据库的 img:编号 里。
import { kv } from './db.js';
import { persist } from './store.js';
import { h, $, uid } from './util.js';
import { icons } from './icons.js';
import { anim, EASE, pushBack, toast, confirmDialog } from './ui.js';
import { pickImage } from './native.js';

const IMG_LINE = /^\[\[img:([a-z0-9]+)\|(\d{1,3})\|(\d+(?:\.\d+)?)\]\]$/;
const MIN_W = 30, MAX_W = 100;

export const imageLine = (id, w, ratio) => `[[img:${id}|${w}|${(+ratio).toFixed(4)}]]`;
export const imageIds = text => (text || '').split('\n').map(l => IMG_LINE.exec(l)).filter(Boolean).map(m => m[1]);
export const stripImages = text => text.split('\n').filter(l => !IMG_LINE.test(l)).join('\n');
export const imagesAsMarks = text => text.split('\n').map(l => IMG_LINE.test(l) ? '［图片］' : l).join('\n');
export const deleteImages = ids => Promise.all(ids.map(id => kv.del('img:' + id)));

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isBlank = s => !s.replace(/[\s　]/g, '');

// onChange(op)：内容变了，op 为 true 表示是一次完整操作（粘贴、插图、拖动…），撤回时单独算一步；
// beforeOp()：完整操作开始前调用，让撤回记录先把之前的输入存成一步
export function createRich({ text, prefs, indent, onChange, beforeOp = () => {} }) {
  const el = h('<div class="ed-text rt" contenteditable="true" spellcheck="false" autocapitalize="off" autocorrect="off"></div>');
  const known = new Set(imageIds(text)); // 这次打开涉及的所有图片，关闭时清理没再用到的
  let lastRange = null;                   // 记住最后的光标位置：点“插入图片”时编辑区已经失去焦点
  let menuOpen = null, drag = null;
  const cache = new Map();                // 图片编号 → dataURL，撤回重画时不用再读数据库

  const changed = (op = false) => onChange(op);

  // ---------- 文本 ⇄ 段落 ----------
  function para(t) {
    const p = document.createElement('p');
    if (t) p.textContent = t; else p.appendChild(document.createElement('br'));
    return p;
  }
  function figure(id, w, ratio, src) {
    const f = h(`<figure class="rt-img" contenteditable="false"><img alt="" draggable="false"></figure>`);
    setFigure(f, id, w, ratio, src);
    return f;
  }
  function setFigure(f, id, w, ratio, src) {
    f.dataset.id = id; f.dataset.w = w; f.dataset.r = ratio;
    f.style.width = w + '%';
    const img = f.firstElementChild;
    img.style.aspectRatio = `1 / ${ratio}`;
    if (src) { cache.set(id, src); img.src = src; }
    else if (cache.has(id)) img.src = cache.get(id);
    else kv.get('img:' + id).then(s => { if (s) { cache.set(id, s); img.src = s; } else f.classList.add('missing'); });
  }
  function render(t) {
    el.textContent = '';
    for (const line of t.split('\n')) {
      const m = IMG_LINE.exec(line);
      el.appendChild(m ? figure(m[1], +m[2], +m[3]) : para(line));
    }
    ensureTail();
  }
  // 最后一块是图片时补一个空段落，不然图片后面没法打字
  function ensureTail() {
    if (!el.lastElementChild || el.lastElementChild.nodeName === 'FIGURE') el.appendChild(para(''));
  }
  function blockText(node) {
    let s = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += c.data;
      else if (c.nodeName === 'BR') s += c === node.lastChild ? '' : '\n';
      else s += blockText(c);
    }
    return s.replace(/ /g, ' ');
  }
  function getValue() {
    const lines = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { if (n.data) lines.push(n.data.replace(/ /g, ' ')); continue; }
      if (n.nodeType !== 1) continue;
      if (n.nodeName === 'FIGURE') lines.push(imageLine(n.dataset.id, n.dataset.w, n.dataset.r));
      else lines.push(blockText(n));
    }
    return lines.join('\n');
  }

  // 浏览器偶尔会直接在编辑区里放文字或 div：统一整理成 <p>，保持“一块 = 一行”
  function normalize() {
    const sel = getSelection();
    const a = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset] : null;
    let moved = false;
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === 3 || (n.nodeType === 1 && !['P', 'FIGURE'].includes(n.nodeName))) {
        if (n.nodeName === 'BR') { n.replaceWith(para('')); moved = true; continue; }
        const p = document.createElement('p');
        el.insertBefore(p, n);
        if (n.nodeType === 1 && n.nodeName === 'DIV') { while (n.firstChild) p.appendChild(n.firstChild); n.remove(); }
        else p.appendChild(n);
        moved = true;
      }
    }
    ensureTail();
    if (moved && a && a[0] && el.contains(a[0])) { try { sel.collapse(a[0], Math.min(a[1], a[0].length ?? a[0].childNodes.length)); } catch (e) { /* 忽略 */ } }
  }

  // ---------- 光标 ----------
  const blockOf = node => {
    while (node && node.parentNode !== el) node = node.parentNode;
    return node && node.nodeType === 1 ? node : null;
  };
  function caretTo(node, offset) {
    const sel = getSelection();
    sel.removeAllRanges();
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    sel.addRange(r);
    lastRange = r.cloneRange();
  }
  function caretToEnd(p) {
    const last = p.lastChild;
    if (last && last.nodeType === 3) caretTo(last, last.length);
    else caretTo(p, last && last.nodeName === 'BR' ? p.childNodes.length - 1 : p.childNodes.length);
  }
  // 程序改了光标后，浏览器不会自动滚动，手动把光标滚进可见区域
  function revealNode(node, pad = 60) {
    const r = (node.nodeType === 1 ? node : node.parentNode).getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (r.bottom > box.bottom - pad) el.scrollTop += r.bottom - box.bottom + pad;
    else if (r.top < box.top + pad) el.scrollTop -= box.top + pad - r.top;
  }
  const onSel = () => {
    const s = getSelection();
    if (s.rangeCount && el.contains(s.anchorNode)) lastRange = s.getRangeAt(0).cloneRange();
  };
  document.addEventListener('selectionchange', onSel);

  // ---------- 回车：拆段并自动缩进 ----------
  function splitParagraph() {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) r.deleteContents();
    const p = blockOf(r.startContainer);
    if (!p || p.nodeName === 'FIGURE') return;
    const tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEnd(p, p.childNodes.length);
    const np = document.createElement('p');
    np.appendChild(tail.extractContents());
    if (!blockText(p)) p.innerHTML = '<br>';
    const ind = prefs.autoIndent ? indent : '';
    if (!blockText(np)) np.textContent = '';
    if (ind) np.insertBefore(document.createTextNode(ind), np.firstChild);
    if (!np.firstChild) np.appendChild(document.createElement('br'));
    p.after(np);
    caretTo(np.firstChild.nodeType === 3 ? np.firstChild : np, ind.length);
    revealNode(np);
    changed();
  }

  // ---------- 粘贴：只要纯文本，多行拆成多段 ----------
  function insertPlain(t) {
    const lines = t.replace(/\r\n?/g, '\n').split('\n');
    beforeOp();
    if (lines.length === 1) { document.execCommand('insertText', false, t); changed(true); return; }
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();
    let p = blockOf(r.startContainer);
    if (!p || p.nodeName === 'FIGURE') { p = para(''); el.appendChild(p); r.setStart(p, 0); }
    const tail = document.createRange();
    tail.setStart(r.startContainer, r.startOffset);
    tail.setEnd(p, p.childNodes.length);
    const rest = tail.extractContents();
    if (p.lastChild && p.lastChild.nodeName === 'BR') p.lastChild.remove();
    p.appendChild(document.createTextNode(lines[0]));
    let cur = p;
    for (let i = 1; i < lines.length; i++) {
      const np = document.createElement('p');
      np.appendChild(document.createTextNode(lines[i]));
      cur.after(np);
      cur = np;
    }
    const caretNode = cur.lastChild;
    cur.appendChild(rest);
    for (const b of [p, cur]) if (!blockText(b)) b.innerHTML = '<br>';
    caretTo(caretNode.parentNode ? caretNode : cur, caretNode.parentNode ? caretNode.length : 0);
    revealNode(cur);
    changed(true);
  }

  // ---------- 删除：不让退格把图片和文字“粘”在一起 ----------
  function flash(f) {
    f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash');
  }
  function guardDelete(backward) {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) return false;
    const r = sel.getRangeAt(0);
    const p = blockOf(r.startContainer);
    if (!p || p.nodeName === 'FIGURE') return false;
    const pre = document.createRange();
    pre.setStart(p, 0); pre.setEnd(r.startContainer, r.startOffset);
    const before = pre.toString(), all = blockText(p);
    if (backward && before === '') {
      const prev = p.previousElementSibling;
      if (prev && prev.nodeName === 'FIGURE') {
        if (!all) { // 图片后面的空行：只删掉这一行
          const next = p.nextElementSibling;
          p.remove(); ensureTail();
          const target = next && next.nodeName === 'P' ? next : el.lastElementChild;
          caretTo(target, 0);
          changed();
        } else flash(prev);
        return true;
      }
    }
    if (!backward && before.length >= all.length) {
      const next = p.nextElementSibling;
      if (next && next.nodeName === 'FIGURE') { flash(next); return true; }
    }
    return false;
  }

  el.addEventListener('beforeinput', e => {
    const t = e.inputType;
    if (t === 'insertParagraph' || t === 'insertLineBreak' || (t === 'insertText' && e.data === '\n')) {
      if (e.cancelable) { e.preventDefault(); splitParagraph(); }
    } else if ((t === 'insertText' || t === 'insertReplacementText') && e.data && e.data.includes('\n')) {
      if (e.cancelable) { e.preventDefault(); insertPlain(e.data); }
    } else if (t === 'deleteContentBackward' || t === 'deleteContentForward') {
      if (e.cancelable && guardDelete(t === 'deleteContentBackward')) e.preventDefault();
    }
  });
  el.addEventListener('input', e => {
    if (!e.isComposing) normalize();
    // 个别输入法的回车拦不住，浏览器自己拆了段：这时再补上缩进
    if (e.inputType === 'insertParagraph' && prefs.autoIndent) document.execCommand('insertText', false, indent);
    changed();
  });
  el.addEventListener('paste', e => {
    e.preventDefault();
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t) insertPlain(t);
  });
  el.addEventListener('drop', e => e.preventDefault());

  // ---------- 图片进出场：先撑开空位再淡入；先淡出再合拢 ----------
  function smoothReveal(node, pad = 24) {
    const r = node.getBoundingClientRect(), box = el.getBoundingClientRect();
    let dy = 0;
    if (r.bottom > box.bottom - pad) dy = r.bottom - box.bottom + pad;
    else if (r.top < box.top + pad) dy = r.top - box.top - pad;
    if (dy) el.scrollTo({ top: el.scrollTop + dy, behavior: 'smooth' });
  }
  async function expandIn(f, fromH = 0) {
    const img = f.firstElementChild, cs = getComputedStyle(f);
    const hgt = f.offsetHeight, mt = cs.marginTop, mb = cs.marginBottom;
    f.style.overflow = 'hidden';
    img.style.opacity = '0';
    const open = anim(f, [
      { height: fromH + 'px', marginTop: '0px', marginBottom: '0px' },
      { height: hgt + 'px', marginTop: mt, marginBottom: mb },
    ], { duration: 320, easing: EASE });
    requestAnimationFrame(() => smoothReveal(f));
    await open;
    f.style.overflow = '';
    img.style.opacity = '';
    await anim(img, [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
  }
  async function collapseOut(f) {
    const img = f.firstElementChild;
    await anim(img, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 200, easing: 'ease', fill: 'forwards' });
    const cs = getComputedStyle(f);
    f.style.overflow = 'hidden';
    await anim(f, [
      { height: f.offsetHeight + 'px', marginTop: cs.marginTop, marginBottom: cs.marginBottom },
      { height: '0px', marginTop: '0px', marginBottom: '0px' },
    ], { duration: 300, easing: EASE, fill: 'forwards' });
    f.remove();
  }

  // ---------- 插入图片：一律放在光标所在那一行后面，空行也保留（删掉或拖走图片后空行还在） ----------
  async function insertImage() {
    const ref = lastRange && el.contains(lastRange.startContainer) ? blockOf(lastRange.startContainer) : null;
    let pic;
    try { pic = await pickImage(); } catch (e) { toast('没能打开相册：' + (e && e.message || e)); return; }
    if (!pic) return;
    const id = uid().replace(/[^a-z0-9]/g, '');
    await kv.set('img:' + id, pic.dataUrl);
    known.add(id);
    const f = figure(id, clamp(+prefs.imageWidth || MAX_W, MIN_W, MAX_W), pic.ratio, pic.dataUrl);
    beforeOp();
    if (ref) ref.after(f);
    else {
      // 没点过正文：放在最后一段有字的内容后面，末尾的空行留着
      let last = el.lastElementChild;
      while (last && last !== el.firstElementChild && last.nodeName === 'P' && isBlank(blockText(last))) last = last.previousElementSibling;
      (last || el.firstElementChild).after(f);
    }
    ensureTail();
    changed(true);
    expandIn(f);
  }

  async function replaceImage(f) {
    let pic;
    try { pic = await pickImage(); } catch (e) { toast('没能打开相册：' + (e && e.message || e)); return; }
    if (!pic) return;
    const id = uid().replace(/[^a-z0-9]/g, '');
    await kv.set('img:' + id, pic.dataUrl);
    known.add(id);
    beforeOp();
    setFigure(f, id, f.dataset.w, pic.ratio, pic.dataUrl);
    changed(true);
    anim(f, [{ opacity: .3 }, { opacity: 1 }], { duration: 300 });
  }

  // ---------- 点图片：周围变暗 + 小窗口 ----------
  function openMenu(f, tapY) {
    el.blur();
    const img = f.firstElementChild;
    const layer = h(`
      <div class="img-layer">
        <div class="img-dim"></div>
        <img class="img-lift" alt="">
        <div class="img-menu">
          <button class="img-act" data-a="replace">${icons.image}<span>更换图片</span></button>
          <div class="img-act img-size" data-a="size">${icons.resize}<span>调节大小</span></div>
          <button class="img-act danger" data-a="del">${icons.trash}<span>删除图片</span></button>
        </div>
        <div class="img-pct"></div>
      </div>`);
    const dim = $('.img-dim', layer), lift = $('.img-lift', layer), menu = $('.img-menu', layer);
    const size = $('.img-size', layer), pct = $('.img-pct', layer);
    lift.src = img.src;
    document.body.appendChild(layer);

    const placeLift = () => {
      const r = img.getBoundingClientRect();
      Object.assign(lift.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      return r;
    };
    const showSize = () => { pct.textContent = f.dataset.w + '%'; };
    // 小窗口放在图片下面，放不下就放上面；上下都放不下（图片很高）时，出现在点击的位置、屏幕水平居中
    const r0 = placeLift();
    showSize();
    const mh = menu.offsetHeight, mw = menu.offsetWidth, vh = innerHeight, gap = 12, edge = 16;
    let top = r0.bottom + gap, left = clamp(r0.left + r0.width / 2 - mw / 2, edge, innerWidth - mw - edge);
    if (top + mh > vh - edge) top = r0.top - gap - mh;
    if (top < edge) {
      top = clamp((tapY == null ? vh / 2 : tapY) - mh / 2, edge, vh - mh - edge);
      left = (innerWidth - mw) / 2;
    }
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    anim(dim, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
    anim(menu, [{ opacity: 0, transform: 'scale(.92)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.3, 1.3, .5, 1)' });

    let closed = false, armed = false;
    layer.addEventListener('pointerdown', () => { armed = true; }, true);
    const onTap = fn => e => { if (armed) fn(e); };
    const unBack = pushBack(() => close());
    function close() {
      if (closed) return;
      closed = true; unBack(); menuOpen = null;
      anim(dim, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
      anim(lift, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
      anim(menu, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.95)' }], { duration: 160, fill: 'forwards' }).then(() => layer.remove());
    }
    menuOpen = { close };
    dim.addEventListener('click', onTap(close));
    $('[data-a=replace]', layer).addEventListener('click', onTap(() => { close(); replaceImage(f); }));
    $('[data-a=del]', layer).addEventListener('click', onTap(async () => {
      close();
      if (!await confirmDialog({ title: '删除这张图片？', ok: '删除', danger: true })) return;
      beforeOp();
      await collapseOut(f);
      ensureTail(); changed(true);
    }));

    // 调节大小：选项本身就是调节条，按住左右拖；只点不拖给提示
    let sx = null, sw = 0, moved = false;
    size.addEventListener('pointerdown', e => {
      sx = e.clientX; sw = +f.dataset.w; moved = false;
      size.setPointerCapture(e.pointerId);
      size.classList.add('active');
    });
    size.addEventListener('pointermove', e => {
      if (sx == null) return;
      const dx = e.clientX - sx;
      if (!moved && Math.abs(dx) < 6) return;
      if (!moved) { beforeOp(); layer.classList.add('peek'); f.classList.add('sizing'); }
      moved = true;
      const w = Math.round(clamp(sw + dx / size.offsetWidth * (MAX_W - MIN_W), MIN_W, MAX_W));
      if (w === +f.dataset.w) return;
      f.dataset.w = w; f.style.width = w + '%';
      showSize(); placeLift();
    });
    const end = () => {
      if (sx == null) return;
      sx = null; size.classList.remove('active');
      if (moved) {
        // 等宽度过渡走完再对齐浮起的那张图
        setTimeout(() => { f.classList.remove('sizing'); placeLift(); layer.classList.remove('peek'); }, 240);
        changed(true);
        prefs.imageWidth = +f.dataset.w; persist('settings');
      } else toast('左右拖动调节大小');
    };
    size.addEventListener('pointerup', end);
    size.addEventListener('pointercancel', end);
  }

  // ---------- 长按拖动 ----------
  let press = null;
  el.addEventListener('pointerdown', e => {
    const f = e.target.closest('figure.rt-img');
    if (!f || !e.isPrimary || drag || menuOpen) return;
    press = { f, x: e.clientX, y: e.clientY, id: e.pointerId };
    press.timer = setTimeout(() => { const p = press; press = null; if (p) startDrag(p); }, 420);
  });
  el.addEventListener('pointermove', e => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
  });
  el.addEventListener('pointerup', e => {
    if (!press) return;
    clearTimeout(press.timer);
    const f = press.f;
    press = null;
    e.preventDefault();
    openMenu(f, e.clientY);
  });
  el.addEventListener('pointercancel', () => { if (press) { clearTimeout(press.timer); press = null; } });
  el.addEventListener('contextmenu', e => { if (e.target.closest('figure')) e.preventDefault(); });
  // 点图片不要把光标放进正文（否则会弹出键盘）
  el.addEventListener('mousedown', e => { if (e.target.closest('figure')) e.preventDefault(); });
  el.addEventListener('click', e => { if (e.target.closest('figure')) e.preventDefault(); });
  // 拖动时不让页面跟着手指滚（必须一直挂着、且不是 passive，浏览器才允许取消滚动）
  el.addEventListener('touchmove', e => { if (drag && e.cancelable) e.preventDefault(); }, { passive: false });

  function startDrag(p) {
    const f = p.f, img = f.firstElementChild;
    navigator.vibrate && navigator.vibrate(12);
    el.blur();
    el.contentEditable = 'false';
    const r = img.getBoundingClientRect();
    const SCALE = .55;
    const ghost = h('<img class="img-drag" alt="">');
    ghost.src = img.src;
    Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px' });
    const line = h('<div class="drop-line"></div>');
    const cancel = h(`<div class="drop-cancel">${icons.x}<span>拖到这里取消</span></div>`);
    document.body.append(line, cancel, ghost);
    document.body.classList.add('img-dragging');
    f.classList.add('drag-src');
    anim(cancel, [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE });

    // 手指相对图片的位置（按缩小后的尺寸换算），图片缩小后手指仍然按在同一个点上
    const gx = (p.x - r.left) / r.width, gy = (p.y - r.top) / r.height;
    const d = drag = {
      fx: p.x, fy: p.y,                           // 手指
      x: r.left, y: r.top, s: 1,                  // 图片当前左上角和缩放
      w: r.width, h: r.height, target: null, inCancel: false, raf: 0, done: false,
    };

    const onMove = e => { if (e.pointerId === p.id) { d.fx = e.clientX; d.fy = e.clientY; } };
    const onUp = e => { if (e.pointerId === p.id) finish(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const blocks = () => Array.from(el.children);
    let gapEl = null;
    function setGap(b) {
      if (gapEl === b) return;
      if (gapEl) gapEl.classList.remove('drop-gap');
      gapEl = b;
      if (gapEl) gapEl.classList.add('drop-gap');
    }
    function frame() {
      if (d.done) return;
      // 拖尾：图片追着手指走，而不是死死贴住
      d.s += (SCALE - d.s) * .25;
      const tx = d.fx - gx * d.w * d.s, ty = d.fy - gy * d.h * d.s;
      d.x += (tx - d.x) * .3; d.y += (ty - d.y) * .3;
      ghost.style.transform = `translate(${d.x}px, ${d.y}px) scale(${d.s})`;

      // 靠近编辑区上下边缘时自动翻页，中间是死区
      const box = el.getBoundingClientRect();
      const cancelTop = cancel.getBoundingClientRect().top;
      const bottom = Math.min(box.bottom, cancelTop);
      const zone = Math.max(64, (bottom - box.top) * .2);
      let v = 0;
      if (d.fy < box.top + zone) v = -Math.pow(clamp((box.top + zone - d.fy) / zone, 0, 1), 1.6) * 18;
      else if (d.fy > bottom - zone && d.fy < cancelTop) v = Math.pow(clamp((d.fy - (bottom - zone)) / zone, 0, 1), 1.6) * 18;
      if (v) el.scrollTop += v;

      // 取消区
      d.inCancel = d.fy >= cancelTop;
      cancel.classList.toggle('hot', d.inCancel);

      // 插入线吸附到离图片中心最近的段落末尾
      if (d.inCancel) d.target = null;
      else {
        const cy = d.y + d.h * d.s / 2;
        let best = null, bestDist = Infinity, curDist = Infinity;
        for (const b of blocks()) {
          if (b === f) continue;
          const dist = Math.abs(b.getBoundingClientRect().bottom - cy);
          if (dist < bestDist) { bestDist = dist; best = b; }
          if (b === d.target) curDist = dist;
        }
        // 新位置要明显更近才换，免得在两段之间来回跳
        if (!d.target || !d.target.isConnected || bestDist < curDist - 10) d.target = best;
      }
      const nextEl = d.target ? d.target.nextElementSibling : null;
      setGap(nextEl === f ? null : nextEl); // 原位置（放下也不动）就不撑开
      if (d.target) {
        const cs = getComputedStyle(el);
        const cl = box.left + parseFloat(cs.paddingLeft);
        const cw = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        const lw = cw * .86;
        const tb = d.target.getBoundingClientRect().bottom;
        const nx = d.target.nextElementSibling;
        const ly = nx ? (tb + nx.getBoundingClientRect().top) / 2 : tb + 10;
        line.style.transform = `translate(${cl + (cw - lw) / 2}px, ${clamp(ly, box.top, bottom) - .75}px)`;
        line.style.width = lw + 'px';
        line.classList.add('on');
      } else line.classList.remove('on');
      d.raf = requestAnimationFrame(frame);
    }
    d.raf = requestAnimationFrame(frame);

    async function finish() {
      if (d.done) return;
      d.done = true;
      cancelAnimationFrame(d.raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      line.remove();
      setGap(null);
      anim(cancel, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(40%)' }], { duration: 200, fill: 'forwards' }).then(() => cancel.remove());
      if (!d.inCancel && d.target && d.target !== f.previousElementSibling) {
        beforeOp();
        d.target.after(f);
        ensureTail();
        changed(true);
      }
      revealNode(f, 24);
      const to = img.getBoundingClientRect();
      const from = `translate(${d.x}px, ${d.y}px) scale(${d.s})`;
      const end = `translate(${to.left}px, ${to.top}px) scale(${to.width / d.w})`;
      await anim(ghost, [{ transform: from }, { transform: end }], { duration: 280, easing: EASE, fill: 'forwards' });
      ghost.remove();
      f.classList.remove('drag-src');
      document.body.classList.remove('img-dragging');
      el.contentEditable = 'true';
      drag = null;
    }
  }

  // ---------- 撤回用：内容 + 光标位置（第几块、块内第几个字） ----------
  function getState() {
    const sel = getSelection();
    let pos = null;
    if (sel.rangeCount && el.contains(sel.anchorNode)) {
      const r = sel.getRangeAt(0), b = blockOf(r.startContainer);
      if (b && b.nodeName !== 'FIGURE') {
        const pre = document.createRange();
        pre.setStart(b, 0); pre.setEnd(r.startContainer, r.startOffset);
        pos = { b: Array.prototype.indexOf.call(el.children, b), o: pre.toString().length };
      }
    }
    return { value: getValue(), sel: pos };
  }
  function setState(st) {
    const top = el.scrollTop;
    render(st.value);
    el.scrollTop = top;
    const b = st.sel && el.children[st.sel.b];
    if (!b || b.nodeName === 'FIGURE') return;
    const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
    let left = st.sel.o, n;
    while ((n = walker.nextNode())) {
      if (left <= n.length) { caretTo(n, left); revealNode(b); return; }
      left -= n.length;
    }
    caretToEnd(b);
    revealNode(b);
  }

  render(text);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* 旧浏览器忽略 */ }

  return {
    el,
    scroller: el,
    getValue,
    getState,
    setState,
    insertImage,
    // 编辑页开着时，随记模块改第一行（编号、标签）走这里：只替换变了的段落，不动图片和光标
    editText(fix) {
      const old = getValue(), nv = fix(old);
      if (nv === old) return;
      const a = old.split('\n'), b = nv.split('\n'), blocks = Array.from(el.children);
      if (a.length === b.length && blocks.length === a.length) {
        b.forEach((line, i) => {
          if (line === a[i] || blocks[i].nodeName === 'FIGURE') return;
          if (line) blocks[i].textContent = line; else blocks[i].innerHTML = '<br>';
        });
      } else render(nv);
      changed();
    },
    focusEnd() {
      el.focus();
      let last = el.lastElementChild;
      while (last && last.nodeName === 'FIGURE') last = last.previousElementSibling;
      if (last) { caretToEnd(last); revealNode(last); }
    },
    blur() { el.blur(); },
    // 关闭编辑页时：清掉这次换下来、删掉的图片；整篇随记被删时清掉全部
    dispose({ removed = false } = {}) {
      document.removeEventListener('selectionchange', onSel);
      if (menuOpen) menuOpen.close();
      const used = removed ? new Set() : new Set(imageIds(getValue()));
      deleteImages([...known].filter(id => !used.has(id)));
    },
  };
}
