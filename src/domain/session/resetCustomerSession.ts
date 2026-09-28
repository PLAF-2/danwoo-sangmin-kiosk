import { useCartStore } from '../cart/cartStore';
import { useSessionStore } from './sessionStore';

export function resetCustomerSession() {
  useCartStore.getState().clear();
  useSessionStore.getState().reset();
}
