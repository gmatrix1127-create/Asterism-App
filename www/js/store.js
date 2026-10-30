import { kv } from './db.js';

export const PALETTE = [
  { name: '符星绿', hex: '#22B07A' },
  { name: '青碧', hex: '#14A3A3' },
  { name: '天青', hex: '#3B82F6' },
  { name: '靛蓝', hex: '#6366F1' },
  { name: '紫晶', hex: '#8B5CF6' },
  { name: '桃粉', hex: '#EC6A9C' },
  { name: '朱砂', hex: '#E5484D' },
  { name: '琥珀', hex: '#F08C2E' },
  { name: '金', hex: '#CF9D0B' },
  { name: '赭石', hex: '#9C6B3F' },
  { name: '石墨', hex: '#64748B' },
];

// 正文颜色：每种颜色都有浅色/深色两套，切换主题时自动跟着变
export const TEXT_COLORS = [
  { id: 'default', name: '默认' },
  { id: 'ink', name: '青墨', light: '#1E4A3C', dark: '#BFE6D4' },
  { id: 'green', name: '符星绿', light: '#12875A', dark: '#6FE0AE' },
  { id: 'blue', name: '黛蓝', light: '#2A4766', dark: '#BED2EA' },
  { id: 'brown', name: '赭石', light: '#64452E', dark: '#E9D4BE' },
  { id: 'gray', name: '烟灰', light: '#56615C', dark: '#B3BFBA' },
];

const DEFAULT_SETTINGS = () => ({
  theme: 'system',
  bookTitle: '未命名作品',
  chapterColor: '#22B07A',
  editor: { fontSize: 18, lineHeight: 1.9, serif: false, color: 'default', autoIndent: true },
  worldTypes: [
    { name: '人设', color: '#EC6A9C' },
    { name: '世界观', color: '#3B82F6' },
    { name: '大纲', color: '#F08C2E' },
    { name: '势力', color: '#8B5CF6' },
  ],
});

export const state = {
  settings: DEFAULT_SETTINGS(),
  chapters: [], // {id, title, note, words, createdAt, updatedAt}，数组顺序即章节顺序
  world: [],    // {id, type, title, desc, color, createdAt, updatedAt}
  notes: [],    // 随记，字段由 views/notes.js 决定
};

const KEYS = ['settings', 'chapters', 'world', 'notes'];

export async function load() {
  const [settings, chapters, world, notes] = await Promise.all(KEYS.map(k => kv.get(k)));
  const def = DEFAULT_SETTINGS();
  state.settings = Object.assign(def, settings || {});
  state.settings.editor = Object.assign(def.editor, (settings && settings.editor) || {});
  state.chapters = Array.isArray(chapters) ? chapters : [];
  state.world = Array.isArray(world) ? world : [];
  state.notes = Array.isArray(notes) ? notes : [];
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* 可选 */ }
}

const timers = {};
export function persist(key) {
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => { delete timers[key]; kv.set(key, state[key]); }, 250);
}

// 应用切到后台前调用：把所有还没写入的数据立刻写进去
const flushHooks = new Set();
export const onFlush = fn => { flushHooks.add(fn); return () => flushHooks.delete(fn); };
export async function flushAll() {
  const jobs = [];
  for (const fn of flushHooks) jobs.push(fn());
  for (const key of Object.keys(timers)) {
    clearTimeout(timers[key]);
    delete timers[key];
    jobs.push(kv.set(key, state[key]));
  }
  await Promise.all(jobs);
}

export const getText = async id => (await kv.get('text:' + id)) || '';
export const setText = (id, text) => kv.set('text:' + id, text);
export const delText = id => kv.del('text:' + id);

export async function exportAll() {
  await flushAll();
  return { app: 'asterism', version: 1, exportedAt: new Date().toISOString(), data: await kv.entries() };
}

export async function importAll(backup) {
  if (!backup || backup.app !== 'asterism' || typeof backup.data !== 'object') throw new Error('不是符星的备份文件');
  await flushAll();
  await kv.replaceAll(backup.data);
  await load();
}
