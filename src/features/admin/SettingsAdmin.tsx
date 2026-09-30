import { useEffect, useState, type FormEvent } from 'react';
import { useKioskApi } from '../../app/providers';

import type { CatalogData, PaymentSettings } from '../../domain';
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

  return (
    <section className="admin-page">
      <header className="admin-page-header"><div><p className="admin-eyebrow">SYSTEM CONTROL</p><h1>시스템 관리</h1></div></header>
      <Feedback error={error} message="" />
      <div className="admin-system-grid">
        <form className="admin-panel admin-settings-form" onSubmit={(event) => void changePassword(event)}>
          <h2>관리자 비밀번호</h2>
          <label>현재 비밀번호<input autoComplete="current-password" required type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
          <label>새 비밀번호<input autoComplete="new-password" minLength={8} required type="password" value={nextPassword} onChange={(e) => setNextPassword(e.target.value)} /></label>
          <label>새 비밀번호 확인<input autoComplete="new-password" minLength={8} required type="password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>
          <button type="submit">비밀번호 변경</button>
        </form>
      </div>
    </section>
  );
}
