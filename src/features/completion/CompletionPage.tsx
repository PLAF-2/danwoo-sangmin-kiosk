import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useKioskApi } from '../../app/providers';

import { useCartStore } from '../../domain/cart/cartStore';
import type { Order } from '../../domain/contracts';
import { resetCustomerSession } from '../../domain/session/resetCustomerSession';
import { useSessionStore } from '../../domain/session/sessionStore';
import './completion.css';

const headings = { instant: '결제가 완료되었습니다', bankQr: '주문이 접수되었습니다', simulation: '결제 시뮬레이션이 완료되었습니다' };
const paymentLabels = { instant: '즉시 완료', bankQr: '계좌·QR 안내', simulation: '결제 시뮬레이션' };
const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
// The designed image already carries the logo and the "결제가 완료되었습니다" message.
const completeImageUrl = '/images/complete-kiosk.webp';
// Web orders use UUIDs; the first 8 characters are enough to read out at the counter.
const displayOrderNumber = (orderNumber: string) => (orderNumber.length > 16 ? orderNumber.slice(0, 8).toUpperCase() : orderNumber);

export function CompletionPage() {
  const api = useKioskApi();
  const { orderNumber = '' } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null | undefined>(undefined);
  const [seconds, setSeconds] = useState(20);
  const [duration, setDuration] = useState(20);
  const [pickupMessage, setPickupMessage] = useState('굿즈 수령처에서 주문번호를 보여주세요.');
  const reset = () => { resetCustomerSession(); navigate('/', { replace: true }); };

  useEffect(() => {
    let active = true;
    void Promise.all([api.orders.read(orderNumber), api.settings.read(), api.settings.readPayment()]).then(([nextOrder, settings, payment]) => {
      if (!active) return;
      setOrder(nextOrder); setDuration(settings.completionResetSeconds); setSeconds(settings.completionResetSeconds); setPickupMessage(payment.pickupMessage);
      if (nextOrder && useSessionStore.getState().completeOrder(nextOrder.orderNumber)) useCartStore.getState().clear();
    }).catch(() => { if (active) setOrder(null); });
    return () => { active = false; };
  }, [api, orderNumber]);
  useEffect(() => {
    if (!order) return;
    const timer = window.setInterval(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearInterval(timer);
  }, [order]);
  useEffect(() => { if (order && seconds <= 0) reset(); }, [order, seconds]);

  if (order === undefined) return <main className="completion-page"><p role="status">주문 정보를 불러오는 중입니다.</p></main>;
  if (!order) return <main className="completion-page completion-error"><h1>주문을 찾을 수 없습니다</h1><p>주문 번호를 확인하거나 처음 화면에서 다시 시작해 주세요.</p><button onClick={reset} type="button">처음으로</button></main>;
  return <main className="completion-page completion-page--done" onPointerDown={() => setSeconds(duration)}>
    <img alt="" className="completion-background" src={completeImageUrl} />
    <h1 className="visually-hidden">{headings[order.paymentMode]}</h1>
    <section aria-label="주문 정보" className="completion-panel">
      <div className="completion-ticket">
        <div><span>주문번호</span><strong>{displayOrderNumber(order.orderNumber)}</strong></div>
        <div><span>결제금액</span><strong>{won(order.total)}</strong><span>{paymentLabels[order.paymentMode]}</span></div>
      </div>
      <p className="completion-pickup">{pickupMessage}</p>
      {order.paymentMode === 'bankQr' && <p className="completion-pickup">운영자가 입금 내역을 확인한 후 주문을 처리합니다.</p>}
      <button className="completion-home" onClick={reset} type="button">처음으로 돌아가기</button>
      <p className="completion-countdown" aria-hidden={seconds > 5}>{seconds <= 5 ? `${seconds}초 후 처음 화면으로 이동합니다.` : ''}</p>
    </section>
  </main>;
}
