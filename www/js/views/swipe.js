// 随记卡片的快捷操作（两个版本共用）：
// 左滑卡片露出「多选」「删除」；删除第一次会确认（可勾“下次无须询问”），之后卡片直接向右飞出；
// 多选：每张卡片右边出现勾选圈，点卡片或在勾选圈那一列上下滑动来勾选，底部操作条批量删除（以及各版本自己的批量操作）；
// 按返回键或点列表以外的地方退出多选。
import { state, persist } from '../store.js';
import { h, $, $$ } from '../util.js';
import { icons } from '../icons.js';
import { anim, EASE, pushBack, confirmDialog, collapse } from '../ui.js';

const ACT_W = 136; // 左滑露出的按钮区宽度

// 把卡片包一层：后面藏着操作按钮，右边是多选时的勾选圈。data-id 挪到外层，列表动画按行走
export function swipeRow(card, id) {
  card.removeAttribute('data-id');
  const row = h(`
    <div class="swipe-row" data-id="${id}">
      <div class="swipe-acts">
        <button data-sw="multi">${icons.check}<span>多选</span></button>
        <button data-sw="del" class="danger">${icons.trash}<span>删除</span></button>
      </div>
      <span class="sel-box"><i>${icons.check}</i></span>
    </div>`);
  row.insertBefore(card, $('.sel-box', row));
  return row;
}

// onDelete(ids)：真正删数据（不再确认）；batch：多选时额外的批量操作 [{ key, icon, label, run(ids, done) }]
export function swipeList(list, { onDelete, batch = [], noun = '篇' }) {
  let open = null, selecting = false, sel = new Set(), bar = null, unBack = null, suppress = false;
  const cardOf = row => $('.card', row);

  function setX(row, x, animate = true) {
    const c = cardOf(row);
    c.style.transition = animate ? '' : 'none';
    c.style.transform = x ? `translateX(${x}px)` : '';
  }
  function close(row = open) {
    if (!row) return;
    setX(row, 0);
    row.classList.remove('open');
    if (open === row) open = null;
  }
  function openRow(row) {
    if (open && open !== row) close(open);
    setX(row, -ACT_W);
    row.classList.add('open');
    open = row;
  }

  // ---------- 左滑 ----------
  list.addEventListener('pointerdown', e => {
    const row = e.target.closest('.swipe-row');
    if (selecting) { if (row && e.target.closest('.sel-box')) startPaint(e, row); return; }
    if (open && open !== row) close();
    if (!row || e.target.closest('.swipe-acts')) return;
    const c = cardOf(row);
    const sx = e.clientX, sy = e.clientY, base = row === open ? -ACT_W : 0, pid = e.pointerId;
    let mode = null, x = base;
    const move = ev => {
      if (ev.pointerId !== pid) return;
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!mode) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) { mode = 'h'; c.classList.remove('pressed'); }
        else if (Math.abs(dy) > 8) { done(); return; }
        else return;
      }
      x = base + dx;
      if (x > 0) x = 0;
      if (x < -ACT_W) x = -ACT_W + (x + ACT_W) * .3; // 拉过头有阻力
      setX(row, x, false);
    };
    const up = ev => {
      if (ev.pointerId !== pid) return;
      done();
      if (mode !== 'h') return;
      suppress = true; // 这次松手不算点击
      if (x < -ACT_W / 2) openRow(row); else close(row);
    };
    const done = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  // 点击：滑过的这次不算；展开着的卡片点一下是收起；多选时点卡片是勾选；按钮各做各的
  list.addEventListener('click', e => {
    const row = e.target.closest('.swipe-row');
    const stop = () => { e.stopPropagation(); e.preventDefault(); };
    if (suppress) { suppress = false; stop(); return; }
    if (!row) return;
    const sw = e.target.closest('[data-sw]');
    if (sw) {
      stop();
      if (sw.dataset.sw === 'del') removeRows([row]);
      else enterSelect(row);
      return;
    }
    if (selecting) { stop(); toggle(row); return; }
    if (row === open) { stop(); close(row); }
  }, true);

  // 点列表外面：收起展开的卡片
  document.addEventListener('pointerdown', e => {
    if (open && !open.contains(e.target)) close();
  }, true);
  list.closest('.page')?.addEventListener('scroll', () => close(), { passive: true });

  // ---------- 删除 ----------
  async function askDelete(n) {
    if (state.settings.quickDeleteNoAsk) return true;
    const check = { label: '下次无须询问', value: false };
    const ok = await confirmDialog({
      title: n > 1 ? `删除选中的 ${n} ${noun}随记？` : `删除这${noun}随记？`,
      message: '删除后无法恢复。', ok: '删除', danger: true, check,
    });
    if (ok && check.value) { state.settings.quickDeleteNoAsk = true; persist('settings'); }
    return ok;
  }
  async function removeRows(rows) {
    if (!rows.length || !await askDelete(rows.length)) return;
    // 卡片向右飞出，再把空位合拢
    await Promise.all(rows.map((r, i) => {
      r.classList.add('leaving');
      const c = cardOf(r), from = c.style.transform || 'translateX(0)';
      c.style.transition = 'none';
      return anim(c, [{ transform: from, opacity: 1 }, { transform: 'translateX(115%)', opacity: .4 }],
        { duration: 280, delay: i * 45, easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' });
    }));
    await Promise.all(rows.map(r => collapse(r)));
    if (open && rows.includes(open)) open = null;
    await onDelete(rows.map(r => r.dataset.id));
  }

  // ---------- 多选 ----------
  const rowsAll = () => $$('.swipe-row', list);
  function sync() {
    rowsAll().forEach(r => r.classList.toggle('checked', sel.has(r.dataset.id)));
    if (!bar) return;
    $('.sel-count', bar).textContent = `已选 ${sel.size} ${noun}`;
    $$('button', bar).forEach(b => { b.disabled = !sel.size; });
  }
  function toggle(row, on) {
    const id = row.dataset.id;
    if (on === undefined) on = !sel.has(id);
    if (on) sel.add(id); else sel.delete(id);
    sync();
  }
  function enterSelect(row) {
    close();
    selecting = true;
    sel = new Set([row.dataset.id]);
    list.classList.add('selecting');
    bar = h(`
      <div class="sel-bar">
        <span class="sel-count"></span><span class="grow"></span>
        ${batch.map(b => `<button data-b="${b.key}">${icons[b.icon]}<span>${b.label}</span></button>`).join('')}
        <button data-b="del" class="danger">${icons.trash}<span>删除</span></button>
      </div>`);
    document.getElementById('root').appendChild(bar);
    anim(bar, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE });
    bar.addEventListener('click', async e => {
      const b = e.target.closest('[data-b]');
      if (!b) return;
      const ids = [...sel];
      if (b.dataset.b === 'del') {
        const rows = rowsAll().filter(r => sel.has(r.dataset.id));
        exitSelect();
        await removeRows(rows);
        return;
      }
      const act = batch.find(x => x.key === b.dataset.b);
      if (act) act.run(ids, exitSelect);
    });
    const fab = $('.fab');
    if (fab) fab.classList.add('hidden');
    unBack = pushBack(() => exitSelect());
    document.addEventListener('pointerdown', outside, true);
    sync();
  }
  // 点列表和操作条以外的地方（弹层除外）就退出多选
  function outside(e) {
    if (e.target.closest('.swipe-row, .sel-bar, .layer')) return;
    exitSelect();
  }
  function exitSelect() {
    if (!selecting) return;
    selecting = false;
    sel.clear();
    list.classList.remove('selecting');
    sync();
    document.removeEventListener('pointerdown', outside, true);
    if (unBack) { unBack(); unBack = null; }
    const b = bar; bar = null;
    if (b) anim(b, [{ opacity: 1 }, { opacity: 0, transform: 'translateY(16px)' }], { duration: 180, fill: 'forwards' }).then(() => b.remove());
    const fab = $('.fab');
    if (fab) fab.classList.remove('hidden');
  }

  // 在勾选圈那一列上下滑：滑过的卡片都设成和第一张一样（勾上或取消）
  function startPaint(e, row) {
    const on = !sel.has(row.dataset.id), pid = e.pointerId;
    toggle(row, on);
    suppress = true;
    const move = ev => {
      if (ev.pointerId !== pid) return;
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const r = el && el.closest('.swipe-row');
      if (r && list.contains(r) && sel.has(r.dataset.id) !== on) toggle(r, on);
    };
    const up = ev => {
      if (ev.pointerId !== pid) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  return { exitSelect, get selecting() { return selecting; } };
}
