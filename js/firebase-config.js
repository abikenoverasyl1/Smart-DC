// ============================================================
//  Firebase баптаулары
//  1) https://console.firebase.google.com → жоба құру
//  2) Project settings → Your apps → Web app (</>) → тіркеу
//  3) Берілген firebaseConfig объектісін төменге көшіріңіз
//  4) Build → Firestore Database → Create database
//
//  Егер мұнда null қалса, сайт «жергілікті режимде» жұмыс істейді
//  (деректер браузердің localStorage-інде сақталады).
// ============================================================

export const firebaseConfig = null;

/* Мысал (өз мәндеріңізбен ауыстырыңыз):
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "smart-dc-12345.firebaseapp.com",
  projectId: "smart-dc-12345",
  storageBucket: "smart-dc-12345.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
*/
