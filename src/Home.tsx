import { Emblem } from './ui/common';

export function Home() {
  return (
    <main className="home">
      <Emblem size={48} />
      <h1 className="headline-lg">展覽助教排班</h1>
      <p className="muted">請使用老師提供的填寫連結進入。</p>
      <a className="btn btn-tertiary" href="/admin">
        管理後台
      </a>
    </main>
  );
}
