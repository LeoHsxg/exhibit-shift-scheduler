import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { app } from '../firebase';

// 只有管理後台需要登入，所以 Auth 放在這裡，助教頁不用下載
export const auth = getAuth(app);

if (import.meta.env.DEV) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
