import { state, persist, exportAll, importAll, getText, flushAll } from '../store.js';
import { h, $, stamp } from '../util.js';
import { icons, logo } from '../icons.js';
import { openSheet, segmented, confirmDialog, toast } from '../ui.js';
import { applyTheme } from '../theme.js';
import { shareFile, pickTextFile, webviewVersion, appVersion } from '../native.js';

export const VERSION = '1.0.4'; // 电脑预览时显示；手机上读安装包里的版本号

let reloadAll = () => {};
export const setReloadHandler = fn => { reloadAll = fn; };

export function openSettings() {
  const body = h(`
    <div>
      <div class="section-label">外观</div>
      <div class="theme-seg"></div>
      <div class="section-label">数据</div>
      <div class="actions">
        <button class="action" data-act="backup">${icons.share}<span>导出备份</span><small>全部内容 · JSON</small></button>
        <button class="action" data-act="restore">${icons.import}<span>从备份恢复</span></button>
        <button class="action" data-act="txt">${icons.file}<span>导出小说全文</span><small>TXT</small></button>
      </div>
      <div class="hint">数据只存在这台手机上。卸载 app 会清空内容，建议隔一段时间导出一次备份。</div>
      <div class="section-label">关于</div>
      <div class="about">
        <div class="draw">${logo()}</div>
        <div class="word">Asterism</div>
        <div class="ver">符星 · v${VERSION} · WebView ${webviewVersion()}</div>
      </div>
    </div>`);
  $('.theme-seg', body).appendChild(segmented(
    [{ label: '跟随系统', value: 'system' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }],
    state.settings.theme,
    v => { state.settings.theme = v; persist('settings'); applyTheme(true); }));

  appVersion().then(v => { if (v) $('.ver', body).textContent = `符星 · v${v} · WebView ${webviewVersion()}`; });
  const s = openSheet({ title: '设置', body });
  body.addEventListener('click', async e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    try {
      if (act === 'backup') await backup();
      if (act === 'restore') { if (await restore()) s.close(); }
      if (act === 'txt') await exportTxt();
    } catch (err) {
      toast('操作失败：' + (err && err.message || err));
    }
  });
}

async function backup() {
  const data = await exportAll();
  const ok = await shareFile(`符星备份-${stamp()}.json`, JSON.stringify(data), 'application/json');
  if (ok) toast('备份已生成');
}

async function restore() {
  const text = await pickTextFile();
  if (text == null) return false;
  let data;
  try { data = JSON.parse(text); } catch (e) { toast('这个文件不是有效的备份'); return false; }
  if (!data || data.app !== 'asterism') { toast('这个文件不是符星的备份'); return false; }
  const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString('zh-CN') : '未知时间';
  const ok = await confirmDialog({
    title: '从备份恢复？',
    message: `备份时间：${when}\n当前 app 里的所有内容会被这份备份替换。`,
    ok: '恢复', danger: true,
  });
  if (!ok) return false;
  await importAll(data);
  applyTheme(true);
  reloadAll();
  toast('已恢复');
  return true;
}

async function exportTxt() {
  await flushAll();
  if (!state.chapters.length) { toast('还没有章节'); return; }
  const parts = [state.settings.bookTitle, ''];
  for (const c of state.chapters) {
    parts.push(c.title || '未命名章节', '', (await getText(c.id)).replace(/\s+$/, ''), '', '');
  }
  const name = `${state.settings.bookTitle.replace(/[\\/:*?"<>|]/g, '_')}-${stamp()}.txt`;
  const ok = await shareFile(name, parts.join('\n'), 'text/plain');
  if (ok) toast('已导出');
}
