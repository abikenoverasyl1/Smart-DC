// ============================================================
//  3D сахна (тек CSS 3D, кітапханасыз)
//  Деректер орталығының 3D моделі: 2 сервер стойкасы, кондиционер, UPS.
//  Модель деректерге байланысты: құрылғы өшсе — сөнеді,
//  температура қауіпті болса — жарық қызарады.
// ============================================================

// Текше (cube) жасау: w — ені, h — биіктігі, d — тереңдігі
function cube(cls, { w, h, d, x, z }, faces) {
  return `<div class="cube ${cls}" style="--w:${w}px;--h:${h}px;--d:${d}px;--x:${x}px;--z:${z}px">
    <div class="face f-front">${faces.front || ''}</div>
    <div class="face f-back"></div>
    <div class="face f-left">${faces.side || ''}</div>
    <div class="face f-right">${faces.side || ''}</div>
    <div class="face f-top">${faces.top || ''}</div>
  </div>`;
}

const rackFront = () => {
  let u = '';
  for (let i = 0; i < 8; i++) {
    u += `<div class="unit"><i class="l3 g" style="animation-delay:${(Math.random() * -1.5).toFixed(2)}s"></i>
      <i class="l3 a" style="animation-delay:${(Math.random() * -1.5).toFixed(2)}s"></i><span></span></div>`;
  }
  return `<div class="rack-face">${u}</div><div class="strip"></div>`;
};
const vents = '<div class="vents"></div>';

export function build3D(root) {
  const particles = Array.from({ length: 14 }, (_, i) => {
    const sz = -60 + Math.random() * 40, ey = -40 - Math.random() * 140;
    return `<i class="p3" style="--sx:-150px;--sy:${-60 - Math.random() * 80}px;--sz:${sz}px;
      --ex:${40 + Math.random() * 90}px;--ey:${ey}px;--ez:${10 + Math.random() * 40}px;
      animation-delay:${(-i * 0.25).toFixed(2)}s"></i>`;
  }).join('');

  root.innerHTML = `
    <div class="stage3d">
      <div class="world" id="world">
        <div class="floor"><div class="floor-glow"></div></div>
        ${cube('ac3d', { w: 74, h: 160, d: 64, x: -170, z: -40 }, {
          front: `<div class="ac-display"><b id="ac3dTemp">--</b><small>°C</small></div>
                  <div class="grille"><div class="blades"></div></div>`,
          side: vents, top: '<div class="fan-top"><div class="blades"></div></div>'
        })}
        ${cube('rack3d', { w: 84, h: 200, d: 96, x: -58, z: 0 }, { front: rackFront(), side: vents })}
        ${cube('rack3d', { w: 84, h: 200, d: 96, x: 42, z: 0 }, { front: rackFront(), side: vents })}
        ${cube('ups3d', { w: 70, h: 76, d: 70, x: 150, z: 34 }, {
          front: `<div class="ups-face"><div class="ups-bar"><i id="ups3dFill"></i></div><svg class="ups-bolt" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg></div>`,
          side: vents
        })}
        <div class="air3d">${particles}</div>
      </div>
    </div>
    <div class="scene-label glass"><i></i><span id="sceneLabel"></span></div>`;

  const [rackA, rackB] = root.querySelectorAll('.rack3d');
  const world = root.querySelector('#world');

  // Тышқанға және айналдыруға (scroll) байланысты камера бұрышы
  let tx = 0, ty = 0, cx = 0, cy = 0, visible = true, t0 = performance.now();
  addEventListener('pointermove', e => {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  (function loop(now) {
    if (visible) {
      cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;     // тегіс қозғалыс
      const sway = reduce ? 0 : Math.sin((now - t0) / 4000) * 6;
      const sp = Math.min(1, scrollY / innerHeight);
      world.style.transform =
        `rotateX(${-24 + cy * 6 + sp * 14}deg) rotateY(${-32 + cx * 14 + sway + sp * 40}deg) translateY(60px)`;
    }
    requestAnimationFrame(loop);
  })(t0);

  return { root, rackA, rackB };
}

// Модельді ағымдағы күйге сәйкестендіру
export function update3D(ctx, S, level, t) {
  const { root, rackA, rackB } = ctx;
  const d = S.devices;
  rackA.classList.toggle('off', !d.rackA.on);
  rackB.classList.toggle('off', !d.rackB.on);
  const cooling = (d.ac1.on || d.ac2.on);
  root.classList.toggle('cooling', cooling);
  root.classList.toggle('turbo', (d.ac1.on && d.ac1.mode === 'turbo') || (d.ac2.on && d.ac2.mode === 'turbo'));
  root.classList.toggle('ups-on', d.ups.on);
  root.dataset.lvl = level;
  root.style.setProperty('--blink3', `${(1.6 - S.sensors.load / 80).toFixed(2)}s`);
  const tempEl = root.querySelector('#ac3dTemp');
  if (tempEl) tempEl.textContent = S.sensors.temp.toFixed(1);
  const f = root.querySelector('#ups3dFill');
  if (f) f.style.height = d.ups.battery + '%';
  root.querySelector('#sceneLabel').textContent = t('scene.label', { s: '@scene.' + level });
}
