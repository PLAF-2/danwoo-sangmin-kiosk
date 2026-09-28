import { create } from 'zustand';

export interface SessionValues {
  selectedCategoryId: string | null;
  catalogScrollPosition: number;
  isProcessing: boolean;
  processingRequestId: string | null;
  completedOrderNumber: string | null;
}

interface SessionState extends SessionValues {
  setSelectedCategoryId: (categoryId: string | null) => void;
  setCatalogScrollPosition: (position: number) => void;
  startProcessing: (requestId: string) => void;
  stopProcessing: () => void;
  completeOrder: (orderNumber: string) => boolean;
  reset: () => void;
}

export const initialSessionState: SessionValues = {
  selectedCategoryId: null,
  catalogScrollPosition: 0,
  isProcessing: false,
  processingRequestId: null,
  completedOrderNumber: null,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initialSessionState,
  setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
  setCatalogScrollPosition: (position) =>
    set({ catalogScrollPosition: Number.isFinite(position) ? Math.max(0, position) : 0 }),
  startProcessing: (processingRequestId) => set({ isProcessing: true, processingRequestId }),
  stopProcessing: () => set({ isProcessing: false, processingRequestId: null }),
  completeOrder: (orderNumber) => {
    if (get().completedOrderNumber === orderNumber) return false;
    set({ completedOrderNumber: orderNumber });
    return true;
  },
  reset: () => set(initialSessionState),
}));
