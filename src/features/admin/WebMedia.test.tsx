import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { KioskApiContext } from '../../app/providers';
import { createWebKioskApi } from '../../services/webKioskApi';
import { createAppSettings } from '../../test/fixtures';
import { WelcomeAdmin } from './SettingsAdmin';
import { SquareImagePicker } from './SquareImagePicker';

afterEach(cleanup);

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

it('uploads browser product and QR images through an accessible input', async () => {
  const url = 'https://example.public.blob.vercel-storage.com/square.webp';
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ url })));
  const onSaved = vi.fn();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="대표 이미지 선택" onSaved={onSaved} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('대표 이미지 선택'), { target: { files: [new File(['image'], 'square.webp', { type: 'image/webp' })] } });
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(url));
});
