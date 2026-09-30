import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { KioskApiContext } from '../../app/providers';
import { createWebKioskApi } from '../../services/webKioskApi';
import { SquareImagePicker } from './SquareImagePicker';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

it.each([[800, 400], [400, 800]])('crops a %s by %s image at the chosen offset only after confirmation', async (width, height) => {
  const close = vi.fn();
  const bitmap = { width, height, close };
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  const blob = new Blob(['cropped'], { type: 'image/png' });
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback) {
    expect(this.width).toBe(400);
    expect(this.height).toBe(400);
    callback(blob);
  });
  const url = 'https://example.public.blob.vercel-storage.com/cropped.png';
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ url })));
  const onSaved = vi.fn();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="QR 이미지 선택" onSaved={onSaved} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('QR 이미지 선택'), { target: { files: [new File(['image'], 'rectangle.png', { type: 'image/png' })] } });
  expect(await screen.findByRole('dialog', { name: '1:1 이미지 자르기' })).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole('slider', { name: '자르기 위치' })).toHaveValue('200');
  fireEvent.change(screen.getByRole('slider', { name: '자르기 위치' }), { target: { value: '300' } });
  expect(screen.getByAltText('자르기 미리보기')).toHaveStyle({ objectPosition: width > height ? '75% 50%' : '50% 75%' });
  fireEvent.click(screen.getByRole('button', { name: '이 영역 사용' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(url));
  expect(drawImage).toHaveBeenCalledWith(bitmap, width > height ? 300 : 0, height > width ? 300 : 0, 400, 400, 0, 0, 400, 400);
  expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  const form = fetcher.mock.calls[0]?.[1]?.body as FormData;
  const uploaded = form.get('file') as File;
  expect(uploaded.type).toBe('image/png');
  expect(uploaded.size).toBe(blob.size);
  expect(close).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('cancels a browser crop without uploading', async () => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 400, close }));
  const fetcher = vi.fn<typeof fetch>();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="QR 이미지 선택" onSaved={vi.fn()} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('QR 이미지 선택'), { target: { files: [new File(['image'], 'rectangle.png', { type: 'image/png' })] } });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: '취소' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetcher).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(screen.getByLabelText('QR 이미지 선택')).toBeEnabled();
});

it('keeps the crop open with an accessible error when PNG encoding fails', async () => {
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 400, close }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(null));
  const fetcher = vi.fn<typeof fetch>();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="QR 이미지 선택" onSaved={vi.fn()} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('QR 이미지 선택'), { target: { files: [new File(['image'], 'rectangle.png', { type: 'image/png' })] } });
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: '이 영역 사용' }));
  const error = await screen.findByRole('alert');
  expect(error).toHaveTextContent('이미지를 자르지 못했습니다.');
  expect(screen.getByRole('dialog')).toContainElement(error);
  expect(screen.getByRole('button', { name: '이 영역 사용' })).toBeEnabled();
  expect(fetcher).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(2);
});

it.each(['image/svg+xml', 'image/png'])('rejects unsupported or undecodable %s without uploading', async (type) => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('Invalid image')));
  const fetcher = vi.fn<typeof fetch>();
  render(<KioskApiContext.Provider value={createWebKioskApi(fetcher)}><SquareImagePicker buttonLabel="대표 이미지 선택" onSaved={vi.fn()} /></KioskApiContext.Provider>);
  fireEvent.change(screen.getByLabelText('대표 이미지 선택'), { target: { files: [new File(['invalid'], 'invalid', { type })] } });
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
});
