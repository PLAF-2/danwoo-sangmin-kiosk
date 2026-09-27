import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom';

import './admin.css';

const idleTimeoutMs = 5 * 60 * 1000;
const keepAliveIntervalMs = 30 * 1000;

interface AdminSessionValue {
  authenticated: boolean;
  login(password: string): Promise<boolean>;
  logout(): Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSession(): AdminSessionValue {
  const session = useContext(AdminSessionContext);
  if (!session) throw new Error('Admin session provider is missing');
  return session;
}

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeepAlive = useRef(0);

  const logout = useCallback(async () => {
    setAuthenticated(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    await window.kiosk.admin.logout().catch(() => undefined);
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  const login = useCallback(async (password: string) => {
    const accepted = await window.kiosk.admin.authenticate(password);
    setAuthenticated(accepted);
    if (accepted) lastKeepAlive.current = Date.now();
    return accepted;
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    const armTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => void logout(), idleTimeoutMs);
    };
    const recordActivity = () => {
      armTimer();
      const now = Date.now();
      if (now - lastKeepAlive.current < keepAliveIntervalMs) return;
      lastKeepAlive.current = now;
      void window.kiosk.admin.keepAlive().catch(() => void logout());
    };

    armTimer();
    window.addEventListener('pointerdown', recordActivity);
    window.addEventListener('keydown', recordActivity);
    window.addEventListener('touchstart', recordActivity);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener('pointerdown', recordActivity);
      window.removeEventListener('keydown', recordActivity);
      window.removeEventListener('touchstart', recordActivity);
    };
  }, [authenticated, logout]);

  return (
    <AdminSessionContext.Provider value={{ authenticated, login, logout }}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function AdminLogin() {
  const { authenticated, login } = useAdminSession();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (authenticated) return <Navigate replace to="/admin/products" />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (await login(password)) navigate('/admin/products', { replace: true });
      else setError('비밀번호를 확인해 주세요.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="admin-login" aria-labelledby="admin-login-title">
      <form onSubmit={submit}>
        <p className="admin-eyebrow">HIGHEST · LOCAL CONTROL</p>
        <h1 id="admin-login-title">관리자 로그인</h1>
        <label>
          비밀번호
          <input
            autoComplete="current-password"
            autoFocus
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={submitting} type="submit">
          {submitting ? '확인 중…' : '로그인'}
        </button>
      </form>
    </main>
  );
}

export function AdminGuard() {
  return useAdminSession().authenticated ? <Outlet /> : <Navigate replace to="/admin/login" />;
}

const navigation = [
  ['/admin/products', '상품'],
  ['/admin/categories', '카테고리'],
  ['/admin/welcome', '웰컴'],
  ['/admin/payment', '결제'],
  ['/admin/system', '시스템'],
] as const;

export function AdminShell() {
  const { logout } = useAdminSession();
  return (
    <div className="admin-shell">
      <aside>
        <p className="admin-eyebrow">HIGHEST</p>
        <strong>운영 관리실</strong>
        <nav aria-label="관리자 메뉴">
          {navigation.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
        </nav>
        <button type="button" onClick={() => void logout()}>로그아웃</button>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}
