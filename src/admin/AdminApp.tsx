import { useEffect, useState } from 'react';
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { LogOut, ShieldAlert } from 'lucide-react';
import { auth } from './auth';
import { checkIsAdmin } from '../lib/api';
import { Emblem, FullPageSpinner, ThemeToggle, useToast } from '../ui/common';
import { Dashboard } from './Dashboard';
import './admin.css';

type AuthState = { kind: 'loading' } | { kind: 'signedOut' } | { kind: 'denied'; user: User } | { kind: 'admin'; user: User };

export default function AdminApp() {
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  useEffect(() => {
    document.title = '管理後台｜展覽排班';
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setState({ kind: 'signedOut' });
      setState({ kind: 'loading' });
      const ok = user.email ? await checkIsAdmin(user.email) : false;
      setState(ok ? { kind: 'admin', user } : { kind: 'denied', user });
    });
  }, []);

  if (state.kind === 'loading') return <FullPageSpinner />;
  if (state.kind === 'signedOut') return <SignIn />;
  if (state.kind === 'denied') return <Denied user={state.user} />;
  return <Dashboard user={state.user} />;
}

export function NavBar({ user, children }: { user?: User; children?: React.ReactNode }) {
  return (
    <header className="nav">
      <a className="nav-brand" href="/admin">
        <Emblem size={28} />
        <span className="wordmark">展覽排班</span>
      </a>
      <div className="nav-right">
        {children}
        <ThemeToggle />
        {user && (
          <>
            <span className="nav-email body-sm muted">{user.email}</span>
            <button className="btn btn-icon btn-ghost" onClick={() => signOut(auth)} aria-label="登出" title="登出">
              <LogOut />
            </button>
          </>
        )}
      </div>
    </header>
  );
}

function SignIn() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const signIn = async () => {
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request')
        toast('登入失敗，請再試一次', 'danger');
      setBusy(false);
    }
  };
  return (
    <div className="admin-page">
      <NavBar />
      <main className="gate">
        <div className="card gate-card">
          <h1 className="headline-md">管理後台</h1>
          <p className="muted">建立檔期、查看大家有空的時段、匯出 Excel 班表。</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={signIn} disabled={busy}>
            {busy && <span className="spinner" />}
            使用 Google 帳號登入
          </button>
        </div>
      </main>
    </div>
  );
}

function Denied({ user }: { user: User }) {
  return (
    <div className="admin-page">
      <NavBar user={user} />
      <main className="gate">
        <div className="empty">
          <ShieldAlert />
          <h1 className="title-lg">這個帳號沒有管理權限</h1>
          <p>
            目前登入的是 <strong className="num">{user.email}</strong>。如果你應該要能管理，請專案擁有者在 Firebase Console 的
            Firestore「admins」集合裡，新增一份文件 ID 是這個 email 的文件。
          </p>
          <button className="btn" onClick={() => signOut(auth)}>
            換一個帳號
          </button>
        </div>
      </main>
    </div>
  );
}
