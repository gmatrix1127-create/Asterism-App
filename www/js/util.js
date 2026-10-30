export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}

// 字数：中文字符与标点各算 1，连续的英文/数字算 1 个词，空白不计
const LATIN = /[A-Za-z0-9À-ɏ]+(?:['’\-.][A-Za-z0-9À-ɏ]+)*/g;
export function wordCount(text) {
  if (!text) return 0;
  const words = text.match(LATIN);
  const rest = text.replace(LATIN, '').replace(/[\s　]/g, '');
  return (words ? words.length : 0) + rest.length;
}

export const fmtNum = n => Number(n || 0).toLocaleString('en-US');

export function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function rgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '34, 176, 122';
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export const pad3 = n => String(n).padStart(3, '0');

export function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
