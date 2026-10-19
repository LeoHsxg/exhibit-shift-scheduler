import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import { FullPageSpinner, ToastProvider } from './ui/common';
import { Home } from './Home';

// 網址對應的頁面：
//   /e/<檔期ID>  助教填寫有空時段（老師把這個連結發給助教）
//   /admin       管理後台（Google 登入）
//   /            說明頁
const TaPage = lazy(() => import('./ta/TaPage'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

function route() {
  const path = location.pathname.replace(/\/+$/, '');
  const m = path.match(/^\/e\/([^/]+)$/);
  if (m) return <TaPage eventId={decodeURIComponent(m[1])} />;
  if (path === '/admin') return <AdminApp />;
  return <Home />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Suspense fallback={<FullPageSpinner />}>{route()}</Suspense>
    </ToastProvider>
  </StrictMode>,
);
