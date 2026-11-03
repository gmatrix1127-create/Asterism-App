// 与安卓原生交互的部分；在电脑浏览器里预览时自动退化为网页行为
const Cap = window.Capacitor;
export const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const P = (Cap && Cap.Plugins) || {};

export function onBack(fn) {
  if (isNative && P.App) P.App.addListener('backButton', fn);
}

export function onPause(fn) {
  if (isNative && P.App) P.App.addListener('pause', fn);
  document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
  window.addEventListener('pagehide', fn);
}

export function exitApp() {
  if (isNative && P.App) P.App.exitApp();
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// 启动画面：网页（含字体）准备好后告诉原生端；返回的 Promise 在启动画面开始淡出时完成
export async function splashDone() {
  if (!isNative || !P.Launch) return;
  if (document.fonts) await Promise.race([document.fonts.ready, wait(600)]);
  await Promise.race([P.Launch.ready().catch(() => {}), wait(2500)]);
}

// 记住 app 内选的深浅色，下次启动画面用同一套颜色（安卓 13 起支持）
export function setSplashTheme(pref) {
  if (isNative && P.Launch) P.Launch.setTheme({ theme: pref }).catch(() => {});
}

// dark = true 表示深色背景，状态栏图标用浅色
export function setBarStyle(dark) {
  if (!isNative || !P.SystemBars) return;
  P.SystemBars.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
}

// 把文本存成文件，然后调起系统分享（可选“保存到文件”、发到微信/QQ 等）
export async function shareFile(filename, text, mime) {
  if (isNative && P.Filesystem && P.Share) {
    const r = await P.Filesystem.writeFile({ path: filename, data: text, directory: 'CACHE', encoding: 'utf8', recursive: true });
    try {
      await P.Share.share({ title: filename, dialogTitle: '保存或发送', files: [r.uri] });
    } catch (e) {
      if (!/cancel/i.test(String(e && e.message))) throw e;
      return false;
    }
    return true;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  return true;
}

export function pickTextFile() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(f, 'utf-8');
    });
    document.body.appendChild(input);
    input.click();
  });
}

// 从相册选一张图（手机上直接打开系统相册），压缩到长边 1600 像素以内。
// 返回 { dataUrl, ratio: 高/宽 }，取消返回 null
export async function pickImage() {
  if (isNative && P.Gallery) {
    // 原生端直接打开系统相册，并在那边压缩好
    const r = await P.Gallery.pick();
    return r && !r.cancelled && r.dataUrl ? { dataUrl: r.dataUrl, ratio: r.ratio } : null;
  }
  const file = await chooseFile('image/*');
  if (!file) return null;
  const src = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
  return shrinkImage(src);
}

async function shrinkImage(src, max = 1600) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('图片读不出来'));
    i.src = src;
  });
  const w = img.naturalWidth, h = img.naturalHeight;
  const k = Math.min(1, max / Math.max(w, h));
  if (k === 1 && src.length < 1.6e6) return { dataUrl: src, ratio: h / w };
  const c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { dataUrl: c.toDataURL('image/webp', .85), ratio: h / w };
}

function chooseFile(accept) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.addEventListener('change', () => { const f = input.files && input.files[0]; input.remove(); resolve(f || null); });
    document.body.appendChild(input);
    input.click();
  });
}

export async function appVersion() {
  if (!isNative || !P.App) return null;
  try { return (await P.App.getInfo()).version; } catch (e) { return null; }
}

export function webviewVersion() {
  const m = /Chrome\/(\d+)/.exec(navigator.userAgent);
  return m ? m[1] : '?';
}
