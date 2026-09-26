import { create } from 'zustand';

export interface SessionValues {
  selectedCategoryId: string | null;
  catalogScrollPosition: number;
  isProcessing: boolean;
  processingRequestId: string | null;
}

interface SessionState extends SessionValues {
  setSelectedCategoryId: (categoryId: string | null) => void;
  setCatalogScrollPosition: (position: number) => void;
  startProcessing: (requestId: string) => void;
  stopProcessing: () => void;
  reset: () => void;
}

export const initialSessionState: SessionValues = {
  selectedCategoryId: null,
  catalogScrollPosition: 0,
  isProcessing: false,
  processingRequestId: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialSessionState,
  setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
  setCatalogScrollPosition: (position) =>
    set({ catalogScrollPosition: Number.isFinite(position) ? Math.max(0, position) : 0 }),
  startProcessing: (processingRequestId) => set({ isProcessing: true, processingRequestId }),
  stopProcessing: () => set({ isProcessing: false, processingRequestId: null }),
  reset: () => set(initialSessionState),
}));
