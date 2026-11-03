const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

// 符星 Logo（按原图描出的路径）
export const LOGO_PATH = 'M8.3 263.3 L100 16.7 L140 125 L70 168.3 L105 261.7 L150 148.3 L191.7 263.3';
// 取景框紧贴图形（含线宽），方便和文字对齐；sw 为线宽（原图约 13）
export function logo(cls = '', sw = 13) {
  const h = sw / 2;
  const box = `${(8.3 - h).toFixed(1)} ${(16.7 - h).toFixed(1)} ${(183.4 + sw).toFixed(1)} ${(246.6 + sw).toFixed(1)}`;
  return `<svg class="${cls}" viewBox="${box}" width="20" height="27" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"><path d="${LOGO_PATH}" pathLength="1000"/></svg>`;
}

export const icons = {
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 'stroke-width="2.2"'),
  more: svg('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
  drop: svg('<path d="M12 3.2s6.2 6.6 6.2 11.2a6.2 6.2 0 0 1-12.4 0C5.8 9.8 12 3.2 12 3.2z"/>'),
  settings: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
  book: svg('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6"/>'),
  globe: svg('<circle cx="12" cy="12" r="8.6"/><path d="M3.6 12h16.8M12 3.4c2.3 2.4 3.5 5.3 3.5 8.6s-1.2 6.2-3.5 8.6c-2.3-2.4-3.5-5.3-3.5-8.6S9.7 5.8 12 3.4z"/>'),
  undo: svg('<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>'),
  redo: svg('<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h3"/>'),
  image: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 15.5 15.8 11 7 19.5"/>'),
  resize: svg('<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>'),
  cards: svg('<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/>'),
  rows: svg('<path d="M4 6.5h16M4 12h16M4 17.5h16"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>'),
  note: svg('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>'),
  mark: svg('<path d="M5.1 21.2 12 2.8l3 8.1-5.2 3.2 2.6 7 3.4-8.5 3.1 8.6"/>'),
  type: svg('<path d="M3.5 18 8 6l4.5 12M5.2 13.6h5.6"/><path d="M15 10.8c.6-.8 1.5-1.2 2.6-1.2 1.8 0 2.8 1 2.8 2.9V18"/><path d="M20.4 13.8c-.7-.2-1.5-.3-2.3-.3-1.8 0-3.1.9-3.1 2.3 0 1.3 1 2.2 2.4 2.2 1.4 0 2.4-.7 3-1.7"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l.9 11.4A2 2 0 0 0 8.9 20h6.2a2 2 0 0 0 2-1.6L18 7M9 7V4.5h6V7"/>'),
  edit: svg('<path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14 8l3 3"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 'stroke-width="2.6"'),
  share: svg('<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>'),
  import: svg('<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13"/>'),
  file: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  tag: svg('<path d="M3.5 12V4.5a1 1 0 0 1 1-1H12l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8" r="1.4"/>'),
  hash: svg('<path d="M5 9h14M5 15h14M10.5 4 8.5 20M15.5 4l-2 16"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 'stroke-width="2.6"'),
  pen: svg('<path d="M12 20h8"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
};
