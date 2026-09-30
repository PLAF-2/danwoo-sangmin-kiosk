import { describe, expect, it } from 'vitest';

import { createProduct } from '../test/fixtures';
import { productSchema } from './contracts';
import { cartLineKey, formatSelectedOptions, matchesProductOptions } from './productOptions';

const dollOption = { name: '인형', values: ['단우', '상민'] };

describe('product options', () => {
  it('keeps the product id as the key for lines without options', () => {
    expect(cartLineKey({ productId: 'album' })).toBe('album');
    expect(cartLineKey({ productId: 'set', selectedOptions: [{ name: '인형', value: '단우' }] })).not.toBe(
      cartLineKey({ productId: 'set', selectedOptions: [{ name: '인형', value: '상민' }] }),
    );
  });

  it('accepts only one valid value for every option in product order', () => {
    const product = createProduct({ options: [dollOption, { name: '포장', values: ['기본'] }] });

    expect(matchesProductOptions(product, [{ name: '인형', value: '상민' }, { name: '포장', value: '기본' }])).toBe(true);
    expect(matchesProductOptions(product, [{ name: '인형', value: '상민' }])).toBe(false);
    expect(matchesProductOptions(product, [{ name: '인형', value: '기타' }, { name: '포장', value: '기본' }])).toBe(false);
    expect(matchesProductOptions(product, [{ name: '포장', value: '기본' }, { name: '인형', value: '상민' }])).toBe(false);
    expect(matchesProductOptions(createProduct(), undefined)).toBe(true);
    expect(matchesProductOptions(createProduct(), [{ name: '인형', value: '단우' }])).toBe(false);
  });

  it('formats selected options for customer-facing lines', () => {
    expect(formatSelectedOptions([{ name: '인형', value: '단우' }, { name: '포장', value: '기본' }])).toBe(
      '인형: 단우 · 포장: 기본',
    );
    expect(formatSelectedOptions(undefined)).toBe('');
  });

  it('rejects empty, duplicate, or duplicated-name product options', () => {
    expect(productSchema.safeParse(createProduct({ options: [dollOption] })).success).toBe(true);
    expect(productSchema.safeParse(createProduct({ options: [] })).success).toBe(false);
    expect(productSchema.safeParse(createProduct({ options: [{ name: '인형', values: [] }] })).success).toBe(false);
    expect(productSchema.safeParse(createProduct({ options: [{ name: '인형', values: ['단우', '단우'] }] })).success).toBe(false);
    expect(productSchema.safeParse(createProduct({ options: [dollOption, dollOption] })).success).toBe(false);
  });
});
