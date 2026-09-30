import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useKioskApi } from '../../app/providers';

import defaultCatalog from '../../../data/defaults/catalog.json';
import type { CatalogData, Product, ProductOption, ProductSpecification } from '../../domain';
import { catalogDataSchema } from '../../domain/schemas';
import { SquareImagePicker } from './SquareImagePicker';

type ProductDraft = Omit<Product, 'specifications' | 'options'> & { specificationText: string; optionText: string };

const specificationsToText = (items: ProductSpecification[]) =>
  items.map(({ label, value }) => `${label}:${value}`).join('\n');

const textToSpecifications = (value: string): ProductSpecification[] =>
  value
    .split('\n')
    .map((line) => line.split(':', 2).map((part) => part.trim()))
    .filter((parts): parts is [string, string] => parts.length === 2 && parts.every(Boolean))
    .map(([label, itemValue]) => ({ label, value: itemValue }));

const optionsToText = (options: ProductOption[] = []) =>
  options.map(({ name, values }) => `${name}:${values.join(',')}`).join('\n');

const textToOptions = (value: string): ProductOption[] =>
  value
    .split('\n')
    .map((line) => line.split(':', 2).map((part) => part.trim()))
    .filter((parts): parts is [string, string] => parts.length === 2 && parts.every(Boolean))
    .map(([name, values]) => ({
      name,
      values: [...new Set(values.split(',').map((item) => item.trim()).filter(Boolean))],
    }))
    .filter(({ values }) => values.length > 0);

export function ProductAdmin() {
  const api = useKioskApi();
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void api.catalog.read().then(setCatalog).catch((cause) => {
      setError(cause instanceof Error ? cause.message : '상품을 불러오지 못했습니다.');
    });
  }, [api]);

  const activeCategories = useMemo(
    () => catalog?.categories.filter(({ isActive }) => isActive) ?? [],
    [catalog],
  );

  const persist = async (next: CatalogData, success: string) => {
    setError('');
    setMessage('');
    try {
      await api.catalog.save(next);
      setCatalog(next);
      setMessage(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.');
      return false;
    }
  };

  // Loads the planned goods shipped in data/defaults; their images are served from /images.
  const loadDefaultGoods = async () => {
    if (!window.confirm('카테고리와 상품을 기본 굿즈 목록으로 모두 바꿀까요? 주문과 화면·결제 설정은 그대로 남습니다.')) return;
    await persist(catalogDataSchema.parse(defaultCatalog), '기본 굿즈를 불러왔습니다.');
  };

  const startNew = () => {
    if (!catalog || activeCategories.length === 0) {
      setError('먼저 노출 중인 카테고리를 추가해 주세요.');
      return;
    }
    const now = new Date().toISOString();
    setDraft({
      id: crypto.randomUUID(),
      name: '',
      price: 0,
      categoryId: activeCategories[0]!.id,
      thumbnailImage: '',
      detailImages: [],
      description: '',
      specificationText: '',
      optionText: '',
      saleStatus: 'onSale',
      isVisible: true,
      displayOrder: catalog.products.length,
      maxQuantity: 1,
      createdAt: now,
      updatedAt: now,
    });
  };

  const edit = (product: Product) => {
    const { options, ...rest } = product;
    setDraft({ ...rest, specificationText: specificationsToText(product.specifications), optionText: optionsToText(options) });
  };

  const saveProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!catalog || !draft) return;
    if (!draft.thumbnailImage) {
      setError('대표 이미지를 선택해 주세요.');
      return;
    }
    const { specificationText, optionText, ...rest } = draft;
    const options = textToOptions(optionText);
    const optionNames = options.map(({ name }) => name);
    if (new Set(optionNames).size !== optionNames.length) {
      setError('옵션 이름이 중복되었습니다.');
      return;
    }
    const product: Product = {
      ...rest,
      specifications: textToSpecifications(specificationText),
      ...(options.length > 0 && { options }),
      updatedAt: new Date().toISOString(),
    };
    const exists = catalog.products.some(({ id }) => id === product.id);
    const products = exists
      ? catalog.products.map((item) => item.id === product.id ? product : item)
      : [...catalog.products, product];
    if (await persist({ ...catalog, products }, '상품을 저장했습니다.')) setDraft(null);
  };

  const clone = async (product: Product) => {
    if (!catalog) return;
    const now = new Date().toISOString();
    const copy = {
      ...product,
      id: crypto.randomUUID(),
      name: `${product.name} 복사본`,
      displayOrder: catalog.products.length,
      createdAt: now,
      updatedAt: now,
    };
    await persist({ ...catalog, products: [...catalog.products, copy] }, '상품을 복제했습니다.');
  };

  const patchProduct = async (product: Product, patch: Partial<Product>, success: string) => {
    if (!catalog) return;
    await persist({
      ...catalog,
      products: catalog.products.map((item) => item.id === product.id
        ? { ...item, ...patch, updatedAt: new Date().toISOString() }
        : item),
    }, success);
  };

  if (!catalog) return <section><h1>상품 관리</h1><p>{error || '불러오는 중…'}</p></section>;

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div><p className="admin-eyebrow">CATALOG FLIGHT LOG</p><h1>상품 관리</h1></div>
        <div className="admin-actions">
          <button type="button" onClick={() => void loadDefaultGoods()}>기본 굿즈 불러오기</button>
          <button type="button" onClick={startNew}>상품 추가</button>
        </div>
      </header>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="admin-table-wrap">
        <table>
          <thead><tr><th>상품</th><th>가격</th><th>상태</th><th>노출</th><th>순서</th><th>작업</th></tr></thead>
          <tbody>{catalog.products
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((product) => (
              <tr key={product.id}>
                <td><strong>{product.name}</strong></td>
                <td>{product.price.toLocaleString('ko-KR')}원</td>
                <td>{product.saleStatus === 'soldOut' ? '품절' : '판매 중'}</td>
                <td>{product.isVisible ? '노출' : '숨김'}</td>
                <td>{product.displayOrder}</td>
                <td className="admin-actions">
                  <button aria-label={`${product.name} 수정`} type="button" onClick={() => edit(product)}>수정</button>
                  <button aria-label={`${product.name} 복제`} type="button" onClick={() => void clone(product)}>복제</button>
                  <button
                    aria-label={`${product.name} ${product.isVisible ? '숨기기' : '노출하기'}`}
                    type="button"
                    onClick={() => {
                      if (!product.isVisible || window.confirm('이 상품을 고객 화면에서 숨길까요?')) {
                        void patchProduct(product, { isVisible: !product.isVisible }, '노출 상태를 변경했습니다.');
                      }
                    }}
                  >{product.isVisible ? '숨기기' : '노출'}</button>
                  <button
                    aria-label={`${product.name} ${product.saleStatus === 'onSale' ? '품절 처리' : '판매 재개'}`}
                    type="button"
                    onClick={() => void patchProduct(product, {
                      saleStatus: product.saleStatus === 'onSale' ? 'soldOut' : 'onSale',
                    }, '판매 상태를 변경했습니다.')}
                  >{product.saleStatus === 'onSale' ? '품절' : '판매'}</button>
                </td>
              </tr>
            ))}</tbody>
        </table>
      </div>

      {draft && (
        <div className="admin-modal" role="presentation">
          <form className="admin-editor" onSubmit={(event) => void saveProduct(event)}>
            <header><h2>{catalog.products.some(({ id }) => id === draft.id) ? '상품 수정' : '상품 추가'}</h2></header>
            <div className="admin-form-grid">
              <label>상품명<input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
              <label>가격<input min="0" required type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} /></label>
              <label>카테고리<select value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>표시 순서<input min="0" type="number" value={draft.displayOrder} onChange={(e) => setDraft({ ...draft, displayOrder: Number(e.target.value) })} /></label>
              <label>최대 수량<input min="1" required type="number" value={draft.maxQuantity} onChange={(e) => setDraft({ ...draft, maxQuantity: Number(e.target.value) })} /></label>
              <label>판매 상태<select value={draft.saleStatus} onChange={(e) => setDraft({ ...draft, saleStatus: e.target.value as Product['saleStatus'] })}><option value="onSale">판매 중</option><option value="soldOut">품절</option></select></label>
              <label className="admin-wide">설명<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
              <label className="admin-wide">상세 정보<textarea aria-describedby="spec-help" value={draft.specificationText} onChange={(e) => setDraft({ ...draft, specificationText: e.target.value })} /></label>
              <small id="spec-help" className="admin-wide">한 줄에 `항목:내용` 형식으로 입력하세요.</small>
              <label className="admin-wide">선택 옵션<textarea aria-describedby="option-help" value={draft.optionText} onChange={(e) => setDraft({ ...draft, optionText: e.target.value })} /></label>
              <small id="option-help" className="admin-wide">한 줄에 `옵션명:값1,값2` 형식으로 입력하세요. 예: `인형:단우,상민`. 비워 두면 옵션 없이 판매합니다.</small>
            </div>
            <div className="admin-media-row">
              <SquareImagePicker buttonLabel="대표 이미지 선택" onSaved={(path) => setDraft({ ...draft, thumbnailImage: path })} />
              <span>{draft.thumbnailImage || '선택 안 됨'}</span>
              <SquareImagePicker buttonLabel="상세 이미지 추가" onSaved={(path) => setDraft({ ...draft, detailImages: [...draft.detailImages, path] })} />
              <span>{draft.detailImages.length}개</span>
            </div>
            <footer className="admin-actions">
              <button type="button" onClick={() => setDraft(null)}>취소</button>
              <button type="submit">상품 저장</button>
            </footer>
          </form>
        </div>
      )}

    </section>
  );
}
