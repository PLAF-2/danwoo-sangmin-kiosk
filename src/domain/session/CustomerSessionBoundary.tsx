import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import { resetCustomerSession } from './resetCustomerSession';

export function CustomerSessionBoundary() {
  const api = useKioskApi();
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState({ idleTimeoutSeconds: 90, idleWarningSeconds: 15 });
  const [warning, setWarning] = useState(false);
  const paused = location.pathname === '/processing' || location.pathname.startsWith('/admin');

  useEffect(() => { void api.settings.read().then(({ idleTimeoutSeconds, idleWarningSeconds }) => setSettings({ idleTimeoutSeconds, idleWarningSeconds })).catch(() => {}); }, [api]);
  useEffect(() => {
    if (paused) { setWarning(false); return; }
    let warningTimer = 0;
    let resetTimer = 0;
    const restart = () => {
      window.clearTimeout(warningTimer); window.clearTimeout(resetTimer); setWarning(false);
      warningTimer = window.setTimeout(() => setWarning(true), (settings.idleTimeoutSeconds - settings.idleWarningSeconds) * 1000);
      resetTimer = window.setTimeout(() => { resetCustomerSession(); navigate('/', { replace: true }); }, settings.idleTimeoutSeconds * 1000);
    };
    restart();
    window.addEventListener('pointerdown', restart); window.addEventListener('keydown', restart);
    return () => { window.clearTimeout(warningTimer); window.clearTimeout(resetTimer); window.removeEventListener('pointerdown', restart); window.removeEventListener('keydown', restart); };
  }, [navigate, paused, settings]);

  return <div className="kiosk-frame"><Outlet />{warning && <div aria-label="유휴 시간 경고" className="idle-warning" role="dialog"><p>{settings.idleWarningSeconds}초 후 처음 화면으로 이동합니다.</p><button onClick={() => window.dispatchEvent(new Event('pointerdown'))} type="button">계속 이용하기</button></div>}</div>;
}
