// ============================================================
//  Деректер қоры қабаты (Firebase Firestore немесе localStorage)
//
//  Firestore құрылымы:
//   datacenter/state   — ағымдағы күй (датчиктер, құрылғылар, ережелер)
//   readings/{id}      — көрсеткіштер тарихы { t, temp, hum, load, volt, power }
//   events/{id}        — оқиғалар журналы   { t, type, level, msg }
// ============================================================
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
let mode = 'local';
let F = null;   // Firestore функциялары
let fs = null;  // Firestore дерекқоры

// localStorage-ке қауіпсіз қатынау (қолжетімсіз болса — жадта сақтаймыз)
const mem = {};
const ls = {
  get(k) {
    try { const v = localStorage.getItem(k); if (v !== null) return JSON.parse(v); } catch (e) { /* */ }
    return mem[k] ?? null;
  },
  set(k, v) {
    mem[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ }
  }
};

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

// Іске қосу: Firebase баптаулары болса — бұлтқа қосыламыз
export async function initDB() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    try {
      const app = await import(SDK + 'firebase-app.js');
      F = await import(SDK + 'firebase-firestore.js');
      fs = F.getFirestore(app.initializeApp(firebaseConfig));
      await withTimeout(F.getDoc(F.doc(fs, 'datacenter', 'state')), 8000); // байланысты тексеру
      mode = 'firebase';
    } catch (e) {
      console.warn('Firebase қолжетімсіз, жергілікті режим қосылды:', e);
      mode = 'local';
    }
  }
  return mode;
}

/* ---------- Ағымдағы күй ---------- */
export async function loadState() {
  if (mode === 'firebase') {
    const snap = await F.getDoc(F.doc(fs, 'datacenter', 'state'));
    return snap.exists() ? snap.data() : null;
  }
  return ls.get('sdc_state');
}

export async function saveState(state) {
  if (mode === 'firebase') return F.setDoc(F.doc(fs, 'datacenter', 'state'), state);
  ls.set('sdc_state', state);
}

// Басқа құрылғыдан/қойындыдан өзгеріс келсе — cb шақырылады
export function onRemoteState(cb) {
  if (mode === 'firebase') {
    return F.onSnapshot(F.doc(fs, 'datacenter', 'state'), snap => {
      if (snap.exists() && !snap.metadata.hasPendingWrites) cb(snap.data());
    });
  }
  window.addEventListener('storage', e => {
    if (e.key === 'sdc_state' && e.newValue) cb(JSON.parse(e.newValue));
  });
}

/* ---------- Көрсеткіштер тарихы ---------- */
export async function addReading(r) {
  if (mode === 'firebase') return F.addDoc(F.collection(fs, 'readings'), r);
  const arr = ls.get('sdc_readings') || [];
  arr.push(r);
  ls.set('sdc_readings', arr.slice(-300));
}

export async function getReadings(n = 60) {
  if (mode === 'firebase') {
    const q = F.query(F.collection(fs, 'readings'), F.orderBy('t', 'desc'), F.limit(n));
    const snap = await F.getDocs(q);
    return snap.docs.map(d => d.data()).reverse();
  }
  return (ls.get('sdc_readings') || []).slice(-n);
}

/* ---------- Оқиғалар журналы ---------- */
export async function addEvent(e) {
  if (mode === 'firebase') return F.addDoc(F.collection(fs, 'events'), e);
  const arr = ls.get('sdc_events') || [];
  arr.unshift(e);
  ls.set('sdc_events', arr.slice(0, 200));
}

export async function getEvents(n = 100) {
  if (mode === 'firebase') {
    const q = F.query(F.collection(fs, 'events'), F.orderBy('t', 'desc'), F.limit(n));
    const snap = await F.getDocs(q);
    return snap.docs.map(d => d.data());
  }
  return (ls.get('sdc_events') || []).slice(0, n);
}

// Журналдың нақты уақыттағы жаңаруы (тек Firebase режимінде)
export function onEvents(cb, n = 100) {
  if (mode !== 'firebase') return;
  const q = F.query(F.collection(fs, 'events'), F.orderBy('t', 'desc'), F.limit(n));
  return F.onSnapshot(q, snap => cb(snap.docs.map(d => d.data())));
}

export async function clearEvents() {
  if (mode === 'firebase') {
    const snap = await F.getDocs(F.query(F.collection(fs, 'events'), F.limit(450)));
    const batch = F.writeBatch(fs);
    snap.docs.forEach(d => batch.delete(d.ref));
    return batch.commit();
  }
  ls.set('sdc_events', []);
}
