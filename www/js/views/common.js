import { h, esc, $ } from '../util.js';
import { logo, icons } from '../icons.js';
import { openSheet } from '../ui.js';

// 每个一级页面顶部：Asterism 字样 + 滚动后出现的小标题 + 右侧按钮 + 大标题区
export function pageHeader({ eyebrow, title, actions = [] }) {
  const btns = actions.map(a => `<button class="icon-btn" data-act="${a.act}" aria-label="${esc(a.label)}">${icons[a.icon]}</button>`).join('');
  return `
    <header class="topbar">
      <div class="brand"><span class="brand-word">Asterism</span><span class="topbar-title">${esc(title)}</span></div>
      ${btns}
    </header>
    <div class="hero">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      <div class="hero-sub"></div>
    </div>`;
}

export function bindScroll(page) {
  let on = false;
  page.addEventListener('scroll', () => {
    const s = page.scrollTop > 48;
    if (s !== on) { on = s; page.classList.toggle('scrolled', s); }
  }, { passive: true });
}

export function emptyState(title, text) {
  return `<div class="empty">${logo()}<b>${esc(title)}</b>${esc(text)}</div>`;
}

// 通用表单弹层：fields = [{key, label, type: 'text'|'textarea', value, placeholder, maxlength}]
export function formSheet({ title, fields, submit = '保存', extra, onSubmit }) {
  const body = h('<form class="form" autocomplete="off"></form>');
  for (const f of fields) {
    const tag = f.type === 'textarea'
      ? `<textarea class="input" name="${f.key}" rows="3" placeholder="${esc(f.placeholder || '')}" maxlength="${f.maxlength || 2000}">${esc(f.value || '')}</textarea>`
      : `<input class="input" name="${f.key}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" maxlength="${f.maxlength || 80}" enterkeyhint="done">`;
    body.appendChild(h(`<div class="field"><label>${esc(f.label)}</label>${tag}</div>`));
  }
  if (extra) body.appendChild(extra);
  body.appendChild(h(`<div class="btn-row"><button type="button" class="btn" data-cancel>取消</button><button type="submit" class="btn primary">${esc(submit)}</button></div>`));
  const s = openSheet({ title, body });
  $('[data-cancel]', body).addEventListener('click', () => s.close());
  body.addEventListener('submit', e => {
    e.preventDefault();
    const values = {};
    for (const f of fields) values[f.key] = body.elements[f.key].value.trim();
    if (onSubmit(values) !== false) s.close();
  });
  return s;
}
