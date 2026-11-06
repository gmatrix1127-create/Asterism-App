import { h, esc, rgb, $, $$ } from './util.js';
import { icons } from './icons.js';

export const EASE = 'cubic-bezier(.2, .8, .2, 1)';
export const SHEET_EASE = 'cubic-bezier(.32, .72, 0, 1)';
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function anim(el, frames, opts) {
  if (!el || !el.animate) return Promise.resolve();
  const o = Object.assign({ duration: 260, easing: EASE, fill: 'backwards' }, opts, reduced() ? { duration: 1, delay: 0 } : {});
  const a = el.animate(frames, o);
  // 兜底：动画时间轴不走（省电模式、页面不可见等）时，到点也照常收尾
  const timeout = new Promise(r => setTimeout(() => r(a), o.duration + (o.delay || 0) + 150));
  return Promise.race([a.finished.then(() => a, () => a), timeout]);
}

// ---------- 返回栈：安卓返回键先关最上层的弹层/页面 ----------
const backStack = [];
export const pushBack = fn => { backStack.push(fn); return () => { const i = backStack.lastIndexOf(fn); if (i >= 0) backStack.splice(i, 1); }; };
export function handleBack() {
  const fn = backStack.pop();
  if (fn) { fn(); return true; }
  return false;
}

// ---------- 底部弹层 ----------
export function openSheet({ title = '', titleExtra = '', body, onClose } = {}) {
  const layer = h(`
    <div class="layer">
      <div class="backdrop"></div>
      <div class="sheet" role="dialog">
        <div class="sheet-head"><div class="grabber"></div>${title ? `<div class="sheet-title"><span class="grow">${esc(title)}</span>${titleExtra}</div>` : ''}</div>
        <div class="sheet-body"></div>
      </div>
    </div>`);
  const sheet = $('.sheet', layer), backdrop = $('.backdrop', layer), bodyEl = $('.sheet-body', layer);
  if (body) bodyEl.appendChild(typeof body === 'string' ? h(body) : body);
  document.body.appendChild(layer);

  anim(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: 'ease' });
  anim(sheet, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 420, easing: SHEET_EASE });

  let closed = false;
  const unBack = pushBack(() => close());
  function close(result) {
    if (closed) return;
    closed = true;
    unBack();
    if (document.activeElement && layer.contains(document.activeElement)) document.activeElement.blur();
    const from = getComputedStyle(sheet).transform;
    sheet.style.transform = '';
    anim(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' });
    anim(sheet, [{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: 'translateY(100%)' }], { duration: 260, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' })
      .then(() => layer.remove());
    onClose && onClose(result);
  }
  backdrop.addEventListener('click', () => close());

  // 下拉关闭
  const head = $('.sheet-head', layer);
  let startY = null, lastY = 0, lastT = 0, vel = 0;
  head.addEventListener('pointerdown', e => {
    startY = e.clientY; lastY = e.clientY; lastT = e.timeStamp; vel = 0;
    head.setPointerCapture(e.pointerId);
    sheet.getAnimations().forEach(a => a.cancel());
  });
  head.addEventListener('pointermove', e => {
    if (startY == null) return;
    const dy = Math.max(0, e.clientY - startY);
    vel = (e.clientY - lastY) / Math.max(1, e.timeStamp - lastT);
    lastY = e.clientY; lastT = e.timeStamp;
    sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = e => {
    if (startY == null) return;
    const dy = Math.max(0, e.clientY - startY);
    startY = null;
    if (dy > sheet.offsetHeight * 0.3 || vel > 0.6) { close(); }
    else if (dy > 0) {
      sheet.style.transform = '';
      anim(sheet, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 300, easing: SHEET_EASE });
    }
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);

  return { layer, sheet, body: bodyEl, close };
}

// ---------- 动作列表 ----------
export function actionSheet(title, items) {
  return new Promise(resolve => {
    let picked = null;
    const list = h('<div class="actions"></div>');
    for (const it of items) {
      const b = h(`<button class="action${it.danger ? ' danger' : ''}" ${it.disabled ? 'disabled' : ''}>${icons[it.icon] || ''}<span>${esc(it.label)}</span>${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`);
      b.addEventListener('click', () => { picked = it.value; s.close(); });
      list.appendChild(b);
    }
    const s = openSheet({ title, body: list, onClose: () => resolve(picked) });
  });
}

// ---------- 确认框 ----------
export function confirmDialog({ title, message = '', ok = '确定', danger = false, check = null }) {
  return new Promise(resolve => {
    const layer = h(`
      <div class="layer">
        <div class="backdrop"></div>
        <div class="dialog" role="alertdialog">
          <h3>${esc(title)}</h3>
          ${message ? `<p>${esc(message)}</p>` : ''}
          ${check ? `<label class="dlg-check"><input type="checkbox"><span>${esc(check.label)}</span></label>` : ''}
          <div class="btn-row">
            <button class="btn" data-v="0">取消</button>
            <button class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(ok)}</button>
          </div>
        </div>
      </div>`);
    const dialog = $('.dialog', layer), backdrop = $('.backdrop', layer);
    document.body.appendChild(layer);
    anim(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' });
    anim(dialog, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(.92)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3, 1.3, .5, 1)' });
    let done = false;
    const unBack = pushBack(() => close(false));
    function close(v) {
      if (done) return;
      done = true; unBack();
      if (check) check.value = !!$('.dlg-check input', layer).checked;
      anim(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      anim(dialog, [{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%, -50%) scale(.95)' }], { duration: 160, fill: 'forwards' })
        .then(() => layer.remove());
      resolve(v);
    }
    backdrop.addEventListener('click', () => close(false));
    $$('[data-v]', layer).forEach(b => b.addEventListener('click', () => close(b.dataset.v === '1')));
  });
}

// ---------- 提示 ----------
let toastEl, toastTimer;
export function toast(msg) {
  if (toastEl) toastEl.remove();
  clearTimeout(toastTimer);
  toastEl = h(`<div class="toast">${esc(msg)}</div>`);
  document.body.appendChild(toastEl);
  const el = toastEl;
  anim(el, [{ opacity: 0, transform: 'translate(-50%, 12px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%, 0) scale(1)' }], { duration: 260 });
  toastTimer = setTimeout(() => {
    anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' }).then(() => el.remove());
  }, 1900);
}

// ---------- 小组件 ----------
export function swatches(colors, current, onPick, { allowNone = false, noneLabel = '' } = {}) {
  const wrap = h('<div class="swatches"></div>');
  const all = allowNone ? [{ name: '无色', hex: null }, ...colors] : colors;
  for (const c of all) {
    const mark = c.hex ? icons.check : noneLabel ? `<span class="sw-txt">${esc(noneLabel)}</span>` : icons.x;
    const b = h(`<button class="swatch${c.hex ? '' : ' none'}" style="--c:${c.hex ? rgb(c.hex) : '0,0,0'}" title="${esc(c.name)}">${mark}</button>`);
    if ((c.hex || null) === (current || null)) b.classList.add('on');
    b.addEventListener('click', () => {
      $$('.swatch', wrap).forEach(x => x.classList.toggle('on', x === b));
      onPick(c.hex, c);
    });
    wrap.appendChild(b);
  }
  return wrap;
}

export function segmented(options, value, onChange) {
  const wrap = h('<div class="seg"><div class="seg-thumb"></div></div>');
  const thumb = $('.seg-thumb', wrap);
  const btns = options.map(o => {
    const b = h(`<button>${esc(o.label)}</button>`);
    b.addEventListener('click', () => { set(o.value); onChange(o.value); });
    wrap.appendChild(b);
    return b;
  });
  function set(v) {
    const i = Math.max(0, options.findIndex(o => o.value === v));
    btns.forEach((b, j) => b.classList.toggle('on', i === j));
    thumb.style.width = `calc((100% - 6px) / ${options.length})`;
    thumb.style.transform = `translateX(${i * 100}%)`;
  }
  set(value);
  return wrap;
}

export function toggle(on, onChange) {
  const b = h(`<button class="switch${on ? ' on' : ''}" role="switch"></button>`);
  b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); onChange(on); });
  return b;
}

// ---------- 列表动画 ----------
// 记录旧位置 → 重新渲染 → 让元素从旧位置平滑移到新位置（FLIP）
export function flip(container, render) {
  const before = new Map();
  $$('[data-id]', container).forEach(el => before.set(el.dataset.id, el.getBoundingClientRect()));
  render();
  $$('[data-id]', container).forEach(el => {
    const old = before.get(el.dataset.id);
    if (!old) {
      anim(el, [{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
      return;
    }
    const now = el.getBoundingClientRect();
    const dx = old.left - now.left, dy = old.top - now.top;
    if (dx || dy) anim(el, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.3, 1.1, .4, 1)' });
  });
}

export function stagger(container) {
  $$('[data-id]', container).slice(0, 14).forEach((el, i) => {
    anim(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 30 * i, easing: EASE });
  });
}

export function collapse(el) {
  const hgt = el.offsetHeight;
  return anim(el, [
    { opacity: 1, transform: 'scale(1)', height: hgt + 'px' },
    { opacity: 0, transform: 'scale(.94)', height: hgt + 'px', offset: 0.55 },
    { opacity: 0, transform: 'scale(.94)', height: '0px', marginTop: '-10px' },
  ], { duration: 340, easing: 'ease', fill: 'forwards' });
}

// 长按
export function onLongPress(el, fn) {
  let t = null, sx = 0, sy = 0;
  el.addEventListener('pointerdown', e => {
    sx = e.clientX; sy = e.clientY;
    t = setTimeout(() => { t = null; el.dataset.longpressed = '1'; navigator.vibrate && navigator.vibrate(12); fn(e); }, 480);
  });
  const cancel = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - sx) > 8 || Math.abs(e.clientY - sy) > 8) cancel(); });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
export function consumeLongPress(el) {
  if (el.dataset.longpressed) { delete el.dataset.longpressed; return true; }
  return false;
}

// ---------- 日期滚轮：年 / 月 / 日 三列，从底部弹出 ----------
// 返回选中的时间戳（当天中午，避免时区边界问题），取消返回 null
export function datePicker({ title = '选择日期', value = Date.now(), min = new Date(2000, 0, 1), max = new Date() } = {}) {
  return new Promise(resolve => {
    const ROW = 40;
    const d0 = new Date(value);
    const cur = { y: d0.getFullYear(), m: d0.getMonth() + 1, d: d0.getDate() };
    const body = h(`
      <div>
        <div class="wheels"><div class="wheel-band"></div>
          <div class="wheel" data-k="y"></div><div class="wheel" data-k="m"></div><div class="wheel" data-k="d"></div>
        </div>
        <div class="btn-row"><button class="btn" data-cancel>取消</button><button class="btn primary" data-ok>确定</button></div>
      </div>`);
    const cols = { y: $('[data-k=y]', body), m: $('[data-k=m]', body), d: $('[data-k=d]', body) };
    const maxY = max.getFullYear(), maxM = max.getMonth() + 1, maxD = max.getDate();
    const range = k => {
      if (k === 'y') return [min.getFullYear(), maxY];
      if (k === 'm') return [1, cur.y === maxY ? maxM : 12];
      const days = new Date(cur.y, cur.m, 0).getDate();
      return [1, cur.y === maxY && cur.m === maxM ? maxD : days];
    };
    const unit = { y: '年', m: '月', d: '日' };
    function fill(k) {
      const [a, b] = range(k);
      const col = cols[k], kids = col.children;
      // 先读这一列现在停在哪（用户可能正在滚），范围没变就不重排，免得跳回去
      const at = kids[Math.round(col.scrollTop / ROW)];
      if (at) cur[k] = +at.dataset.v;
      if (kids.length && +kids[0].dataset.v === a && +kids[kids.length - 1].dataset.v === b) return;
      cur[k] = Math.min(Math.max(cur[k], a), b);
      cols[k].innerHTML = '';
      for (let v = a; v <= b; v++) cols[k].appendChild(h(`<div data-v="${v}">${v}${unit[k]}</div>`));
      cols[k].scrollTop = (cur[k] - a) * ROW;
      mark(k);
    }
    function mark(k) {
      const i = Math.round(cols[k].scrollTop / ROW);
      Array.from(cols[k].children).forEach((el, j) => el.classList.toggle('on', j === i));
    }
    const timers = {};
    for (const k of ['y', 'm', 'd']) {
      cols[k].addEventListener('scroll', () => {
        mark(k);
        clearTimeout(timers[k]);
        // 停稳以后再读数：年、月变了要重排天数
        timers[k] = setTimeout(() => {
          const el = cols[k].children[Math.round(cols[k].scrollTop / ROW)];
          if (!el) return;
          const v = +el.dataset.v;
          if (v === cur[k]) return;
          cur[k] = v;
          if (k === 'y') { fill('m'); fill('d'); }
          if (k === 'm') fill('d');
        }, 120);
      }, { passive: true });
      cols[k].addEventListener('click', e => {
        const el = e.target.closest('[data-v]');
        if (el) cols[k].scrollTo({ top: Array.prototype.indexOf.call(cols[k].children, el) * ROW, behavior: 'smooth' });
      });
    }
    let result = null;
    const s = openSheet({ title, body, onClose: () => resolve(result) });
    // 弹层加进页面后才能设置滚动位置
    fill('y'); fill('m'); fill('d');
    $('[data-cancel]', body).addEventListener('click', () => s.close());
    $('[data-ok]', body).addEventListener('click', () => {
      for (const k of ['y', 'm', 'd']) {
        const el = cols[k].children[Math.round(cols[k].scrollTop / ROW)];
        if (el) cur[k] = +el.dataset.v;
      }
      result = new Date(cur.y, cur.m - 1, Math.min(cur.d, new Date(cur.y, cur.m, 0).getDate()), 12).getTime();
      s.close();
    });
  });
}
