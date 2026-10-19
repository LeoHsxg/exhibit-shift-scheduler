import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// 本機開發（npm run dev）連到 Firebase Emulator，不會碰到正式資料。
// 正式網站部署在 Firebase Hosting 上，設定直接從 Hosting 自動提供的 /__/firebase/init.json 讀，
// 所以程式碼裡不用寫專案 ID；換專案或移交擁有權都不用改程式。
async function loadConfig(): Promise<FirebaseOptions> {
  if (import.meta.env.DEV) {
    return { apiKey: 'demo-key', projectId: 'demo-exhibit', authDomain: 'demo-exhibit.firebaseapp.com' };
  }
  const res = await fetch('/__/firebase/init.json');
  return res.json();
}

export const app = initializeApp(await loadConfig());
export const db = getFirestore(app);

if (import.meta.env.DEV) connectFirestoreEmulator(db, '127.0.0.1', 8080);
