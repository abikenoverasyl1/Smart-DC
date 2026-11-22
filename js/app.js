// ============================================================
//  Smart Data Center — негізгі логика
//  Датчиктер симуляциясы · құрылғыларды басқару · автоматика
//  ескертулер · графиктер · журнал · тақырып · тіл
// ============================================================
import * as db from './db.js';
import { lineChart, donut } from './charts.js';
import { build3D, update3D } from './scene3d.js';
import { t, applyStatic, setLang, getLang, locale, LANGS } from './i18n.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const CLIENT = Math.random().toString(36).slice(2, 9);   // осы браузердің идентификаторы
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = a => (Math.random() * 2 - 1) * a;
const fmt = (v, d = 0) => Number(v).toFixed(d);
const today = () => new Date().toISOString().slice(0, 10);
const timeStr = ts => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/* ---------------- 1. Анықтамалар ---------------- */
const ICONS = {
  thermo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v7"/></svg>',
  drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z"/></svg>',
  cpu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
};

// Виртуалды датчиктер (norm — қалыпты аралық)
const SENSORS = [
  { id: 'temp', unit: '°C', min: 10, max: 45, step: 0.1, dec: 1, norm: [18, 27], icon: 'thermo' },
  { id: 'hum', unit: '%', min: 10, max: 90, step: 1, dec: 0, norm: [40, 60], icon: 'drop' },
  { id: 'load', unit: '%', min: 0, max: 100, step: 1, dec: 0, norm: [0, 80], icon: 'cpu' },
  { id: 'volt', unit: 'V', min: 0, max: 260, step: 1, dec: 0, norm: [210, 240], icon: 'bolt' },
];
const SENSOR = Object.fromEntries(SENSORS.map(s => [s.id, s]));

// Құрылғылар: режимдер [кілт, қуаты kW, салқындату күші]
const AC_MODES = [['eco', 3, 0.6], ['normal', 5, 1], ['turbo', 8, 1.6], ['dry', 4, 0.7]];
const DEVICES = [
  { id: 'ac1', type: 'ac', modes: AC_MODES },
  { id: 'ac2', type: 'ac', modes: AC_MODES, note: 'note.reserve' },
  { id: 'fans', type: 'fan', modes: [['low', 0.6, 0.2], ['mid', 1.2, 0.4], ['high', 2, 0.7]] },
  { id: 'ups', type: 'ups', modes: null },
  { id: 'rackA', type: 'rack', modes: [['perf', 1, 0], ['save', 0.75, 0]] },
  { id: 'rackB', type: 'rack', modes: [['perf', 1, 0], ['save', 0.75, 0]] },
];
const DEVICE = Object.fromEntries(DEVICES.map(d => [d.id, d]));
const modeOf = id => DEVICE[id].modes?.find(m => m[0] === S.devices[id].mode);

// Автоматтандыру ережелері
const RULES = [
  { id: 'r1', sensor: 'temp', op: '>' },
  { id: 'r2', sensor: 'temp', op: '<' },
  { id: 'r3', sensor: 'load', op: '>' },
  { id: 'r4', sensor: 'volt', op: '<' },
  { id: 'r5', sensor: 'hum', op: '>' },
];

const defaultState = () => ({
  sensors: { temp: 23.5, hum: 48, load: 52, volt: 221 },
  devices: {
    ac1: { on: true, mode: 'normal', auto: false },
    ac2: { on: false, mode: 'normal' },
    fans: { on: true, mode: 'mid' },
    ups: { on: false, battery: 100, auto: false },
    rackA: { on: true, mode: 'perf' },
    rackB: { on: true, mode: 'perf' },
  },
  rules: { r1: { on: true, v: 27 }, r2: { on: true, v: 20 }, r3: { on: true, v: 80 }, r4: { on: true, v: 200 }, r5: { on: true, v: 60 } },
  autoSim: true,
  energyKwh: 0,
  energyDay: today(),
});

// Деректер қорынан келген күйді әдепкі күймен біріктіру
function merge(base, saved) {
  if (!saved) return base;
  for (const k of ['sensors', 'devices', 'rules']) {
    for (const id in base[k]) {
      const v = saved[k]?.[id];
      if (v === undefined) continue;
      base[k][id] = typeof base[k][id] === 'object' ? { ...base[k][id], ...v } : v;
    }
  }
  for (const k of ['autoSim', 'energyKwh', 'energyDay']) if (saved[k] !== undefined) base[k] = saved[k];
  if (base.energyDay !== today()) { base.energyKwh = 0; base.energyDay = today(); }
  return base;
}

/* ---------------- 2. Күй (state) ---------------- */
let S = defaultState();
let readings = [];      // графикке арналған тарих
let events = [];        // журнал
let levels = {};        // әр көрсеткіштің ескерту деңгейі
let hold = {};          // қолмен өзгертілген датчиктің симуляциясын уақытша тоқтату
let chartMetric = 'temp';
let logFilter = 'all';
let tickN = 0;
let scene = null;       // 3D сахна
let dbMode = 'local';

/* ---------------- 3. Есептеулер ---------------- */
function devicePower(id) {
  const d = S.devices[id], def = DEVICE[id];
  if (!d.on) return 0;
  if (def.type === 'ups') return 0.4;
  if (def.type === 'rack') return (2 + S.sensors.load * 0.05) * modeOf(id)[1];
  return modeOf(id)[1];
}
const totalPower = () => DEVICES.reduce((s, d) => s + devicePower(d.id), 0);
const coolingPower = () => ['ac1', 'ac2', 'fans'].reduce((s, id) => s + (S.devices[id].on ? modeOf(id)[2] : 0), 0);

// Ескерту деңгейі: ok / warn / crit
function levelOf(id, v) {
  switch (id) {
    case 'temp': return v >= 35 ? 'crit' : (v > 27 || v < 15) ? 'warn' : 'ok';
    case 'hum': return (v < 25 || v > 75) ? 'crit' : (v < 40 || v > 60) ? 'warn' : 'ok';
    case 'load': return v >= 95 ? 'crit' : v > 80 ? 'warn' : 'ok';
    case 'volt': return v < 200 ? 'crit' : (v < 210 || v > 240) ? 'warn' : 'ok';
    case 'battery': return !S.devices.ups.on ? 'ok' : v < 5 ? 'crit' : v < 20 ? 'warn' : 'ok';
  }
  return 'ok';
}
const RANK = { ok: 0, warn: 1, crit: 2 };
const ALERT_IDS = ['temp', 'hum', 'load', 'volt', 'battery'];
const valFmt = (id, v) => fmt(v, id === 'temp' ? 1 : 0);

/* ---------------- 4. Симуляция ---------------- */
// Кондиционер қосулы болса температура төмендейді, жүктеме жоғары болса көтеріледі.
function simulate() {
  const s = S.sensors, d = S.devices, now = Date.now();
  const held = id => hold[id] && hold[id] > now;
  const racksOn = (d.rackA.on ? 1 : 0) + (d.rackB.on ? 1 : 0);
  if (!held('load')) s.load = clamp(s.load + (55 - s.load) * 0.04 + rnd(2.5), 0, 100);
  if (!held('temp')) {
    const target = 22 + s.load * 0.12 * (racksOn / 2) - coolingPower() * 3;
    s.temp = clamp(s.temp + (target - s.temp) * 0.12 + rnd(0.12), 10, 45);
  }
  if (!held('hum')) {
    const dry = d.ac1.on && d.ac1.mode === 'dry' ? 0.9 : 0;
    s.hum = clamp(s.hum + (50 - s.hum) * 0.03 + rnd(0.6) - dry, 10, 90);
  }
  if (!held('volt') && s.volt >= 150) s.volt = clamp(s.volt + (221 - s.volt) * 0.05 + rnd(0.8), 0, 260);
}

// UPS батареясы: желі жоқ кезде разрядталады, бар кезде зарядталады
function upsBattery() {
  const u = S.devices.ups;
  if (u.on && S.sensors.volt < 200) u.battery = Math.max(0, u.battery - 1.2);
  else u.battery = Math.min(100, u.battery + 0.6);
  if (u.on && u.battery <= 0) {
    u.on = false; u.auto = false;
    logEvent('alert', 'crit', 'ev.upsEmpty');
    toast('crit', 'toast.crit', 'ev.upsEmpty');
  }
}

function energy(sec) {
  if (S.energyDay !== today()) { S.energyKwh = 0; S.energyDay = today(); }
  S.energyKwh += totalPower() * sec / 3600;   // kWh = kW × сағат
}

/* ---------------- 5. Автоматтандыру ---------------- */
function runAutomation() {
  const s = S.sensors, d = S.devices, r = S.rules;
  const fire = (id, key, p, action) => {
    action();
    r[id].last = Date.now();
    logEvent('auto', 'info', key, p);
    toast('info', 'toast.auto', key, p);
    const el = $(`.rule[data-id="${id}"]`);
    if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  };
  const T = fmt(s.temp, 1), H = fmt(s.hum), L = fmt(s.load), V = fmt(s.volt);

  if (r.r1.on && s.temp > r.r1.v && !(d.ac2.on && d.ac2.mode === 'turbo'))
    fire('r1', 'a.r1', { v: T, th: r.r1.v }, () => { d.ac2.on = true; d.ac2.mode = 'turbo'; });
  if (r.r2.on && s.temp < r.r2.v && d.ac2.on)
    fire('r2', 'a.r2', { v: T, th: r.r2.v }, () => { d.ac2.on = false; });
  if (r.r3.on && s.load > r.r3.v && !(d.fans.on && d.fans.mode === 'high'))
    fire('r3', 'a.r3', { v: L, th: r.r3.v }, () => { d.fans.on = true; d.fans.mode = 'high'; });
  if (r.r4.on && s.volt < r.r4.v && !d.ups.on && d.ups.battery > 5)
    fire('r4', 'a.r4on', { v: V, th: r.r4.v }, () => { d.ups.on = true; d.ups.auto = true; });
  if (r.r4.on && s.volt >= 210 && d.ups.on && d.ups.auto)
    fire('r4', 'a.r4off', { v: V }, () => { d.ups.on = false; d.ups.auto = false; });
  if (r.r5.on && s.hum > r.r5.v && !(d.ac1.on && d.ac1.mode === 'dry'))
    fire('r5', 'a.r5on', { v: H, th: r.r5.v }, () => { d.ac1.on = true; d.ac1.mode = 'dry'; d.ac1.auto = true; });
  if (r.r5.on && s.hum < r.r5.v - 8 && d.ac1.on && d.ac1.mode === 'dry' && d.ac1.auto)
    fire('r5', 'a.r5off', { v: H }, () => { d.ac1.mode = 'normal'; d.ac1.auto = false; });
}

/* ---------------- 6. Ескертулер ---------------- */
function checkAlerts(silent = false) {
  const vals = { ...S.sensors, battery: S.devices.ups.battery };
  for (const id of ALERT_IDS) {
    const lvl = levelOf(id, vals[id]);
    const prev = levels[id] || 'ok';
    if (!silent && lvl !== prev) {
      if (lvl === 'ok') logEvent('alert', 'ok', 'al.ok', { name: '@s.' + id });
      else {
        const key = `al.${id}.${lvl}`, p = { v: valFmt(id, vals[id]) };
        logEvent('alert', lvl, key, p);
        if (RANK[lvl] > RANK[prev]) toast(lvl, lvl === 'crit' ? 'toast.crit' : 'toast.warn', key, p);
      }
    }
    levels[id] = lvl;
  }
}
const systemLevel = () => Object.values(levels).reduce((a, l) => RANK[l] > RANK[a] ? l : a, 'ok');

/* ---------------- 7. Журнал ---------------- */
// Оқиға кілт + параметр түрінде сақталады, сондықтан кез келген тілде көрсетіледі
function logEvent(type, level, key, p = {}) {
  const e = { t: Date.now(), type, level, key, p };
  events.unshift(e);
  events = events.slice(0, 100);
  renderLog();
  db.addEvent(e).catch(err => console.warn(err));
}
const eventText = e => e.key ? t(e.key, e.p || {}) : (e.msg || '');

/* ---------------- 8. Сақтау ---------------- */
let saveTimer;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    S.by = CLIENT; S.updated = Date.now();
    db.saveState(JSON.parse(JSON.stringify(S))).catch(err => console.warn(err));
  }, 400);
}

let lastReading = 0;
function pushReading(force = false) {
  const now = Date.now();
  if (!force && now - lastReading < 1500) return;
  lastReading = now;
  const r = { t: now, temp: +fmt(S.sensors.temp, 1), hum: Math.round(S.sensors.hum), load: Math.round(S.sensors.load), volt: Math.round(S.sensors.volt), power: +fmt(totalPower(), 2) };
  readings.push(r);
  readings = readings.slice(-60);
  db.addReading(r).catch(err => console.warn(err));
  renderChart();
}

/* ---------------- 9. Интерфейсті құру ---------------- */
const C75 = 2 * Math.PI * 50 * 0.75;   // 270° доғаның ұзындығы

function buildSensors() {
  $('#sensorGrid').innerHTML = SENSORS.map(s => `
    <article class="glass card sensor reveal" data-id="${s.id}">
      <div class="s-head"><span class="ico">${ICONS[s.icon]}</span>
        <div><h3 data-i18n="s.${s.id}"></h3><p data-i18n="s.${s.id}.d"></p></div></div>
      <div class="gauge" aria-hidden="true">
        <svg viewBox="0 0 120 120"><g transform="rotate(135 60 60)">
          <circle class="track" cx="60" cy="60" r="50" style="stroke-dasharray:${C75} 400"/>
          <circle class="arc" cx="60" cy="60" r="50" style="stroke-dasharray:0 400"/></g></svg>
        <div class="gauge-val"><b class="num">—</b><span>${s.unit}</span></div>
      </div>
      <input type="range" class="range" id="rng-${s.id}" min="${s.min}" max="${s.max}" step="${s.step}" data-i18n-aria="s.${s.id}">
      <div class="s-foot"><span><span data-i18n="norm"></span>: ${s.norm[0]}–${s.norm[1]} ${s.unit}</span><span class="lvl-text"></span></div>
    </article>`).join('');

  $$('#sensorGrid .sensor').forEach(card => {
    const id = card.dataset.id;
    $('.range', card).addEventListener('input', e => {
      S.sensors[id] = parseFloat(e.target.value);
      hold[id] = Date.now() + 8000;      // 8 секунд симуляция бұл датчикті өзгертпейді
      renderSensor(id);
      renderKpis();
      scheduleEvaluate();
    });
  });
}

function deviceVisual(def) {
  if (def.type === 'fan') {
    const blades = [0, 90, 180, 270].map(a => `<path transform="rotate(${a})" d="M0,-4 C6,-26 24,-34 30,-22 C26,-12 10,-4 0,-4Z" fill="rgba(255,255,255,.85)"/>`).join('');
    const fan = x => `<g transform="translate(${x} 55)"><circle r="44" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.25)"/>
      <g class="fan-rot anim">${blades}</g><circle r="6" fill="#F6B38E"/></g>`;
    return `<svg viewBox="0 0 220 110" aria-hidden="true">${fan(56)}${fan(164)}</svg>`;
  }
  if (def.type === 'ac') {
    const wave = (x, cls) => `<path class="air anim ${cls}" d="M${x},66 q6,5 12,0 t12,0 t12,0" fill="none" stroke="rgba(214,226,246,.8)" stroke-width="2" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 220 110" aria-hidden="true">
      <rect x="20" y="8" width="180" height="48" rx="14" fill="rgba(255,255,255,.14)" stroke="rgba(255,255,255,.35)"/>
      <path d="M36 44h148M36 49h148" stroke="rgba(255,255,255,.3)" stroke-linecap="round"/>
      <circle cx="182" cy="22" r="3.5" fill="#F6B38E" class="led anim" style="--blink:2s"/>
      <text x="36" y="30" fill="rgba(255,255,255,.75)" font-size="12" font-family="Montserrat, sans-serif" font-weight="600">${def.id === 'ac1' ? 'AC-1' : 'AC-2'}</text>
      ${wave(44, 'd1')}${wave(92, 'd2')}${wave(140, 'd3')}</svg>`;
  }
  if (def.type === 'rack') {
    let units = '';
    for (let i = 0; i < 6; i++) {
      const y = 10 + i * 15.5;
      units += `<rect x="66" y="${y}" width="88" height="12" rx="3" fill="rgba(255,255,255,.1)"/>
        <path d="M100 ${y + 6}h44" stroke="rgba(255,255,255,.18)" stroke-dasharray="2 3"/>
        <circle cx="74" cy="${y + 6}" r="2.4" fill="#A9E3C6" class="led anim" style="animation-delay:${(Math.random() * -1.5).toFixed(2)}s"/>
        <circle cx="83" cy="${y + 6}" r="2.4" fill="#F6B38E" class="led anim" style="animation-delay:${(Math.random() * -1.5).toFixed(2)}s"/>`;
    }
    return `<svg viewBox="0 0 220 110" aria-hidden="true"><rect x="60" y="4" width="100" height="102" rx="9" fill="rgba(10,12,28,.35)" stroke="rgba(255,255,255,.28)"/>${units}</svg>`;
  }
  return `<svg viewBox="0 0 220 110" aria-hidden="true">
    <defs><clipPath id="batClip"><rect x="34" y="34" width="132" height="42" rx="6"/></clipPath></defs>
    <rect x="28" y="28" width="144" height="54" rx="12" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2"/>
    <rect x="174" y="44" width="8" height="22" rx="3" fill="rgba(255,255,255,.4)"/>
    <g clip-path="url(#batClip)">
      <rect class="bat-fill" x="34" y="34" width="132" height="42" fill="#A9E3C6" style="transition:width .8s"/>
      <rect class="chg anim" x="34" y="34" width="26" height="42" fill="rgba(255,255,255,.35)"/>
    </g>
    <path class="bolt anim" d="M104 38 92 58h10l-4 14 14-21h-10l4-13Z" fill="#14151F"/></svg>`;
}

function buildDevices() {
  $('#deviceGrid').innerHTML = DEVICES.map(def => `
    <article class="glass card device reveal" data-id="${def.id}">
      <div class="dev-visual">${deviceVisual(def)}</div>
      <div class="dev-head">
        <div><h3 id="dh-${def.id}" data-i18n="d.${def.id}"></h3><p class="dev-state" id="ds-${def.id}">—</p></div>
        <button class="switch" type="button" role="switch" aria-checked="false" aria-labelledby="dh-${def.id}" aria-describedby="ds-${def.id}"></button>
      </div>
      ${def.modes ? `<div class="seg" role="group">${def.modes.map(m => `<button type="button" aria-pressed="false" data-mode="${m[0]}" data-i18n="m.${m[0]}"></button>`).join('')}</div>`
        : `<div class="battery"><span data-i18n="battery"></span><span class="bar" aria-hidden="true"><i></i></span><b class="bat-val">100%</b></div>`}
    </article>`).join('');

  $$('#deviceGrid .device').forEach(card => {
    const id = card.dataset.id;
    $('.switch', card).addEventListener('click', () => {
      const d = S.devices[id];
      d.on = !d.on; d.auto = false;
      logEvent('control', 'info', d.on ? 'ev.devOn' : 'ev.devOff', { name: '@d.' + id });
      afterControl();
    });
    $$('.seg button', card).forEach(b => b.addEventListener('click', () => {
      const d = S.devices[id];
      if (d.mode === b.dataset.mode && d.on) return;
      d.mode = b.dataset.mode; d.on = true; d.auto = false;
      logEvent('control', 'info', 'ev.mode', { name: '@d.' + id, mode: '@m.' + b.dataset.mode });
      afterControl();
    }));
  });
}

function buildRules() {
  $('#ruleList').innerHTML = RULES.map(r => {
    const s = SENSOR[r.sensor];
    return `<div class="rule glass reveal" data-id="${r.id}">
      <button class="switch" type="button" role="switch" aria-checked="true"></button>
      <div class="rule-text"><span class="kw" data-i18n="kw.if"></span> <span data-i18n="s.${s.id}"></span> ${r.op}
        <input class="rule-num" type="number" inputmode="decimal" step="1" min="${s.min}" max="${s.max}"> ${s.unit}
        <span class="kw then" data-i18n="kw.then"></span> <span data-i18n="${r.id}.then"></span></div>
      <span class="rule-last"></span></div>`;
  }).join('');

  $$('#ruleList .rule').forEach(el => {
    const id = el.dataset.id, ID = id.toUpperCase();
    $('.switch', el).addEventListener('click', () => {
      S.rules[id].on = !S.rules[id].on;
      logEvent('control', 'info', S.rules[id].on ? 'ev.ruleOn' : 'ev.ruleOff', { id: ID });
      afterControl();
    });
    $('.rule-num', el).addEventListener('change', e => {
      const s = SENSOR[RULES.find(r => r.id === id).sensor];
      let v = parseFloat(e.target.value);
      if (isNaN(v)) v = S.rules[id].v;
      v = clamp(v, s.min, s.max);
      // R2 шегі әрқашан R1-ден кіші болуы керек (қайшылық болмас үшін)
      if (id === 'r1') v = Math.max(v, S.rules.r2.v + 2);
      if (id === 'r2') v = Math.min(v, S.rules.r1.v - 2);
      S.rules[id].v = v; e.target.value = v;
      logEvent('control', 'info', 'ev.ruleVal', { id: ID, v, u: s.unit });
      afterControl();
    });
  });
}

const METRICS = [
  { id: 'temp', unit: '°C', dec: 1, norm: [18, 27] },
  { id: 'hum', unit: '%', dec: 0, norm: [40, 60] },
  { id: 'load', unit: '%', dec: 0, norm: [0, 80] },
  { id: 'volt', unit: 'V', dec: 0, norm: [210, 240] },
  { id: 'power', unit: 'kW', dec: 1, norm: null },
];
function buildChartTabs() {
  $('#chartTabs').innerHTML = METRICS.map(m => `<button class="tab" type="button" role="tab" id="tab-${m.id}" aria-controls="chartPanel"
    aria-selected="${m.id === chartMetric}" tabindex="${m.id === chartMetric ? 0 : -1}" data-m="${m.id}" data-i18n="mt.${m.id}"></button>`).join('');
  $$('#chartTabs .tab').forEach(b => b.addEventListener('click', () => {
    chartMetric = b.dataset.m;
    selectTab($('#chartTabs'), b);
    $('#chartPanel').setAttribute('aria-labelledby', b.id);
    renderChart(true);
    const svg = $('#lineChart');                    // 3D аудару анимациясы
    svg.classList.remove('flip'); void svg.getBoundingClientRect(); svg.classList.add('flip');
  }));
}

// Қойындылар: таңдалғанын белгілеу + көрсеткі пернелерімен ауысу
function selectTab(list, btn) {
  $$('.tab', list).forEach(x => {
    const on = x === btn;
    x.setAttribute('aria-selected', on);
    x.tabIndex = on ? 0 : -1;
  });
}
function initTablistKeys(list) {
  list.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = $$('.tab', list), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[n].focus(); tabs[n].click();
  });
}

/* ---------------- 10. Көрсету (render) ---------------- */
function tweenNum(el, to, dec) {
  if (!el) return;
  const from = parseFloat(el.dataset.v ?? to);
  el.dataset.v = to;
  if (from === to) { el.textContent = fmt(to, dec); return; }
  const t0 = performance.now(), dur = 650;
  cancelAnimationFrame(el._raf);
  const step = now => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e, dec);
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function renderSensor(id) {
  const s = SENSOR[id], v = S.sensors[id], card = $(`.sensor[data-id="${id}"]`);
  const p = (v - s.min) / (s.max - s.min);
  const lvl = levelOf(id, v);
  card.dataset.lvl = lvl;
  $('.arc', card).style.strokeDasharray = `${(C75 * p).toFixed(1)} 400`;
  tweenNum($('.num', card), +fmt(v, s.dec), s.dec);
  $('.lvl-text', card).textContent = t('lvl.' + lvl);
  const range = $('.range', card);
  if (document.activeElement !== range) range.value = v;
  range.style.setProperty('--p', (p * 100).toFixed(1) + '%');
  range.setAttribute('aria-valuetext', `${fmt(v, s.dec)} ${s.unit}, ${t('lvl.' + lvl)}`);
}

function renderDevices() {
  for (const def of DEVICES) {
    const d = S.devices[def.id], card = $(`.device[data-id="${def.id}"]`);
    card.classList.toggle('is-on', d.on);
    $('.switch', card).setAttribute('aria-checked', d.on);
    const m = modeOf(def.id);
    let txt = d.on ? `${t('dev.on')}${m ? ' · ' + t('m.' + m[0]) : ''} · ${fmt(devicePower(def.id), 1)} kW` : t('dev.off');
    if (def.type === 'ups') txt = d.on ? t(S.sensors.volt < 200 ? 'ups.active' : 'ups.standby') : t('ups.charging');
    if (d.on && d.auto) txt += ' · ' + t('dev.auto');
    if (def.note && !d.on) txt += ' · ' + t(def.note);
    $('.dev-state', card).textContent = txt;
    const seg = $('.seg', card);
    if (seg) seg.setAttribute('aria-label', t('dev.modes', { name: '@d.' + def.id }));
    $$('.seg button', card).forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === d.mode));

    const svg = $('.dev-visual svg', card);
    if (def.type === 'fan') svg.style.setProperty('--spd', { low: '2.4s', mid: '1.1s', high: '.45s' }[d.mode]);
    if (def.type === 'ac') svg.style.setProperty('--spd', { eco: '2.4s', normal: '1.6s', turbo: '.8s', dry: '2s' }[d.mode]);
    if (def.type === 'rack') svg.style.setProperty('--blink', `${(1.6 - S.sensors.load / 80).toFixed(2)}s`);
    if (def.type === 'ups') {
      const b = d.battery, col = b < 20 ? '#FF8F8F' : b < 50 ? '#F3D28A' : '#A9E3C6';
      $('.bat-fill', card).setAttribute('width', (132 * b / 100).toFixed(1));
      $('.bat-fill', card).setAttribute('fill', col);
      $('.battery .bar i', card).style.width = b + '%';
      $('.bat-val', card).textContent = fmt(b) + '%';
      $('.chg', card).style.display = (b < 100 && S.sensors.volt >= 200) || (d.on && S.sensors.volt < 200) ? '' : 'none';
    }
  }
}

function renderRules() {
  for (const r of RULES) {
    const el = $(`.rule[data-id="${r.id}"]`), st = S.rules[r.id], s = SENSOR[r.sensor], ID = r.id.toUpperCase();
    el.classList.toggle('off', !st.on);
    const sw = $('.switch', el);
    sw.setAttribute('aria-checked', st.on);
    sw.setAttribute('aria-label', t('rule.toggle', { id: ID }));
    const inp = $('.rule-num', el);
    inp.setAttribute('aria-label', t('rule.input', { id: ID, name: '@s.' + s.id, unit: s.unit }));
    if (document.activeElement !== inp) inp.value = st.v;
    $('.rule-last', el).textContent = st.last ? t('rule.last', { t: timeStr(st.last) }) : t('rule.never');
  }
}

function renderKpis() {
  for (const k of ['temp', 'hum', 'load']) {
    const el = $(`.kpi[data-k="${k}"]`), lvl = levelOf(k, S.sensors[k]);
    el.dataset.lvl = lvl;
    $('.kpi-lvl', el).textContent = t('lvl.' + lvl);   // экран оқу құралдары үшін (түс жалғыз белгі болмауы керек)
    tweenNum($('.num', el), +fmt(S.sensors[k], SENSOR[k].dec), SENSOR[k].dec);
  }
  tweenNum($('.kpi[data-k="power"] .num'), +fmt(totalPower(), 1), 1);
  const lvl = systemLevel(), st = $('#sysStatus');
  st.dataset.lvl = lvl;
  $('.status-text', st).textContent = t('status.' + lvl);
  const bad = Object.entries(levels).filter(([, l]) => l !== 'ok').map(([k]) => t('s.' + k));
  $('#statusSub').textContent = bad.length ? bad.join(', ') : t('status.allOk');
}

function renderChart(animate = false) {
  const m = METRICS.find(x => x.id === chartMetric);
  const pts = readings.map(r => ({ t: r.t, v: r[m.id] })).filter(p => p.v !== undefined);
  lineChart($('#lineChart'), pts, { norm: m.norm, dec: m.dec, animate, emptyText: t('chart.empty') });
  const vals = pts.map(p => p.v);
  const has = vals.length > 0;
  const mn = has ? Math.min(...vals) : 0, mx = has ? Math.max(...vals) : 0;
  const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
  const stat = (key, v) => `<div class="stat"><span>${t(key)}</span><b>${has ? fmt(v, m.dec) : '—'} <small class="muted">${m.unit}</small></b></div>`;
  $('#stats').innerHTML = stat('st.cur', vals.at(-1)) + stat('st.min', mn) + stat('st.avg', avg) + stat('st.max', mx);
  $('#chartInfo').textContent = t('chart.info', { n: pts.length, u: m.unit });
  $('#lineChart').setAttribute('aria-label', t('chart.aria', {
    name: '@mt.' + m.id, n: pts.length, u: m.unit,
    cur: has ? fmt(vals.at(-1), m.dec) : '—', min: has ? fmt(mn, m.dec) : '—', max: has ? fmt(mx, m.dec) : '—',
  }));
}

const DONUT_COLORS = ['#F6B38E', '#C9CFDC', '#9AA6BD', '#6F7B97', '#4F5875', '#C8B6E2'];
function renderEnergy() {
  const parts = DEVICES.map((d, i) => ({ label: t('d.' + d.id), v: devicePower(d.id), color: DONUT_COLORS[i] }));
  donut($('#donut'), parts, fmt(totalPower(), 1), 'kW');
  $('#legend').innerHTML = parts.map(p => `<li><i style="background:${p.color}"></i><span>${p.label}</span><b>${fmt(p.v, 1)} kW</b></li>`).join('');
  tweenNum($('#energyToday'), +fmt(S.energyKwh, 2), 2);
  $('#activeCount').textContent = `${DEVICES.filter(d => S.devices[d.id].on).length} / ${DEVICES.length}`;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  $('#alertCount').textContent = events.filter(e => e.type === 'alert' && e.level !== 'ok' && e.t >= dayStart).length;
}

function renderLog() {
  const list = events.filter(e => logFilter === 'all' || e.type === logFilter);
  $('#logList').innerHTML = list.length ? list.map(e => {
    const d = new Date(e.t);
    const lvlWord = (e.level === 'warn' || e.level === 'crit' || (e.level === 'ok' && e.type === 'alert')) ? ` · <em>${t('lvl.' + e.level)}</em>` : '';
    return `<li><span class="log-time">${timeStr(e.t)}<br>${d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })}</span>
      <span class="log-type lv-${e.level}"><i aria-hidden="true"></i><span>${t('type.' + e.type)}${lvlWord}</span></span><span>${eventText(e)}</span></li>`;
  }).join('') : `<li class="log-empty">${t('log.empty')}</li>`;
  const bad = Object.values(levels).filter(l => l !== 'ok').length;
  const badge = $('#navBadge');
  badge.hidden = !bad; badge.textContent = bad;
}

function renderAll() {
  SENSORS.forEach(s => renderSensor(s.id));
  renderDevices();
  renderRules();
  renderKpis();
  renderEnergy();
  $('#autoSim').setAttribute('aria-checked', S.autoSim);
  if (scene) update3D(scene, S, systemLevel(), t);
}

/* ---------------- 11. Хабарламалар ---------------- */
// Апаттық хабарлама role="alert" — экран оқу құралы оны бірден оқиды
function toast(level, titleKey, key, p = {}) {
  const el = document.createElement('div');
  el.className = `toast glass ${level}`;
  el.setAttribute('role', level === 'crit' ? 'alert' : 'status');
  el.innerHTML = `<i aria-hidden="true"></i><div><b>${t(titleKey)}</b><p>${t(key, p)}</p></div>`;
  $('#toasts').prepend(el);
  while ($('#toasts').children.length > 4) $('#toasts').lastElementChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, level === 'crit' ? 8000 : 5000);
}

/* ---------------- 12. Жұмыс циклі ---------------- */
function evaluate() {
  runAutomation();
  checkAlerts();
  renderAll();
  renderLog();
  persist();
}
let evalTimer;
function scheduleEvaluate() {
  clearTimeout(evalTimer);
  evalTimer = setTimeout(() => { evaluate(); pushReading(); }, 250);
}
function afterControl() { checkAlerts(); renderAll(); persist(); }

// Әр 2 секунд сайын: симуляция → автоматика → ескертулер → экран
function tick() {
  tickN++;
  if (S.autoSim) simulate();
  upsBattery();
  energy(2);
  runAutomation();
  checkAlerts();
  renderAll();
  if (tickN % 3 === 0) persist();      // бұлтқа ~6 секунд сайын жазамыз
}

/* ---------------- 13. Сценарийлер ---------------- */
const SCENARIOS = {
  heat: { temp: 33, load: 88 },
  outage: { volt: 0 },
  humid: { hum: 68 },
  peak: { load: 97 },
  reset: { temp: 23, hum: 48, load: 50, volt: 221 },
};
function runScenario(key) {
  for (const [k, v] of Object.entries(SCENARIOS[key])) { S.sensors[k] = v; hold[k] = Date.now() + 12000; }
  logEvent('control', 'info', 'ev.scn', { name: '@scn.' + key });
  evaluate();
  pushReading(true);
}

/* ---------------- 14. Тақырып және тіл ---------------- */
function applyThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $('#themeBtn').setAttribute('aria-label', t(dark ? 'theme.toLight' : 'theme.toDark'));
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#0C0D15' : '#E8EBF1');
}
function initTheme() {
  $('#themeBtn').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sdc_theme', next); } catch (e) { /* */ }
    applyThemeButton();
    renderChart();
  });
}
function initLang() {
  const sel = $('#langSel');
  sel.innerHTML = LANGS.map(([k, name]) => `<option value="${k}">${name}</option>`).join('');
  sel.value = getLang();
  sel.addEventListener('change', () => { setLang(sel.value); refreshTexts(); });
}
// Тіл ауысқанда барлық мәтінді жаңарту (бетті қайта жүктемей)
function refreshTexts() {
  applyStatic();
  applyThemeButton();
  setModePill(dbMode);
  renderAll(); renderLog(); renderChart();
  updateNavFade();
}

/* ---------------- 15. Беттің әсерлері ---------------- */
function initReveal() {
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  $$('.reveal').forEach((el, i) => { el.style.transitionDelay = `${(i % 5) * 70}ms`; io.observe(el); });
}

function updateNavFade() {
  const n = $('#navLinks');
  n.classList.toggle('fade-l', n.scrollLeft > 4);
  n.classList.toggle('fade-r', n.scrollLeft + n.clientWidth < n.scrollWidth - 4);
}
function initNav() {
  const links = $$('.nav-links a'), wrap = $('#navLinks');
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if (!e.isIntersecting) return;
    links.forEach(a => {
      const on = a.getAttribute('href') === '#' + e.target.id;
      a.classList.toggle('active', on);
      if (on) {
        a.setAttribute('aria-current', 'true');
        // белсенді пунктті мобильді мәзірде көрінетін жерге жылжыту
        if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollTo({ left: a.offsetLeft - wrap.clientWidth / 2 + a.offsetWidth / 2 });
      } else a.removeAttribute('aria-current');
    });
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main section').forEach(s => io.observe(s));
  wrap.addEventListener('scroll', updateNavFade, { passive: true });
  addEventListener('resize', updateNavFade);
  updateNavFade();
  addEventListener('scroll', () => $('#nav').classList.toggle('scrolled', scrollY > 40), { passive: true });
}

function initGlassPointer() {
  document.addEventListener('pointermove', e => {
    const el = e.target.closest?.('.glass');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

// Карточкалардың 3D еңкеюі
function initTilt() {
  if (matchMedia('(hover: none), (prefers-reduced-motion: reduce)').matches) return;
  $$('.card, .kpi').forEach(el => {
    el.classList.add('tilt');
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('tilting');
      el.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(6px)`;
    });
    el.addEventListener('pointerleave', () => { el.classList.remove('tilting'); el.style.transform = ''; });
  });
}

function initHeroScroll() {
  const hero = $('.hero');
  addEventListener('scroll', () => hero.style.setProperty('--sp', Math.min(1, scrollY / (innerHeight * 0.9)).toFixed(3)), { passive: true });
}

function setModePill(mode) {
  const p = $('#modePill');
  p.classList.toggle('fb', mode === 'firebase');
  $('span', p).textContent = t(mode === 'firebase' ? 'mode.firebase' : 'mode.local');
  p.title = t(mode === 'firebase' ? 'mode.fbTitle' : 'mode.localTitle');
}

/* ---------------- 16. Іске қосу ---------------- */
async function main() {
  buildSensors(); buildDevices(); buildRules(); buildChartTabs();
  scene = build3D($('#scene3d'));
  initLang(); applyStatic(); initTheme(); applyThemeButton();
  initReveal(); initTilt(); initHeroScroll(); initNav(); initGlassPointer();
  initTablistKeys($('#chartTabs')); initTablistKeys($('#logTabs'));
  $('#modePill span').textContent = t('mode.connecting');

  dbMode = await db.initDB();
  setModePill(dbMode);
  S = merge(defaultState(), await db.loadState().catch(() => null));
  readings = await db.getReadings(60).catch(() => []);
  events = await db.getEvents(100).catch(() => []);

  checkAlerts(true);
  renderAll(); renderLog(); renderChart(true);
  logEvent('info', 'info', 'ev.start', { mode: '@' + (dbMode === 'firebase' ? 'firebase' : 'local') });

  db.onRemoteState(remote => {
    if (remote.by === CLIENT) return;
    S = merge(defaultState(), remote);
    checkAlerts(true);
    renderAll();
  });
  db.onEvents(list => { events = list; renderLog(); renderEnergy(); });

  $('#autoSim').addEventListener('click', () => {
    S.autoSim = !S.autoSim;
    logEvent('control', 'info', S.autoSim ? 'ev.simOn' : 'ev.simOff');
    afterControl();
  });
  $$('[data-scn]').forEach(b => b.addEventListener('click', () => runScenario(b.dataset.scn)));
  $$('#logTabs .tab').forEach(b => b.addEventListener('click', () => {
    logFilter = b.dataset.f;
    selectTab($('#logTabs'), b);
    renderLog();
  }));
  $$('#logTabs .tab').forEach((b, i) => { b.tabIndex = i === 0 ? 0 : -1; });
  $('#clearLog').addEventListener('click', async () => {
    events = []; renderLog();
    await db.clearEvents().catch(err => console.warn(err));
    toast('info', 'toast.log', 'toast.cleared');
  });
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => renderChart(), 150); });

  setInterval(tick, 2000);
  setInterval(() => pushReading(true), 5000);
  pushReading(true);
}

main();
