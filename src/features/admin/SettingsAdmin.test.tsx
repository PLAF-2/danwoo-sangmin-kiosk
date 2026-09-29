import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppSettings, createCatalogData, createPaymentSettings } from '../../test/fixtures';
import { CategoriesAdmin, PaymentAdmin, WelcomeAdmin } from './SettingsAdmin';

const catalogRead = vi.fn();
const catalogSave = vi.fn();
const settingsRead = vi.fn();
const settingsSave = vi.fn();
const paymentRead = vi.fn();
const paymentSave = vi.fn();
const importWelcomeImage = vi.fn();
const selectImage = vi.fn();
const saveSquareCrop = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'kiosk', {
    configurable: true,
    value: {
      catalog: { read: catalogRead, save: catalogSave },
      settings: {
        read: settingsRead,
        save: settingsSave,
        readPayment: paymentRead,
        savePayment: paymentSave,
      },
      media: { importWelcomeImage, selectImage, saveSquareCrop },
    },
  });
  catalogRead.mockReset().mockResolvedValue(createCatalogData());
  catalogSave.mockReset().mockResolvedValue(undefined);
  settingsRead.mockReset().mockResolvedValue(createAppSettings());
  settingsSave.mockReset().mockResolvedValue(undefined);
  paymentRead.mockReset().mockResolvedValue(createPaymentSettings());
  paymentSave.mockReset().mockResolvedValue(undefined);
  importWelcomeImage.mockReset().mockResolvedValue('images/new-welcome.png');
  selectImage.mockReset();
  saveSquareCrop.mockReset();
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('category administration', () => {
  it('keeps 전체 immutable and saves added category fields', async () => {
    render(<CategoriesAdmin />);

    expect(await screen.findByDisplayValue('전체')).toBeDisabled();
    expect(screen.queryByRole('button', { name: '전체 삭제' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '카테고리 추가' }));
    fireEvent.change(screen.getByLabelText('새 카테고리 이름'), { target: { value: '포토카드' } });
    fireEvent.change(screen.getByLabelText('새 카테고리 순서'), { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('새 카테고리 노출'));
    fireEvent.click(screen.getByRole('button', { name: '카테고리 저장' }));

    await waitFor(() => expect(catalogSave).toHaveBeenCalled());
    expect(catalogSave.mock.calls[0]?.[0].categories.at(-1)).toEqual({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: '포토카드',
      isActive: false,
      displayOrder: 4,
    });
  });
});

describe('welcome administration', () => {
  it('uploads and adjusts the actual 9:16 preview before saving', async () => {
    render(<WelcomeAdmin />);

    expect(await screen.findByLabelText('9:16 웰컴 미리보기')).toHaveStyle({ aspectRatio: '9 / 16' });
    fireEvent.click(screen.getByRole('button', { name: '배경 이미지 업로드' }));
    await waitFor(() => expect(importWelcomeImage).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('가로 위치'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('세로 위치'), { target: { value: '70' } });
    fireEvent.change(screen.getByLabelText('확대 배율'), { target: { value: '1.8' } });
    fireEvent.click(screen.getByLabelText('로고 표시'));
    fireEvent.change(screen.getByLabelText('안내 문구'), { target: { value: '호라이즌에 오신 것을 환영합니다.' } });
    fireEvent.click(screen.getByRole('button', { name: '웰컴 설정 저장' }));

    await waitFor(() => expect(settingsSave).toHaveBeenCalledWith(expect.objectContaining({
      welcomeBackgroundImage: 'images/new-welcome.png',
      welcomeImagePosition: { x: 25, y: 70 },
      welcomeImageScale: 1.8,
      welcomeLogoVisible: false,
      welcomeMessage: '호라이즌에 오신 것을 환영합니다.',
    })));
  });

  it('confirms before restoring the default background', async () => {
    settingsRead.mockResolvedValue(createAppSettings({ welcomeBackgroundImage: 'images/custom.png' }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<WelcomeAdmin />);

    await screen.findByLabelText('9:16 웰컴 미리보기');
    fireEvent.click(screen.getByRole('button', { name: '기본 배경 복원' }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('9:16 웰컴 미리보기')).toHaveStyle({
      backgroundImage: expect.stringContaining('custom.png'),
    });
  });

  it('saves a welcome setting with an empty message', async () => {
    render(<WelcomeAdmin />);

    fireEvent.change(await screen.findByLabelText('안내 문구'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '웰컴 설정 저장' }));

    await waitFor(() => expect(settingsSave).toHaveBeenCalledWith(expect.objectContaining({ welcomeMessage: '' })));
  });
});

describe('payment administration', () => {
  it.each(['instant', 'simulation'] as const)('saves %s mode', async (value) => {
    render(<PaymentAdmin />);
    fireEvent.change(await screen.findByLabelText('결제 모드'), { target: { value } });
    fireEvent.click(screen.getByRole('button', { name: '결제 설정 저장' }));
    await waitFor(() => expect(paymentSave).toHaveBeenCalledWith(expect.objectContaining({ mode: value })));
  });

  it('supports all modes and saves bank QR fields after square crop', async () => {
    selectImage.mockResolvedValue({
      selectionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kind: 'square',
      previewDataUrl: 'data:image/png;base64,AA==', width: 400, height: 400,
    });
    saveSquareCrop.mockResolvedValue('images/qr.png');
    render(<PaymentAdmin />);

    const mode = await screen.findByLabelText('결제 모드');
    expect(mode).toHaveTextContent('즉시 완료');
    expect(mode).toHaveTextContent('계좌·QR 안내');
    expect(mode).toHaveTextContent('결제 시뮬레이션');
    fireEvent.change(mode, { target: { value: 'bankQr' } });
    fireEvent.change(screen.getByLabelText('은행명'), { target: { value: '하늘은행' } });
    fireEvent.change(screen.getByLabelText('계좌번호'), { target: { value: '테스트 계좌' } });
    fireEvent.change(screen.getByLabelText('예금주'), { target: { value: 'HIGHEST' } });
    fireEvent.click(screen.getByRole('button', { name: 'QR 이미지 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '이 영역 사용' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('처리 시간'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('시뮬레이션 결과'), { target: { value: 'failure' } });
    fireEvent.change(screen.getByLabelText('수령 안내'), { target: { value: '운영자에게 주문 번호를 보여주세요.' } });
    fireEvent.click(screen.getByRole('button', { name: '결제 설정 저장' }));

    await waitFor(() => expect(paymentSave).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'bankQr',
      bankName: '하늘은행',
      accountNumber: '테스트 계좌',
      accountHolder: 'HIGHEST',
      qrImage: 'images/qr.png',
      processingSeconds: 5,
      simulationResult: 'failure',
      pickupMessage: '운영자에게 주문 번호를 보여주세요.',
    })));
  });
});
