import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createAppMemoryRouter } from '../../app/router';
import { createAppSettings, createCatalogData, createPaymentSettings } from '../../test/fixtures';

const authenticate = vi.fn();
const keepAlive = vi.fn();
const logout = vi.fn();
const changePassword = vi.fn();
const exportBackup = vi.fn();
const importBackup = vi.fn();

beforeEach(() => {
  Object.defineProperty(window, 'kiosk', {
    configurable: true,
    value: {
      catalog: { read: vi.fn().mockResolvedValue(createCatalogData()), save: vi.fn() },
      settings: {
        read: vi.fn().mockResolvedValue(createAppSettings()),
        save: vi.fn(),
        readPayment: vi.fn().mockResolvedValue(createPaymentSettings()),
        savePayment: vi.fn(),
      },
      media: {
        selectImage: vi.fn(),
        saveSquareCrop: vi.fn(),
        importSquareImage: vi.fn(),
        importWelcomeImage: vi.fn(),
      },
      orders: { create: vi.fn(), read: vi.fn() },
      admin: {
        authenticate,
        keepAlive,
        logout,
        changePassword,
        exportBackup,
        importBackup,
      },
    },
  });
  authenticate.mockReset();
  keepAlive.mockReset().mockResolvedValue(undefined);
  logout.mockReset().mockResolvedValue(undefined);
  changePassword.mockReset().mockResolvedValue(undefined);
  exportBackup.mockReset().mockResolvedValue('C:\\backup.json');
  importBackup.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('admin authentication', () => {
  it('redirects direct protected navigation to login', async () => {
    const router = createAppMemoryRouter(['/admin/products']);
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    router.dispose();
  });

  it('stays on login after a wrong password and opens products after success', async () => {
    authenticate.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const router = createAppMemoryRouter(['/admin/login']);
    render(<RouterProvider router={router} />);

    const input = await screen.findByLabelText('비밀번호');
    fireEvent.change(input, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('비밀번호를 확인해 주세요');

    fireEvent.change(input, { target: { value: 'correct-password' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    await screen.findByText('HORIZON Album');
    expect(screen.getByRole('heading', { name: '상품 관리' })).toBeInTheDocument();
    router.dispose();
  });

  it('logs out and returns to login after five minutes without input', async () => {
    authenticate.mockResolvedValue(true);
    const router = createAppMemoryRouter(['/admin/login']);
    render(<RouterProvider router={router} />);
    fireEvent.change(await screen.findByLabelText('비밀번호'), {
      target: { value: 'correct-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    await screen.findByText('HORIZON Album');
    expect(screen.getByRole('heading', { name: '상품 관리' })).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.pointerDown(window);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(logout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    router.dispose();
  });

  it('changes the password after confirmation and returns to login', async () => {
    authenticate.mockResolvedValue(true);
    const router = createAppMemoryRouter(['/admin/login']);
    render(<RouterProvider router={router} />);
    fireEvent.change(await screen.findByLabelText('비밀번호'), { target: { value: 'current-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    fireEvent.click(await screen.findByRole('link', { name: '시스템' }));
    expect(await screen.findByRole('heading', { name: '시스템 관리' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'current-secret' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'new-secure-password' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'new-secure-password' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 변경' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('current-secret', 'new-secure-password'));
    expect(await screen.findByRole('heading', { name: '관리자 로그인' })).toBeInTheDocument();
    router.dispose();
  });

  it('reports backup success and import failure without hiding the error', async () => {
    authenticate.mockResolvedValue(true);
    importBackup.mockRejectedValue(new Error('invalid backup'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const router = createAppMemoryRouter(['/admin/login']);
    render(<RouterProvider router={router} />);
    fireEvent.change(await screen.findByLabelText('비밀번호'), { target: { value: 'current-secret' } });
    fireEvent.click(screen.getByRole('button', { name: '로그인' }));
    fireEvent.click(await screen.findByRole('link', { name: '시스템' }));

    fireEvent.click(await screen.findByRole('button', { name: '백업 내보내기' }));
    expect(await screen.findByRole('status')).toHaveTextContent('백업을 저장했습니다');
    fireEvent.click(screen.getByRole('button', { name: '백업 가져오기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid backup');
    expect(confirm).toHaveBeenCalled();
    router.dispose();
  });
});
