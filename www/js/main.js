import { load, flushAll } from './store.js';
import { $, $$, h } from './util.js';
import { icons } from './icons.js';
import { anim, EASE, handleBack, toast } from './ui.js';
import { applyTheme } from './theme.js';
import { onBack, onPause, exitApp, splashDone } from './native.js';
import * as novel from './views/novel.js';
import * as world from './views/world.js';
import * as notes from './views/notes.js';
import { setReloadHandler } from './views/settings.js';

const TABS = [
  { id: 'novel', label: '小说', icon: icons.book, view: novel },
  { id: 'world', label: '世界观', icon: icons.globe, view: world },
  { id: 'notes', label: notes.TAB.label, icon: icons[notes.TAB.icon], view: notes },
];

let current = 0;
const pages = TABS.map(t => $(`.page[data-tab=${t.id}]`));
const tabBtns = TABS.map(t => $(`.tab[data-tab=${t.id}]`));
const indicator = $('.tab-indicator');
let fabEl;

// 胶囊水平对准当前标签、垂直对准图标中心（按实际排版量，换字体也不会偏）
function placeIndicator() {
  const b = tabBtns[current];
  const icon = b.querySelector('svg').getBoundingClientRect();
  const bar = indicator.parentElement;
  const top = icon.top + icon.height / 2 - bar.getBoundingClientRect().top - bar.clientTop - indicator.offsetHeight / 2;
  indicator.style.top = `${Math.round(top)}px`;
  indicator.style.transform = `translateX(${b.offsetLeft + (b.offsetWidth - indicator.offsetWidth) / 2}px)`;
}

function switchTab(i) {
  if (i === current) {
    // 再点一次当前标签：回到顶部
    pages[i].scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  const dir = i > current ? 1 : -1;
  const from = pages[current], to = pages[i];
  pages.forEach(p => p.getAnimations().forEach(a => a.cancel()));
  current = i;
  tabBtns.forEach((b, j) => b.classList.toggle('on', j === i));
  placeIndicator();

  anim(from, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: `translateX(${-dir * 28}px)` }], { duration: 170, easing: 'ease-in', fill: 'forwards' })
    .then(() => { if (current !== pages.indexOf(from)) { from.classList.remove('active'); from.getAnimations().forEach(a => a.cancel()); } });
  to.classList.add('active');
  anim(to, [{ opacity: 0, transform: `translateX(${dir * 36}px)` }, { opacity: 1, transform: 'translateX(0)' }], { duration: 340, delay: 70, easing: EASE });
  // 按钮本身不动，只让“+”转四分之一圈，提示它换了用途
  anim(fabEl.firstElementChild, [{ transform: 'rotate(0)' }, { transform: 'rotate(90deg)' }], { duration: 420, easing: EASE });
}

function renderAll(animate) {
  TABS.forEach(t => t.view.render({ animate }));
}

async function boot() {
  await load();
  applyTheme();

  TABS.forEach((t, i) => {
    tabBtns[i].innerHTML = `${t.icon}<span>${t.label}</span>`;
    tabBtns[i].addEventListener('click', () => switchTab(i));
    t.view.mount(pages[i]);
  });
  fabEl = h(`<button class="fab" aria-label="新建">${icons.plus}</button>`);
  fabEl.addEventListener('click', () => TABS[current].view.fab());
  $('#root').appendChild(fabEl);

  pages[0].classList.add('active');
  tabBtns[0].classList.add('on');
  // 首次定位不要滑过去
  indicator.style.transition = 'none';
  placeIndicator();
  indicator.offsetWidth;
  indicator.style.transition = '';
  window.addEventListener('resize', placeIndicator);
  setReloadHandler(() => renderAll(true));

  // 安卓返回键：先关弹层/编辑页，再“再按一次退出”
  let lastBack = 0;
  onBack(() => {
    if (handleBack()) return;
    if (Date.now() - lastBack < 2000) { flushAll().then(exitApp); return; }
    lastBack = Date.now();
    toast('再按一次退出');
  });
  onPause(() => { flushAll(); });

  // 等启动画面开始淡出，再让卡片和 + 按钮入场
  await splashDone();
  placeIndicator();
  TABS[0].view.render({ animate: true });
  anim(fabEl, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 420, delay: 160, easing: 'cubic-bezier(.3, 1.5, .5, 1)' });
}

boot();
