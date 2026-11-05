import { h, esc, $ } from '../util.js';
import { logo, icons } from '../icons.js';
import { openSheet } from '../ui.js';

// 一级页面的大标题区（Asterism 字样和设置按钮在整个 app 共用的顶部栏里，切换页面时不动）
export function pageHeader({ eyebrow, title }) {
  return `
    <div class="hero">
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${esc(title)}</h1>
      <div class="hero-sub"></div>
    </div>`;
}

// 页面自己的按钮（比如章节颜色、标签管理）：放进共用顶部栏，切到这个页面时淡入
export function pageActions(page, actions) {
  const group = h(`<div class="acts" data-tab="${page.dataset.tab}">${actions.map(a =>
    `<button class="icon-btn" data-act="${a.act}" aria-label="${esc(a.label)}">${icons[a.icon]}</button>`).join('')}</div>`);
  $('.appbar-acts').appendChild(group);
  return group;
}

// 页面滚动后，顶部栏换成小标题 + 毛玻璃底（由 main.js 根据当前页面同步）
export function bindScroll(page) {
  let on = false;
  page.addEventListener('scroll', () => {
    const s = page.scrollTop > 48;
    if (s !== on) { on = s; page.classList.toggle('scrolled', s); window.dispatchEvent(new Event('pagescroll')); }
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
