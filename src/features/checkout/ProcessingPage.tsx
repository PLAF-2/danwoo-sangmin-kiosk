import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { ORDER_REVIEW_REQUIRED, cartItemSchema, paymentSettingsSchema, type CartItem, type PaymentSettings } from '../../domain/contracts';

import './checkout.css';

export interface ProcessingState {
  items: CartItem[];
  payment: PaymentSettings;
  requestId: string;
}

const processingStateSchema = z.object({
  items: z.array(cartItemSchema).min(1),
  payment: paymentSettingsSchema,
  requestId: z.uuid(),
});

export function ProcessingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = useMemo(() => {
    const result = processingStateSchema.safeParse(location.state);
    return result.success ? result.data : null;
  }, [location.state]);
  const [failure, setFailure] = useState<{ message: string; confirmedFailed: boolean } | null>(null);

  useEffect(() => {
    if (!state) {
      navigate('/checkout', { replace: true });
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const order = await window.kiosk.orders.create({ requestId: state.requestId, items: state.items, expectedPayment: state.payment });
        if (!active) return;
        if (order.status === 'paid' || order.status === 'received') {
          navigate(`/complete/${encodeURIComponent(order.orderNumber)}`, { replace: true });
        } else {
          setFailure({ message: '다시 시도하거나 장바구니를 확인해 주세요.', confirmedFailed: order.status === 'failed' });
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message.includes(ORDER_REVIEW_REQUIRED)) {
          navigate('/checkout', { replace: true });
          return;
        }
        setFailure({
          message: '주문을 저장하지 못했습니다. 다시 시도해 주세요.', confirmedFailed: false,
        });
      }
    }, state.payment.processingSeconds * 1000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [navigate, state]);

  if (!state) return null;
  const bankQr = state.payment.mode === 'bankQr';
  const failureHeading = bankQr ? '주문 접수에 실패했습니다'
    : state.payment.mode === 'simulation' ? '결제 시뮬레이션에 실패했습니다' : '결제 처리에 실패했습니다';

  function retry() {
    if (!state) return;
    const requestId = failure?.confirmedFailed ? crypto.randomUUID() : state.requestId;
    setFailure(null);
    navigate('/processing', { replace: true, state: { ...state, requestId } });
  }

  return (
    <main className="processing-page">
      <strong className="processing-brand">HIGHEST</strong>
      <section aria-labelledby="processing-heading" className="processing-content">
        {!failure && <div aria-hidden="true" className="processing-star">✦</div>}
        <h1 id="processing-heading">{failure ? failureHeading : bankQr ? '주문을 접수하고 있어요' : '결제를 처리하고 있어요'}</h1>
        {failure ? <>
          <p className="checkout-alert" role="alert">{failure.message}</p>
          <div className="processing-actions">
            <button onClick={retry} type="button">다시 시도</button>
            {failure.confirmedFailed && <button onClick={() => navigate('/shop')} type="button">장바구니로</button>}
          </div>
        </> : <p role="status">잠시만 기다려 주세요.</p>}
      </section>
    </main>
  );
}
