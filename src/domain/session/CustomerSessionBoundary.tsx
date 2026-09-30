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
  const [remaining, setRemaining] = useState(0);
  // The welcome screen is where an idle session ends up, so it never counts down (and closes any open warning).
  const paused = location.pathname === '/' || location.pathname === '/processing' || location.pathname.startsWith('/admin');

  useEffect(() => { void api.settings.read().then(({ idleTimeoutSeconds, idleWarningSeconds }) => setSettings({ idleTimeoutSeconds, idleWarningSeconds })).catch(() => {}); }, [api]);
  useEffect(() => {
    if (paused) { setWarning(false); return; }
    let warningTimer = 0;
    let resetTimer = 0;
    let countdownTimer = 0;
    const restart = () => {
      window.clearTimeout(warningTimer); window.clearTimeout(resetTimer); window.clearInterval(countdownTimer); setWarning(false);
      warningTimer = window.setTimeout(() => {
        setRemaining(settings.idleWarningSeconds);
        setWarning(true);
        countdownTimer = window.setInterval(() => setRemaining((seconds) => Math.max(1, seconds - 1)), 1000);
      }, (settings.idleTimeoutSeconds - settings.idleWarningSeconds) * 1000);
      resetTimer = window.setTimeout(() => { resetCustomerSession(); navigate('/', { replace: true }); }, settings.idleTimeoutSeconds * 1000);
    };
    restart();
    window.addEventListener('pointerdown', restart); window.addEventListener('keydown', restart);
    return () => { window.clearTimeout(warningTimer); window.clearTimeout(resetTimer); window.clearInterval(countdownTimer); window.removeEventListener('pointerdown', restart); window.removeEventListener('keydown', restart); };
  }, [navigate, paused, settings]);

  return (
    <div className="kiosk-frame">
      <Outlet />
      {warning && (
        <div className="kiosk-dialog-backdrop" role="presentation">
          <div aria-labelledby="idle-warning-title" aria-modal="true" className="kiosk-dialog" role="dialog">
            <strong id="idle-warning-title">아직 이용 중이신가요?</strong>
            <p>{remaining}초 후 처음 화면으로 이동합니다.</p>
            <button onClick={() => window.dispatchEvent(new Event('pointerdown'))} type="button">계속 이용하기</button>
          </div>
        </div>
      )}
    </div>
  );
}
