import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import { useCartStore } from '../../domain/cart/cartStore';
import type { CatalogData, PaymentSettings } from '../../domain/contracts';
import { reviewCart } from '../../domain/order/reviewCart';
import { cartLineKey, formatSelectedOptions } from '../../domain/productOptions';
import { toKioskMediaUrl } from '../../services/kioskApi';

import './checkout.css';

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
const actionLabels = { instant: '결제하기', bankQr: '입금했어요', simulation: '결제 시뮬레이션' };
const paymentModeLabels = { instant: '즉시 완료', bankQr: '계좌·QR 안내', simulation: '결제 시뮬레이션' };

export function CheckoutPage() {
  const api = useKioskApi();
  const navigate = useNavigate();
  const cartItems = useCartStore((cart) => cart.items);
  const items = Object.values(cartItems);
  const [catalog, setCatalog] = useState<CatalogData | null>(null);
  const [payment, setPayment] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [alert, setAlert] = useState('');
  const [priceReview, setPriceReview] = useState<ReturnType<typeof reviewCart> | null>(null);
  const [priceAnnotations, setPriceAnnotations] = useState<{ productId: string; before: number; after: number }[]>([]);
  const [paymentReview, setPaymentReview] = useState(false);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const leaving = useRef(false);
  const displayedReview = catalog ? reviewCart(items, catalog) : null;

  useEffect(() => {
    let active = true;
    leaving.current = false;
    setLoading(true);
    setLoadError(false);
    void Promise.all([api.catalog.read(), api.settings.readPayment()])
      .then(([nextCatalog, nextPayment]) => {
        if (!active) return;
        setCatalog(nextCatalog);
        setPayment(nextPayment);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; leaving.current = true; };
  }, [api, attempt]);

  function returnToShop() {
    leaving.current = true;
    navigate('/shop');
  }

  async function submit() {
    if (locked.current || leaving.current || loading || loadError || items.length === 0) return;
    locked.current = true;
    setPending(true);
    setAlert('');
    let proceeding = false;
    try {
      const currentItems = Object.values(useCartStore.getState().items);
      const [latestCatalog, latestPayment] = await Promise.all([
        api.catalog.read(), api.settings.readPayment(),
      ]);
      if (leaving.current) return;
      const review = reviewCart(currentItems, latestCatalog);
      const paymentChanged = !payment || Object.entries(latestPayment).some(
        ([key, value]) => payment[key as keyof PaymentSettings] !== value,
      );
      setPayment(latestPayment);
      setPaymentReview(paymentChanged);
      if (review.blockers.length > 0) {
        setPriceReview(null);
        setPriceAnnotations([]);
        setAlert(`${review.blockers.join(' ')}${paymentChanged ? ' 결제 안내가 변경되었습니다. 변경 내용을 확인해 주세요.' : ''}`);
        return;
      }
      setCatalog(latestCatalog);
      const priceChanged = (!priceReview && review.priceChanges.length > 0)
        || review.priceKey !== displayedReview?.priceKey
        || review.total !== displayedReview?.total;
      if (priceChanged || paymentChanged) {
        if (priceChanged) {
          setPriceReview(review);
          setPriceAnnotations(review.lines.flatMap(({ item, product }) => {
            const displayedPrice = displayedReview?.lines.find((line) => line.item.productId === item.productId)?.product.price;
            const before = displayedPrice !== undefined && displayedPrice !== product.price
              ? displayedPrice : item.capturedUnitPrice;
            return before === product.price ? [] : [{ productId: item.productId, before, after: product.price }];
          }));
        }
        setAlert(priceChanged && paymentChanged
          ? '상품 가격과 결제 안내가 변경되었습니다. 변경 내용을 확인해 주세요.'
          : priceChanged
            ? '상품 가격이 변경되었습니다. 변경 금액을 확인해 주세요.'
            : '결제 안내가 변경되었습니다. 변경 내용을 확인해 주세요.');
        return;
      }
      navigate('/processing', { state: {
        items: review.lines.map(({ item, product }) => ({ ...item, capturedUnitPrice: product.price })),
        payment: latestPayment,
        requestId: crypto.randomUUID(),
      } });
      proceeding = true;
    } catch {
      setAlert('주문 정보를 확인하지 못했습니다. 다시 시도해 주세요.');
    } finally {
      if (!proceeding) {
        locked.current = false;
        setPending(false);
      }
    }
  }

  const total = displayedReview?.total ?? 0;

  return (
    <main className="checkout-page">
      <header className="checkout-header">
        <button onClick={returnToShop} type="button">← 장바구니</button>
        <strong>HIGHEST</strong>
      </header>
      <h1>주문 내용을 확인해 주세요</h1>
      <section aria-label="주문 상품" className="checkout-items" data-testid="checkout-items" tabIndex={0}>
        {loading ? <p role="status">주문 정보를 불러오는 중입니다.</p> : items.length === 0 ? <p>장바구니가 비어 있습니다.</p> : items.map((item) => {
          const product = catalog?.products.find(({ id }) => id === item.productId);
          const change = priceAnnotations.find(({ productId }) => productId === item.productId);
          const options = formatSelectedOptions(item.selectedOptions);
          return (
            <article className="checkout-line" key={cartLineKey(item)}>
              {product ? <img alt={product.name} src={toKioskMediaUrl(product.thumbnailImage)} /> : <span className="checkout-thumbnail">상품 확인 필요</span>}
              <div>
                <strong>{product?.name ?? item.productId}</strong>
                {options && <span className="checkout-options">{options}</span>}
                <span>수량 {item.quantity}개</span>
                {change && <span className="checkout-price-change">{won(change.before)} → {won(change.after)}</span>}
              </div>
              <b>{won(item.quantity * (product?.price ?? item.capturedUnitPrice))}</b>
            </article>
          );
        })}
      </section>
      <section aria-label="결제 정보" className="checkout-fixed" data-testid="checkout-fixed">
        <dl className="checkout-totals">
          <div><dt>상품 금액</dt><dd>{won(total)}</dd></div>
          <div><dt>할인</dt><dd>0원</dd></div>
          <div className="checkout-total"><dt>최종 금액</dt><dd>{won(total)}</dd></div>
        </dl>
        {payment && !loading && !loadError && <div className="checkout-payment">
          <strong>{paymentModeLabels[payment.mode]}</strong>
          {payment.mode === 'bankQr' && <div className="checkout-bank">
            <img alt="입금 QR 코드" src={toKioskMediaUrl(payment.qrImage)} />
            <dl>
              <div><dt>은행</dt><dd>{payment.bankName}</dd></div>
              <div><dt>계좌 번호</dt><dd>{payment.accountNumber}</dd></div>
              <div><dt>예금주</dt><dd>{payment.accountHolder}</dd></div>
            </dl>
          </div>}
          <p>{payment.instructionText}</p>
          {payment.mode === 'bankQr' && <p>운영자가 실제 입금 내역을 확인한 후 주문을 처리합니다.</p>}
        </div>}
        {loadError && <div role="alert">주문 정보를 불러오지 못했습니다. <button onClick={() => setAttempt((value) => value + 1)} type="button">다시 불러오기</button></div>}
        {alert && <p className="checkout-alert" role="alert">{alert}</p>}
        <div className="checkout-actions">
          <button onClick={returnToShop} type="button">주문 수정하기</button>
          {payment && <button className="checkout-submit" disabled={loading || loadError || pending || items.length === 0} onClick={() => { void submit(); }} type="button">
            {priceReview && paymentReview ? '변경 내용 확인하고 계속'
              : priceReview ? '변경 금액 확인하고 계속'
                : paymentReview ? '변경된 결제 안내 확인하고 계속' : actionLabels[payment.mode]}
          </button>}
        </div>
      </section>
    </main>
  );
}
