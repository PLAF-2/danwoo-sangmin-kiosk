import { useEffect, useState, type FormEvent } from 'react';
import { useKioskApi } from '../../app/providers';

import type { AppSettings, CatalogData, PaymentSettings } from '../../domain';
import { toKioskMediaUrl } from '../../services/kioskApi';
import { SquareImagePicker } from './SquareImagePicker';
import { useAdminSession } from './AdminApp';

function Feedback({ message, error }: { message: string; error: string }) {
  return <>{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</>;
}

export function CategoriesAdmin() {
  const api = useKioskApi();
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [newId, setNewId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.catalog.read().then(setCatalog).catch((cause) => setError(String(cause)));
  }, [api]);

  const add = () => {
    if (!catalog) return;
    const id = crypto.randomUUID();
    setNewId(id);
    setCatalog({
      ...catalog,
      categories: [...catalog.categories, { id, name: '', isActive: true, displayOrder: catalog.categories.length }],
    });
  };

  const save = async () => {
    if (!catalog) return;
    setError('');
    try {
      await api.catalog.save(catalog);
      setMessage('카테고리를 저장했습니다.');
      setNewId('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
    }
  };

  if (!catalog) return <section><h1>카테고리 관리</h1><p>{error || '불러오는 중…'}</p></section>;

  return (
    <section className="admin-page">
      <header className="admin-page-header"><div><p className="admin-eyebrow">CATEGORY ROUTES</p><h1>카테고리 관리</h1></div><button type="button" onClick={add}>카테고리 추가</button></header>
      <Feedback error={error} message={message} />
      <div className="admin-category-list">
        <div className="admin-category-row">
          <label>시스템 카테고리<input disabled value="전체" readOnly /></label>
          <label>순서<input disabled type="number" value="0" readOnly /></label>
          <label><input checked disabled type="checkbox" readOnly /> 노출</label>
        </div>
        {catalog.categories.map((category, index) => {
          const prefix = category.id === newId ? '새 카테고리' : category.name || `카테고리 ${index + 1}`;
          const patch = (next: Partial<typeof category>) => setCatalog({
            ...catalog,
            categories: catalog.categories.map((item) => item.id === category.id ? { ...item, ...next } : item),
          });
          return (
            <div className="admin-category-row" key={category.id}>
              <label>{prefix} 이름<input aria-label={`${prefix} 이름`} required value={category.name} onChange={(e) => patch({ name: e.target.value })} /></label>
              <label>{prefix} 순서<input aria-label={`${prefix} 순서`} min="0" type="number" value={category.displayOrder} onChange={(e) => patch({ displayOrder: Number(e.target.value) })} /></label>
              <label><input aria-label={`${prefix} 노출`} checked={category.isActive} type="checkbox" onChange={(e) => patch({ isActive: e.target.checked })} /> 노출</label>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={() => void save()}>카테고리 저장</button>
    </section>
  );
}

export function WelcomeAdmin() {
  const api = useKioskApi();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.settings.read().then(setSettings).catch((cause) => setError(String(cause)));
  }, [api]);

  const upload = async (file?: File) => {
    if (!settings) return;
    setError('');
    setUploading(true);
    try {
      const path = file && api.media.upload ? await api.media.upload(file) : await api.media.importWelcomeImage();
      if (path) setSettings((current) => current && ({ ...current, welcomeBackgroundImage: path }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지를 가져오지 못했습니다.');
    } finally {
      setUploading(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setError('');
    try {
      await api.settings.save(settings);
      setMessage('웰컴 화면 설정을 저장했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
    }
  };

  if (!settings) return <section><h1>웰컴 화면 관리</h1><p>{error || '불러오는 중…'}</p></section>;
  const imageUrl = settings.welcomeBackgroundImage ? toKioskMediaUrl(settings.welcomeBackgroundImage) : '';

  return (
    <section className="admin-page">
      <header className="admin-page-header"><div><p className="admin-eyebrow">WELCOME SKY</p><h1>웰컴 화면 관리</h1></div></header>
      <Feedback error={error} message={message} />
      <div className="admin-preview-layout">
        <div
          aria-label="9:16 웰컴 미리보기"
          className="admin-welcome-preview"
          style={{
            aspectRatio: '9 / 16',
            backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined,
            backgroundPosition: `${settings.welcomeImagePosition.x}% ${settings.welcomeImagePosition.y}%`,
            backgroundSize: `${settings.welcomeImageScale * 100}%`,
          }}
        >
          {settings.welcomeLogoVisible && <strong>HIGHEST</strong>}
          <p>{settings.welcomeMessage}</p>
        </div>
        <form className="admin-settings-form" onSubmit={(event) => void save(event)}>
          <div className="admin-actions">
            {api.media.upload ? <label>배경 이미지 업로드<input
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              type="file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void upload(file);
                event.currentTarget.value = '';
              }}
            /></label> : <button disabled={uploading} type="button" onClick={() => void upload()}>배경 이미지 업로드</button>}
            {uploading && <p role="status">이미지 업로드 중…</p>}
            <button
              type="button"
              onClick={() => {
                if (window.confirm('업로드한 배경을 지우고 기본 배경으로 복원할까요?')) {
                  setSettings({ ...settings, welcomeBackgroundImage: '' });
                }
              }}
            >기본 배경 복원</button>
          </div>
          <label>가로 위치<input max="100" min="0" type="range" value={settings.welcomeImagePosition.x} onChange={(e) => setSettings({ ...settings, welcomeImagePosition: { ...settings.welcomeImagePosition, x: Number(e.target.value) } })} /></label>
          <label>세로 위치<input max="100" min="0" type="range" value={settings.welcomeImagePosition.y} onChange={(e) => setSettings({ ...settings, welcomeImagePosition: { ...settings.welcomeImagePosition, y: Number(e.target.value) } })} /></label>
          <label>확대 배율<input max="5" min="1" step="0.1" type="range" value={settings.welcomeImageScale} onChange={(e) => setSettings({ ...settings, welcomeImageScale: Number(e.target.value) })} /></label>
          <label><input aria-label="로고 표시" checked={settings.welcomeLogoVisible} type="checkbox" onChange={(e) => setSettings({ ...settings, welcomeLogoVisible: e.target.checked })} /> 로고 표시</label>
          <label>안내 문구<textarea value={settings.welcomeMessage} onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })} /></label>
          <button disabled={uploading} type="submit">웰컴 설정 저장</button>
        </form>
      </div>
    </section>
  );
}

export function PaymentAdmin() {
  const api = useKioskApi();
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.settings.readPayment().then(setSettings).catch((cause) => setError(String(cause)));
  }, [api]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setError('');
    try {
      await api.settings.savePayment(settings);
      setMessage('결제 설정을 저장했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
    }
  };

  if (!settings) return <section><h1>결제 설정</h1><p>{error || '불러오는 중…'}</p></section>;

  return (
    <section className="admin-page">
      <header className="admin-page-header"><div><p className="admin-eyebrow">PAYMENT SIMULATOR</p><h1>결제 설정</h1></div></header>
      <Feedback error={error} message={message} />
      <form className="admin-settings-form" onSubmit={(event) => void save(event)}>
        <label>결제 모드<select value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value as PaymentSettings['mode'] })}><option value="instant">즉시 완료</option><option value="bankQr">계좌·QR 안내</option><option value="simulation">결제 시뮬레이션</option></select></label>
        {settings.mode === 'bankQr' && <fieldset><legend>계좌·QR 안내</legend>
          <label>은행명<input required value={settings.bankName} onChange={(e) => setSettings({ ...settings, bankName: e.target.value })} /></label>
          <label>계좌번호<input required value={settings.accountNumber} onChange={(e) => setSettings({ ...settings, accountNumber: e.target.value })} /></label>
          <label>예금주<input required value={settings.accountHolder} onChange={(e) => setSettings({ ...settings, accountHolder: e.target.value })} /></label>
          <div className="admin-media-row"><SquareImagePicker buttonLabel="QR 이미지 선택" onSaved={(path) => setSettings({ ...settings, qrImage: path })} /><span>{settings.qrImage || '선택 안 됨'}</span></div>
        </fieldset>}
        <label>안내 문구<textarea value={settings.instructionText} onChange={(e) => setSettings({ ...settings, instructionText: e.target.value })} /></label>
        <label>처리 시간<input max="5" min="1" type="number" value={settings.processingSeconds} onChange={(e) => setSettings({ ...settings, processingSeconds: Number(e.target.value) })} /></label>
        <label>시뮬레이션 결과<select value={settings.simulationResult} onChange={(e) => setSettings({ ...settings, simulationResult: e.target.value as PaymentSettings['simulationResult'] })}><option value="success">성공</option><option value="failure">실패</option></select></label>
        <label>수령 안내<textarea value={settings.pickupMessage} onChange={(e) => setSettings({ ...settings, pickupMessage: e.target.value })} /></label>
        <button type="submit">결제 설정 저장</button>
      </form>
    </section>
  );
}

export function SystemAdmin() {
  const api = useKioskApi();
  const { logout } = useAdminSession();
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (nextPassword !== confirmation) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }
    try {
      await api.admin.changePassword(currentPassword, nextPassword);
      await logout();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '비밀번호를 변경하지 못했습니다.');
    }
  };

  const exportBackup = async () => {
    setError('');
    try {
      const path = await api.admin.exportBackup();
      if (path) setMessage('백업을 저장했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '백업을 저장하지 못했습니다.');
    }
  };

  const importBackup = async () => {
    if (!window.confirm('검증된 백업으로 현재 상품·설정·미디어를 교체할까요?')) return;
    setError('');
    try {
      await api.admin.importBackup();
      setMessage('백업을 가져왔습니다. 고객 화면을 다시 열면 반영됩니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '백업을 가져오지 못했습니다.');
    }
  };

  return (
    <section className="admin-page">
      <header className="admin-page-header"><div><p className="admin-eyebrow">SYSTEM CONTROL</p><h1>시스템 관리</h1></div></header>
      <Feedback error={error} message={message} />
      <div className="admin-system-grid">
        <form className="admin-panel admin-settings-form" onSubmit={(event) => void changePassword(event)}>
          <h2>관리자 비밀번호</h2>
          <label>현재 비밀번호<input autoComplete="current-password" required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label>새 비밀번호<input autoComplete="new-password" minLength={8} required type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} /></label>
          <label>새 비밀번호 확인<input autoComplete="new-password" minLength={8} required type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
          <button type="submit">비밀번호 변경</button>
        </form>
        {api.admin.supportsBackup !== false && <div className="admin-panel">
          <h2>콘텐츠 백업</h2>
          <p>카탈로그, 화면·결제 설정과 관리용 미디어를 하나의 검증 가능한 파일로 관리합니다.</p>
          <div className="admin-actions">
            <button type="button" onClick={() => void exportBackup()}>백업 내보내기</button>
            <button className="danger" type="button" onClick={() => void importBackup()}>백업 가져오기</button>
          </div>
        </div>}
      </div>
    </section>
  );
}
