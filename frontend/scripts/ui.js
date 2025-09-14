function currencyTHB(n) {
  if (n === '' || n == null || Number.isNaN(n)) return '–';
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(Number(n));
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function drawPie(canvas, data) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (!data.length) return;

  const total = data.reduce((s, d) => s + d.value, 0);
  const cx = width / 2, cy = height / 2, r = Math.min(width, height) / 2 - 10;
  let start = -Math.PI / 2;
  const colors = ['#8884d8','#82ca9d','#ffc658','#8dd1e1','#a4de6c','#d0ed57','#ff8042','#00c49f','#ffbb28','#0088FE','#AA66CC'];

  data.forEach((d, i) => {
    const angle = (d.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    const mid = start + angle / 2;
    const lx = cx + Math.cos(mid) * r * 0.65;
    const ly = cy + Math.sin(mid) * r * 0.65;
    ctx.fillStyle = '#111827';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pct = Math.round((d.value / total) * 100);
    ctx.fillText(`${d.name} ${pct}%`, lx, ly);
    start += angle;
  });
}
