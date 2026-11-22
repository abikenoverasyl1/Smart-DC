// ============================================================
//  Графиктер (SVG): сызықтық график және дөңгелек диаграмма
// ============================================================
const r1 = n => Math.round(n * 10) / 10;
const pt = p => `${r1(p[0])},${r1(p[1])}`;

// Нүктелер арқылы тегіс қисық сызу (Catmull-Rom → Bézier)
function smoothPath(P) {
  let d = `M${pt(P[0])}`;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

const hms = t => new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); // 24 сағаттық формат

/**
 * Сызықтық график
 * @param svg   — <svg> элементі
 * @param pts   — [{ t: уақыт, v: мән }]
 * @param opt   — { norm: [мин, макс], dec: ондық таңба саны, animate: bool }
 */
export function lineChart(svg, pts, opt = {}) {
  const W = svg.clientWidth || 800, H = svg.clientHeight || 280;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if (pts.length < 2) {
    svg.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" class="ch-empty">${opt.emptyText || '…'}</text>`;
    return;
  }
  const pad = { l: 42, r: 14, t: 14, b: 26 };
  const dec = opt.dec ?? 1;
  const vals = pts.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (opt.norm) { lo = Math.min(lo, opt.norm[0]); hi = Math.max(hi, opt.norm[1]); }
  const m = (hi - lo) * 0.15 || 1; lo -= m; hi += m;

  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const x = t => pad.l + (t - t0) / ((t1 - t0) || 1) * (W - pad.l - pad.r);
  const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const P = pts.map(p => [x(p.t), y(p.v)]);
  const line = smoothPath(P);
  const area = `${line} L${r1(P.at(-1)[0])},${H - pad.b} L${r1(P[0][0])},${H - pad.b} Z`;

  let g = '';
  for (let i = 0; i <= 4; i++) {               // көлденең тор және мәндер
    const v = lo + (hi - lo) * i / 4, yy = r1(y(v));
    g += `<line class="grid-l" x1="${pad.l}" x2="${W - pad.r}" y1="${yy}" y2="${yy}"/>`;
    g += `<text class="ax" x="${pad.l - 8}" y="${yy + 4}" text-anchor="end">${v.toFixed(dec === 0 ? 0 : 1)}</text>`;
  }
  let band = '';
  if (opt.norm) {                                 // норма аймағы
    const a = y(opt.norm[1]), b = y(opt.norm[0]);
    band = `<rect class="band" x="${pad.l}" y="${r1(a)}" width="${W - pad.l - pad.r}" height="${r1(b - a)}"/>
      <line class="band-l" x1="${pad.l}" x2="${W - pad.r}" y1="${r1(a)}" y2="${r1(a)}"/>
      <line class="band-l" x1="${pad.l}" x2="${W - pad.r}" y1="${r1(b)}" y2="${r1(b)}"/>`;
  }
  const mid = pts[Math.floor(pts.length / 2)];
  const xl = `<text class="ax" x="${pad.l}" y="${H - 6}">${hms(t0)}</text>
    ${pts.length >= 6 ? `<text class="ax" x="${r1(x(mid.t))}" y="${H - 6}" text-anchor="middle">${hms(mid.t)}</text>` : ''}
    <text class="ax" x="${W - pad.r}" y="${H - 6}" text-anchor="end">${hms(t1)}</text>`;
  const last = P.at(-1);

  svg.innerHTML = `
    <defs><linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:var(--accent);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/>
    </linearGradient></defs>
    ${g}${band}
    <path d="${area}" fill="url(#areaG)"/>
    <path d="${line}" class="ln${opt.animate ? ' draw' : ''}" pathLength="1"/>
    <circle class="pt-halo" cx="${r1(last[0])}" cy="${r1(last[1])}" r="7"/>
    <circle class="pt" cx="${r1(last[0])}" cy="${r1(last[1])}" r="4.5"/>
    ${xl}`;
}

/**
 * Дөңгелек диаграмма (donut)
 * @param parts — [{ label, v, color }]
 */
export function donut(svg, parts, centerText, subText) {
  const R = 52, C = 2 * Math.PI * R;
  const total = parts.reduce((s, p) => s + p.v, 0) || 1;
  if (!svg.dataset.ready) {
    svg.innerHTML = `<circle class="d-track" cx="70" cy="70" r="${R}"/>
      <g transform="rotate(-90 70 70)">${parts.map(() => `<circle class="seg-c" cx="70" cy="70" r="${R}"/>`).join('')}</g>
      <text class="d-total" x="70" y="72" text-anchor="middle"></text>
      <text class="d-sub" x="70" y="88" text-anchor="middle"></text>`;
    svg.dataset.ready = '1';
  }
  let acc = 0;
  svg.querySelectorAll('.seg-c').forEach((c, i) => {
    const len = parts[i].v / total * C;
    const gap = len > 3 ? 2.5 : 0;
    c.style.stroke = parts[i].color;
    c.style.strokeDasharray = `${Math.max(0, len - gap)} ${C}`;
    c.style.strokeDashoffset = `${-acc}`;
    acc += len;
  });
  svg.querySelector('.d-total').textContent = centerText;
  svg.querySelector('.d-sub').textContent = subText;
}
