import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import type { AppSettings } from '../../domain';
import { toKioskMediaUrl } from '../../services/kioskApi';

import styles from './WelcomePage.module.css';

const defaultSettings: Pick<
  AppSettings,
  | 'welcomeBackgroundImage'
  | 'welcomeImagePosition'
  | 'welcomeImageScale'
  | 'welcomeLogoVisible'
  | 'welcomeMessage'
> = {
  welcomeBackgroundImage: 'images/welcome-background.svg',
  welcomeImagePosition: { x: 50, y: 50 },
  welcomeImageScale: 1,
  welcomeLogoVisible: true,
  welcomeMessage: '새로운 수평선을 만나보세요.',
};

// ponytail: fixed hold duration until the shared settings contract exposes an operator setting.
const adminHoldDurationMs = 800;

export function WelcomePage() {
  const api = useKioskApi();
  const [settings, setSettings] = useState(defaultSettings);
  const holdTimer = useRef<number | undefined>(undefined);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    void api.settings
      .read()
      .then((next) => {
        if (active) setSettings(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [api]);

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

  const imageUrl = toKioskMediaUrl(settings.welcomeBackgroundImage);
  const imagePosition = `${settings.welcomeImagePosition.x}% ${settings.welcomeImagePosition.y}%`;

  return (
    <main className={styles.shell} aria-labelledby="welcome-message">
      <div
        className={styles.background}
        data-testid="welcome-page"
        style={{
          backgroundImage: `url("${imageUrl}")`,
          backgroundPosition: imagePosition,
          backgroundSize: 'cover',
          transform: `scale(${settings.welcomeImageScale})`,
          transformOrigin: imagePosition,
        }}
      />
      <div className={styles.content}>
        {settings.welcomeLogoVisible && (
          <button
            aria-label="HIGHEST 관리자 진입"
            className={styles.logoButton}
            type="button"
            onPointerCancel={cancelAdminHold}
            onPointerDown={startAdminHold}
            onPointerLeave={cancelAdminHold}
            onPointerUp={cancelAdminHold}
          >
            HIGHEST
          </button>
        )}
        <p id="welcome-message" className={styles.message}>
          {settings.welcomeMessage}
        </p>
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
