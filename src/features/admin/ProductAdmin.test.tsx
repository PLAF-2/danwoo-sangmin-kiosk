import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCatalogData, createCategory, createProduct } from '../../test/fixtures';
import { ProductAdmin } from './ProductAdmin';

const read = vi.fn();
const save = vi.fn();
const upload = vi.fn();
const squareImage = (name: string) => new File(['image'], name, { type: 'image/png' });

beforeEach(() => {
  Object.defineProperty(window, 'kiosk', {
    configurable: true,
    value: {
      catalog: { read, save },
      media: { upload },
    },
  });
  read.mockReset().mockResolvedValue(createCatalogData());
  save.mockReset().mockResolvedValue(undefined);
  upload.mockReset();
  // Square images upload directly; cropping of other shapes is covered by WebMedia tests.
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 600, height: 600, close: vi.fn() }));
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('product administration', () => {
  it('adds a product after uploading its main image', async () => {
    upload.mockResolvedValue('images/cropped.png');
    render(<ProductAdmin />);

    await screen.findByText('HORIZON Album');
    fireEvent.click(screen.getByRole('button', { name: '상품 추가' }));
    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '새 포토카드' } });
    fireEvent.change(screen.getByLabelText('가격'), { target: { value: '12000' } });
    fireEvent.change(screen.getByLabelText('최대 수량'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('상세 정보'), { target: { value: '구성:포토카드 2장' } });
    fireEvent.change(screen.getByLabelText('대표 이미지 선택'), { target: { files: [squareImage('main.png')] } });

    await waitFor(() => expect(screen.getByText('images/cropped.png')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)?.[0].products.at(-1)).toMatchObject({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: '새 포토카드',
      price: 12000,
      thumbnailImage: 'images/cropped.png',
      maxQuantity: 3,
      specifications: [{ label: '구성', value: '포토카드 2장' }],
    });
  });

  it('edits order and max quantity and adds an uploaded detail image', async () => {
    upload.mockResolvedValue('images/detail.png');
    render(<ProductAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: 'HORIZON Album 수정' }));
    fireEvent.change(screen.getByLabelText('표시 순서'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('최대 수량'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('상세 이미지 추가'), { target: { files: [squareImage('detail.png')] } });
    await waitFor(() => expect(screen.getByText('2개')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls.at(-1)?.[0].products[0]).toMatchObject({
      displayOrder: 7,
      maxQuantity: 2,
      detailImages: ['images/horizon-album-detail.png', 'images/detail.png'],
    });
  });

  it('edits selectable options as one option per line and removes them when cleared', async () => {
    render(<ProductAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: 'HORIZON Album 수정' }));
    fireEvent.change(screen.getByLabelText('선택 옵션'), { target: { value: '인형: 단우, 상민, 단우\n포장:\n' } });
    fireEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const saved = save.mock.calls[0]?.[0].products[0];
    expect(saved.options).toEqual([{ name: '인형', values: ['단우', '상민'] }]);
    expect(saved).not.toHaveProperty('optionText');
    expect(saved).not.toHaveProperty('specificationText');

    read.mockResolvedValue(createCatalogData({ products: [saved] }));
    cleanup();
    render(<ProductAdmin />);
    fireEvent.click(await screen.findByRole('button', { name: 'HORIZON Album 수정' }));
    expect(screen.getByLabelText('선택 옵션')).toHaveValue('인형:단우,상민');
    fireEvent.change(screen.getByLabelText('선택 옵션'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]?.[0].products[0]).not.toHaveProperty('options');
  });

  it('rejects duplicate option names', async () => {
    render(<ProductAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: 'HORIZON Album 수정' }));
    fireEvent.change(screen.getByLabelText('선택 옵션'), { target: { value: '인형:단우\n인형:상민' } });
    fireEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('옵션 이름이 중복되었습니다.');
    expect(save).not.toHaveBeenCalled();
  });

  it('clones, hides with confirmation, and marks products sold out', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProductAdmin />);

    await screen.findByText('HORIZON Album');
    fireEvent.click(screen.getByRole('button', { name: 'HORIZON Album 복제' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0]?.[0].products[1]).toMatchObject({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'HORIZON Album 복사본',
    });

    fireEvent.click(screen.getByRole('button', { name: 'HORIZON Album 숨기기' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(confirm).toHaveBeenCalled();
    expect(save.mock.calls[1]?.[0].products[0].isVisible).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'HORIZON Album 품절 처리' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    expect(save.mock.calls[2]?.[0].products[0].saleStatus).toBe('soldOut');
  });

  it('uses active categories in the product editor', async () => {
    read.mockResolvedValue(createCatalogData({
      categories: [createCategory(), createCategory({ id: 'hidden', name: '숨김', isActive: false })],
      products: [createProduct()],
    }));
    render(<ProductAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: '상품 추가' }));
    const category = screen.getByLabelText('카테고리');
    expect(category).toHaveTextContent('앨범');
    expect(category).not.toHaveTextContent('숨김');
  });

  it('keeps the editor open when saving fails', async () => {
    save.mockRejectedValue(new Error('디스크 저장 실패'));
    render(<ProductAdmin />);

    fireEvent.click(await screen.findByRole('button', { name: 'HORIZON Album 수정' }));
    fireEvent.change(screen.getByLabelText('상품명'), { target: { value: '수정 중인 상품' } });
    fireEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('디스크 저장 실패');
    expect(screen.getByDisplayValue('수정 중인 상품')).toBeInTheDocument();
  });
});
