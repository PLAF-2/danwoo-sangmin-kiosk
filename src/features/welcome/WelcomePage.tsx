import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './WelcomePage.module.css';

// The designed welcome image ships with the app (preloaded in index.html), so the
// first screen appears immediately without waiting for settings from the API.
export const welcomeImageUrl = '/images/welcome-kiosk.webp';

// ponytail: fixed hold duration until the shared settings contract exposes an operator setting.
const adminHoldDurationMs = 800;

export function WelcomePage() {
  const holdTimer = useRef<number | undefined>(undefined);
  const navigate = useNavigate();

  const cancelAdminHold = () => {
    if (holdTimer.current !== undefined) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = undefined;
    }
  };

  useEffect(() => cancelAdminHold, []);

  const startAdminHold = () => {
    cancelAdminHold();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = undefined;
      navigate('/admin/login');
    }, adminHoldDurationMs);
  };

  return (
    <main className={styles.shell} aria-label="HIGHEST 굿즈 키오스크">
      <img
        alt="HIGHEST 단우와 상민"
        className={styles.background}
        data-testid="welcome-page"
        decoding="async"
        fetchPriority="high"
        src={welcomeImageUrl}
      />
      <div className={styles.content}>
        <button className={styles.startButton} type="button" onClick={() => navigate('/shop')}>
          굿즈 사러가기
        </button>
      </div>
      <button
        aria-label="관리자 진입"
        className={styles.adminHotspot}
        tabIndex={-1}
        type="button"
        onPointerCancel={cancelAdminHold}
        onPointerDown={startAdminHold}
        onPointerLeave={cancelAdminHold}
        onPointerUp={cancelAdminHold}
      />
    </main>
  );
}
