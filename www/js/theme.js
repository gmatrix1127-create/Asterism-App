import { state, TEXT_COLORS } from './store.js';
import { setBarStyle, setSplashTheme } from './native.js';

const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;

export const isDark = () => document.documentElement.dataset.theme === 'dark';

export function applyTheme(animate = false) {
  const pref = state.settings.theme;
  const dark = pref === 'dark' || (pref === 'system' && !!(mq && mq.matches));
  setSplashTheme(pref);
  const root = document.documentElement;
  const changed = (root.dataset.theme === 'dark') !== dark;
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 整页交叉淡入淡出：文字、图标、背景一起平滑过渡（WebView 111+ 支持）
  if (animate && changed && !reduced && document.startViewTransition) {
    document.startViewTransition(() => setTheme(dark));
    return;
  }
  if (animate && changed) {
    root.classList.add('theme-anim');
    setTimeout(() => root.classList.remove('theme-anim'), 400);
  }
  setTheme(dark);
}

function setTheme(dark) {
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]');
  if (meta) meta.content = dark ? '#0D1311' : '#F5F8F6';
  setBarStyle(dark);
  window.dispatchEvent(new Event('themechange'));
}

if (mq) {
  const onChange = () => { if (state.settings.theme === 'system') applyTheme(true); };
  mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
}

// 正文颜色按当前主题取浅色或深色那一套
export function textColor(id) {
  const c = TEXT_COLORS.find(x => x.id === id);
  if (!c || !c.light) return '';
  return isDark() ? c.dark : c.light;
}
