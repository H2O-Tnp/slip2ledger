function currencyTHB(n) {
  if (n === "" || n == null || Number.isNaN(n)) return "–";
  try {
    return new Intl.NumberFormat("th-TH", {
      style: "currency",
      currency: "THB",
    }).format(Number(n));
  } catch {
    return String(n);
  }
}
function escapeHtml(s) {
  return (s || "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ])
  );
}
function pad2(n) {
  return String(n).padStart(2, "0");
}
function isoToLocalNoTZ(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
    d.getDate()
  )}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
function setDatetimeInputFromISO(inputEl, iso) {
  if (!inputEl) return;
  const s = isoToLocalNoTZ(iso);
  if (s) inputEl.value = s.slice(0, 16);
}
function setButtonLoading(
  btn,
  isLoading,
  textWhenLoading = "Loading…",
  textWhenIdle
) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset._text = btn.textContent;
    btn.disabled = true;
    btn.textContent = textWhenLoading;
    btn.style.opacity = ".85";
  } else {
    btn.disabled = false;
    btn.textContent = textWhenIdle ?? btn.dataset._text ?? btn.textContent;
    btn.style.opacity = "";
  }
}
function showToast(message, type = "info", timeoutMs = 2400) {
  const wrapId = "__toast_wrap__";
  let wrap = document.getElementById(wrapId);
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = wrapId;
    Object.assign(wrap.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      pointerEvents: "none",
    });
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  const palette = {
    info: { bg: "#111827", fg: "#fff", border: "rgba(255,255,255,.12)" },
    ok: { bg: "#065f46", fg: "#ecfdf5", border: "rgba(255,255,255,.14)" },
    warn: { bg: "#92400e", fg: "#fffbeb", border: "rgba(0,0,0,.12)" },
    error: { bg: "#7f1d1d", fg: "#fee2e2", border: "rgba(0,0,0,.12)" },
  }[type] || { bg: "#111827", fg: "#fff", border: "rgba(255,255,255,.12)" };
  Object.assign(el.style, {
    background: palette.bg,
    color: palette.fg,
    padding: "10px 12px",
    borderRadius: "10px",
    border: `1px solid ${palette.border}`,
    boxShadow: "0 8px 24px rgba(0,0,0,.18)",
    fontSize: "14px",
    lineHeight: "1.25",
    pointerEvents: "auto",
    transform: "translateY(8px)",
    opacity: "0",
    transition: "all 160ms ease",
  });
  el.textContent = message;
  wrap.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = "translateY(0)";
    el.style.opacity = "1";
  });
  const t = setTimeout(() => {
    el.style.transform = "translateY(8px)";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 180);
  }, timeoutMs);
  el.addEventListener("click", () => {
    clearTimeout(t);
    el.remove();
  });
}
function drawPie(canvas, data) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (!data || !data.length) return;
  const MAX_LABEL_SLICES = 6;
  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = width / 2,
    cy = height / 2,
    r = Math.min(width, height) / 2 - 12;
  let start = -Math.PI / 2;
  const colors = [
    "#1fb8ffff",
    "#10b981",
    "#f59e0b",
    "#06b6d4",
    "#84cc16",
    "#ef4444",
    "#a855f7",
    "#14b8a6",
    "#f97316",
    "#8573ffff",
    "#22c55e",
    "#eab308",
  ];
  let segments = [...data];
  segments.sort((a, b) => b.value - a.value);
  if (segments.length > MAX_LABEL_SLICES) {
    const top = segments.slice(0, MAX_LABEL_SLICES - 1);
    const restSum = segments
      .slice(MAX_LABEL_SLICES - 1)
      .reduce((s, x) => s + x.value, 0);
    if (restSum > 0) top.push({ name: "Other", value: restSum });
    segments = top;
  }
  segments.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    const mid = start + angle / 2;
    const slicePct = d.value / total;
    ctx.font = "13px system-ui, -apple-system, Segoe UI, Roboto";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#111827";
    const pctText = Math.round(slicePct * 100) + "%";
    const label = `${d.name} ${pctText}`;
    const arcLen = r * angle;
    if (arcLen > 36) {
      const lx = cx + Math.cos(mid) * r * 0.62,
        ly = cy + Math.sin(mid) * r * 0.62;
      ctx.fillText(label, lx, ly);
    } else {
      const ox = cx + Math.cos(mid) * (r + 12),
        oy = cy + Math.sin(mid) * (r + 12);
      const tx = cx + Math.cos(mid) * (r + 40),
        ty = cy + Math.sin(mid) * (r + 40);
      ctx.strokeStyle = "rgba(17,24,39,.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillText(label, tx, ty);
    }
    start += angle;
  });
  if (data.length > MAX_LABEL_SLICES) {
    const legendX = width - 8,
      legendY = height - 8;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = "12px system-ui";
    ctx.fillStyle = "#64748b";
    ctx.fillText("Showing top categories", legendX, legendY);
  }
}
window.uiHelpers = {
  setButtonLoading,
  showToast,
  isoToLocalNoTZ,
  setDatetimeInputFromISO,
};
window.currencyTHB = currencyTHB;
window.escapeHtml = escapeHtml;
window.drawPie = drawPie;
