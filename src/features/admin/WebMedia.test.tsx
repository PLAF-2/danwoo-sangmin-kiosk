import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { KioskApiContext } from '../../app/providers';
import { createWebKioskApi } from '../../services/webKioskApi';
import { createAppSettings } from '../../test/fixtures';
import { WelcomeAdmin } from './SettingsAdmin';
import { SquareImagePicker } from './SquareImagePicker';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('uploads a browser background and previews the returned URL before saving', async () => {
  const url = 'https://example.public.blob.vercel-storage.com/welcome.png';
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(JSON.stringify(createAppSettings())))
    .mockResolvedValueOnce(new Response(JSON.stringify({ url })))
    .mockResolvedValueOnce(new Response('{"ok":true}'));
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><WelcomeAdmin /></KioskApiContext.Provider>);
  const input = await screen.findByLabelText('배경 이미지 업로드');
  expect(input).toHaveAttribute('type', 'file');
  expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  fireEvent.change(input, { target: { files: [new File(['image'], 'welcome.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByLabelText('9:16 웰컴 미리보기')).toHaveStyle({ backgroundImage: `url("${url}")` }));
  fireEvent.click(screen.getByRole('button', { name: '웰컴 설정 저장' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/admin/settings', expect.objectContaining({ body: expect.stringContaining(url) })));
});

it.each(['image/png', 'image/jpeg', 'image/webp'])('uploads square %s product and QR images through an accessible input', async (type) => {
  const close = vi.fn();
  const decode = vi.fn().mockResolvedValue({ width: 400, height: 400, close });
  vi.stubGlobal('createImageBitmap', decode);
  const url = 'https://example.public.blob.vercel-storage.com/square.webp';
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ url })));
  const onSaved = vi.fn();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="대표 이미지 선택" onSaved={onSaved} /></KioskApiContext.Provider>);
  const file = new File(['image'], 'square', { type });
  fireEvent.change(screen.getByLabelText('대표 이미지 선택'), { target: { files: [file] } });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(url));
  expect(decode).toHaveBeenCalledWith(file);
  expect(close).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledWith('/api/admin/media', expect.objectContaining({ method: 'POST' }));
});

it.each([[800, 400], [400, 800]])('rejects a %s by %s image without uploading', async (width, height) => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width, height, close }));
  const fetcher = vi.fn<typeof fetch>();
  const onSaved = vi.fn();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="QR 이미지 선택" onSaved={onSaved} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('QR 이미지 선택'), { target: { files: [new File(['image'], 'rectangle.png', { type: 'image/png' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('가로와 세로가 같은 1:1 이미지');
  expect(fetcher).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('QR 이미지 선택')).toBeEnabled();
});

it.each(['image/svg+xml', 'image/png'])('rejects unsupported or undecodable %s without uploading', async (type) => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Invalid image')));
  const fetcher = vi.fn<typeof fetch>();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="대표 이미지 선택" onSaved={vi.fn()} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('대표 이미지 선택'), { target: { files: [new File(['invalid'], 'invalid', { type })] } });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});
