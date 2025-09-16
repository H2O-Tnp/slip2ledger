/* ===== UI helpers ===== */

function currencyTHB(n) {
  if (n === '' || n == null || Number.isNaN(n)) return '–';
  try {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
      .format(Number(n));
  } catch {
    return String(n);
  }
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function pad2(n) { return String(n).padStart(2, '0'); }

function isoToLocalNoTZ(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function setDatetimeInputFromISO(inputEl, iso) {
  if (!inputEl) return;
  const s = isoToLocalNoTZ(iso);
  if (s) inputEl.value = s.slice(0, 16);
}

function setButtonLoading(btn, isLoading, textWhenLoading = 'Loading…', textWhenIdle) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset._text = btn.textContent;
    btn.disabled = true;
    btn.textContent = textWhenLoading;
    btn.style.opacity = '.85';
  } else {
    btn.disabled = false;
    btn.textContent = textWhenIdle ?? btn.dataset._text ?? btn.textContent;
    btn.style.opacity = '';
  }
}

function showToast(message, type = 'info', timeoutMs = 2400) {
  const wrapId = '__toast_wrap__';
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapId;
    Object.assign(wrap.style, {
      position: 'fixed', right: '16px', bottom: '16px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none'
    });
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  const palette = {
    info:   { bg: '#111827', fg: '#fff', border: 'rgba(255,255,255,.12)' },
    ok:     { bg: '#065f46', fg: '#ecfdf5', border: 'rgba(255,255,255,.14)' },
    warn:   { bg: '#92400e', fg: '#fffbeb', border: 'rgba(0,0,0,.12)' },
    error:  { bg: '#7f1d1d', fg: '#fee2e2', border: 'rgba(0,0,0,.12)' }
  }[type] || { bg: '#111827', fg: '#fff', border: 'rgba(255,255,255,.12)' };

  Object.assign(el.style, {
    background: palette.bg, color: palette.fg,
    padding: '10px 12px', borderRadius: '10px',
    border: `1px solid ${palette.border}`,
    boxShadow: '0 8px 24px rgba(0,0,0,.18)',
    fontSize: '14px', lineHeight: '1.25', pointerEvents: 'auto',
    transform: 'translateY(8px)', opacity: '0', transition: 'all 160ms ease'
  });
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(0)';
    el.style.opacity = '1';
  });
  const t = setTimeout(() => {
    el.style.transform = 'translateY(8px)';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 180);
  }, timeoutMs);
  el.addEventListener('click', () => { clearTimeout(t); el.remove(); });
}

/* ===== Canvas helpers (for HiDPI + responsive) ===== */
function prepareCanvas(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const displayWidth = Math.max(1, canvas.clientWidth || 320);
  const displayHeight = Math.max(1, canvas.clientHeight || 240);
  if (canvas.width !== Math.floor(displayWidth * dpr) || canvas.height !== Math.floor(displayHeight * dpr)) {
    canvas.width = Math.floor(displayWidth * dpr);
    canvas.height = Math.floor(displayHeight * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
  return ctx;
}

/* ===== Responsive pie with outside labels (desktop) + legend mode (mobile) ===== */
function drawPie(canvas, data) {
  let ctx = prepareCanvas(canvas);
  let width = canvas.clientWidth || 320;
  let height = canvas.clientHeight || 240;

  let isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const labelBg = isDark ? 'rgba(17,24,39,.92)' : 'rgba(255,255,255,.92)';
  const labelFg = isDark ? '#e5e7eb' : '#111827';
  const lineColor = isDark ? 'rgba(203,213,225,.9)' : 'rgba(17,24,39,.45)';

  ctx.clearRect(0, 0, width, height);
  if (!data || !data.length) return;

  const colors = ['#4f46e5','#10b981','#f59e0b','#06b6d4','#84cc16','#ef4444',
                  '#a855f7','#14b8a6','#f97316','#0ea5e9','#22c55e','#eab308'];
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const MAX_SEGMENTS = 10;
  const MIN_LABEL_SPACING = 16;

  // sort and bucket
  let segments = [...data].sort((a,b)=>b.value-a.value);
  if (segments.length > MAX_SEGMENTS) {
    const top = segments.slice(0, MAX_SEGMENTS - 1);
    const restSum = segments.slice(MAX_SEGMENTS - 1).reduce((s,x)=>s+x.value,0);
    if (restSum > 0) top.push({ name: 'Other', value: restSum });
    segments = top;
  }


  const cx = width / 2;
  let cy = height / 2;
  let r = Math.min(width, height) / 3.0;

  const rows = Math.ceil(segments.length / (width >= 340 ? 2 : 1));
  const legendHeight = 24 + rows * 22 + 8;
  const needed = Math.max(220, (r*2 + 24 + legendHeight));
  if (needed > height + 1) {
    canvas.style.height = Math.ceil(needed) + "px";
    ctx = prepareCanvas(canvas);
    width = canvas.clientWidth; height = canvas.clientHeight;
    r = Math.min(width, height) / 3.0;
  }
  cy = Math.min(height * 0.42, (height - legendHeight) * 0.5);

  // angles
  let start = -Math.PI / 2;
  const arcs = [];
  segments.forEach((seg, i) => {
    const angle = (seg.value / total) * Math.PI * 2;
    arcs.push({ start, end: start + angle, mid: start + angle / 2, color: colors[i % colors.length], seg });
    start += angle;
  });

  // slices
  arcs.forEach(a => {
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, a.start, a.end); ctx.closePath();
    ctx.fillStyle = a.color; ctx.fill();
  });


  // legend rows below
  const pct = (v)=> Math.round((v/total)*100) + '%';
  const colCount = width >= 340 ? 2 : 1;
  const colW = (width - 32) / colCount;
  const legendTop = cy + r + 24;

  ctx.font = '12px system-ui, -apple-system, Segoe UI, Roboto';
  ctx.textBaseline = 'middle'; ctx.fillStyle = labelFg;

  segments.forEach((s, idx) => {
    const col = idx % colCount;
    const row = Math.floor(idx / colCount);
    const x = 16 + col * colW;
    const y = legendTop + row * 22;

    ctx.fillStyle = arcs[idx].color;
    ctx.fillRect(x, y - 6, 12, 12);
    ctx.fillStyle = labelFg;
    ctx.fillText(`${s.name} ${pct(s.value)}`, x + 16, y);
  });
  return;
}

/* helper for rounded pill labels */
function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  const rr = Math.min(r, h/2, w/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ===== expose ===== */
window.uiHelpers = { setButtonLoading, showToast, isoToLocalNoTZ, setDatetimeInputFromISO };
window.currencyTHB = currencyTHB;
window.escapeHtml = escapeHtml;
window.drawPie = drawPie;
